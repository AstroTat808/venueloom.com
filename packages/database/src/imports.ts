import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { assertVenueAccess, withTenantTransaction } from "./tenant";
import type { WorkspacePrincipal } from "./workspace";

export type ImportEntity = "clients" | "inquiries" | "events" | "invoices" | "payments" | "vendors" | "staff";

export interface ImportCommitRow {
  rowNumber: number;
  normalized: Record<string, unknown>;
  source: Record<string, unknown>;
  issues: Array<{ message: string }>;
  outcome: "create" | "skip" | "error";
}

export interface CommitImportInput {
  entity: ImportEntity;
  sourceName: string;
  sourceHash: string;
  mapping: Record<string, string | null>;
  rows: ImportCommitRow[];
  venueId?: string | null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function ensureClient(
  client: PoolClient,
  principal: WorkspacePrincipal,
  row: Record<string, unknown>
): Promise<string | null> {
  const email = text(row.email ?? row.client_email);
  const name = text(row.name ?? row.client_name);
  if (!name && !email) return null;

  if (email) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM clients WHERE organization_id = $1 AND lower(email) = lower($2) ORDER BY created_at LIMIT 1",
      [principal.organizationId, email]
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const id = randomUUID();
  await client.query(
    `INSERT INTO clients (id, organization_id, name, email, phone, company)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      principal.organizationId,
      name ?? email ?? "Imported client",
      email,
      text(row.phone),
      text(row.company)
    ]
  );
  return id;
}

async function writeTarget(
  client: PoolClient,
  principal: WorkspacePrincipal,
  entity: ImportEntity,
  row: Record<string, unknown>,
  venueId: string | null,
  source: Record<string, unknown>
): Promise<{ targetId?: string; outcome: "create" | "skip"; reason?: string }> {
  if (entity === "clients") {
    const email = text(row.email);
    if (email) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM clients WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1",
        [principal.organizationId, email]
      );
      if (existing.rows[0]) return { targetId: existing.rows[0].id, outcome: "skip", reason: "Existing client email" };
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO clients (id, organization_id, name, email, phone, company, notes, source_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, principal.organizationId, text(row.name), email, text(row.phone), text(row.company), text(row.notes), JSON.stringify(source)]
    );
    return { targetId: id, outcome: "create" };
  }

  if (entity === "inquiries") {
    if (!venueId) throw new Error("A venue is required for inquiry imports.");
    assertVenueAccess(principal, venueId);
    const email = text(row.email);
    const date = text(row.proposed_date);
    if (email && date) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM inquiries WHERE organization_id=$1 AND venue_id=$2 AND lower(email)=lower($3) AND proposed_date=$4::date LIMIT 1",
        [principal.organizationId, venueId, email, date]
      );
      if (existing.rows[0]) return { targetId: existing.rows[0].id, outcome: "skip", reason: "Existing inquiry email/date" };
    }
    const clientId = await ensureClient(client, principal, row);
    const id = randomUUID();
    await client.query(
      `INSERT INTO inquiries (
        id, organization_id, venue_id, client_id, name, email, phone, company,
        event_name, event_type, proposed_date, guest_count, estimated_minor, status, source, source_metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id, principal.organizationId, venueId, clientId,
        text(row.name) ?? text(row.event_name) ?? "Imported inquiry",
        email, text(row.phone), text(row.company), text(row.event_name), text(row.event_type),
        date, num(row.guest_count), num(row.estimated_amount), text(row.status) ?? "new", text(row.source), JSON.stringify(source)
      ]
    );
    return { targetId: id, outcome: "create" };
  }

  if (entity === "events") {
    if (!venueId) throw new Error("A venue is required for event imports.");
    assertVenueAccess(principal, venueId);
    const start = text(row.starts_at);
    const eventName = text(row.event_name) ?? "Imported event";
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM events WHERE organization_id=$1 AND venue_id=$2 AND name=$3 AND starts_at=$4::timestamptz LIMIT 1",
      [principal.organizationId, venueId, eventName, start]
    );
    if (existing.rows[0]) return { targetId: existing.rows[0].id, outcome: "skip", reason: "Existing event name/start" };

    const clientId = await ensureClient(client, principal, row);
    const venue = principal.venues.find((item) => item.id === venueId);
    const id = randomUUID();
    const startDate = new Date(start!);
    const endValue = text(row.ends_at);
    const endDate = endValue ? new Date(endValue) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
    const historical = startDate.getTime() < Date.now();

    const venueCalendar = await client.query<{ id: string }>(
      `SELECT id FROM venue_calendars
        WHERE organization_id=$1 AND venue_id=$2 AND resource_kind='venue' AND active=true
        ORDER BY created_at LIMIT 1`,
      [principal.organizationId, venueId]
    );
    const venueCalendarId = venueCalendar.rows[0]?.id ?? null;

    if (!historical && venueCalendarId) {
      const conflict = await client.query<{ id: string }>(
        `SELECT id FROM calendar_blocks
          WHERE organization_id=$1 AND venue_calendar_id=$2 AND status <> 'cancelled'
            AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz
          LIMIT 1`,
        [principal.organizationId, venueCalendarId, startDate, endDate]
      );
      if (conflict.rows[0]) {
        throw new Error("Future event conflicts with an existing VenueLoom or connected-calendar availability block.");
      }
    }

    await client.query(
      `INSERT INTO events (
        id, organization_id, venue_id, client_id, name, event_type, starts_at, ends_at,
        timezone, guest_count, booking_minor, status, source, historical_import, source_metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'migration',$13,$14)`,
      [
        id, principal.organizationId, venueId, clientId, eventName, text(row.event_type),
        startDate, endValue ? endDate : null, venue?.timezone ?? "UTC", num(row.guest_count),
        num(row.booking_amount), text(row.status) ?? "tentative", historical, JSON.stringify(source)
      ]
    );

    if (!historical && venueCalendarId) {
      await client.query(
        `INSERT INTO calendar_blocks (
          id, organization_id, venue_calendar_id, source_type, summary, starts_at, ends_at, status
        ) VALUES ($1,$2,$3,'venueloom',$4,$5,$6,'busy')`,
        [randomUUID(), principal.organizationId, venueCalendarId, eventName, startDate, endDate]
      );
    }
    return { targetId: id, outcome: "create" };
  }

  if (entity === "invoices") {
    const number = text(row.invoice_number)!;
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM invoices WHERE organization_id=$1 AND invoice_number=$2 LIMIT 1",
      [principal.organizationId, number]
    );
    if (existing.rows[0]) return { targetId: existing.rows[0].id, outcome: "skip", reason: "Existing invoice number" };

    const id = randomUUID();
    await client.query(
      `INSERT INTO invoices (
        id, organization_id, invoice_number, client_name, client_email, issued_date, due_date,
        total_minor, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id, principal.organizationId, number, text(row.client_name) ?? "Imported client",
        text(row.client_email), text(row.issued_date), text(row.due_date),
        num(row.total_amount) ?? 0, text(row.status) ?? "issued"
      ]
    );
    return { targetId: id, outcome: "create" };
  }

  if (entity === "payments") {
    const reference = text(row.reference);
    if (reference) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM payments WHERE organization_id=$1 AND reference=$2 LIMIT 1",
        [principal.organizationId, reference]
      );
      if (existing.rows[0]) return { targetId: existing.rows[0].id, outcome: "skip", reason: "Existing payment reference" };
    }
    let invoiceId: string | null = null;
    const invoiceNumber = text(row.invoice_number);
    if (invoiceNumber) {
      const invoice = await client.query<{ id: string }>(
        "SELECT id FROM invoices WHERE organization_id=$1 AND invoice_number=$2 LIMIT 1",
        [principal.organizationId, invoiceNumber]
      );
      invoiceId = invoice.rows[0]?.id ?? null;
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO payments (
        id, organization_id, invoice_id, reference, client_name, received_date, amount_minor, method
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id, principal.organizationId, invoiceId, reference, text(row.client_name),
        text(row.received_date), num(row.amount) ?? 0, text(row.method)
      ]
    );
    return { targetId: id, outcome: "create" };
  }

  if (entity === "vendors") {
    const email = text(row.email);
    if (email) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM vendors WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1",
        [principal.organizationId, email]
      );
      if (existing.rows[0]) return { targetId: existing.rows[0].id, outcome: "skip", reason: "Existing vendor email" };
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO vendors (id, organization_id, name, contact_name, email, phone, category, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id, principal.organizationId, text(row.name), text(row.contact_name), email,
        text(row.phone), text(row.category), text(row.notes)
      ]
    );
    return { targetId: id, outcome: "create" };
  }

  const email = text(row.email);
  if (email) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM staff_profiles WHERE organization_id=$1 AND lower(email)=lower($2) LIMIT 1",
      [principal.organizationId, email]
    );
    if (existing.rows[0]) return { targetId: existing.rows[0].id, outcome: "skip", reason: "Existing staff email" };
  }
  const id = randomUUID();
  await client.query(
    `INSERT INTO staff_profiles (id, organization_id, name, email, phone, role, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, principal.organizationId, text(row.name), email, text(row.phone), text(row.role), row.active ?? true]
  );
  return { targetId: id, outcome: "create" };
}

export function makeImportCommitKey(
  sourceHash: string,
  entity: ImportEntity,
  mapping: Record<string, string | null>,
  venueId?: string | null
) {
  return createHash("sha256")
    .update(JSON.stringify({ sourceHash, entity, mapping, venueId: venueId ?? null }))
    .digest("hex");
}

export async function commitImport(
  principal: WorkspacePrincipal,
  input: CommitImportInput
) {
  const commitKey = makeImportCommitKey(input.sourceHash, input.entity, input.mapping, input.venueId);
  return withTenantTransaction(principal, async (client) => {
    const prior = await client.query<{
      id: string;
      discovered_count: number;
      create_count: number;
      skip_count: number;
      error_count: number;
      state: string;
    }>(
      `SELECT id, discovered_count, create_count, skip_count, error_count, state
         FROM import_runs WHERE organization_id=$1 AND commit_key=$2 LIMIT 1`,
      [principal.organizationId, commitKey]
    );
    if (prior.rows[0]?.state === "completed") {
      return { importRunId: prior.rows[0].id, replayed: true, totals: {
        discovered: prior.rows[0].discovered_count,
        create: prior.rows[0].create_count,
        skip: prior.rows[0].skip_count,
        error: prior.rows[0].error_count
      }};
    }

    const runId = prior.rows[0]?.id ?? randomUUID();
    if (!prior.rows[0]) {
      await client.query(
        `INSERT INTO import_runs (
          id, organization_id, venue_id, entity_type, source_type, source_name, source_sha256,
          mapping_json, commit_key, state, discovered_count, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'committing',$10,$11)`,
        [
          runId, principal.organizationId, input.venueId ?? null, input.entity,
          input.sourceName.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
          input.sourceName, input.sourceHash, JSON.stringify(input.mapping), commitKey,
          input.rows.length, principal.userId
        ]
      );
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of input.rows) {
      if (row.outcome === "error") {
        errors++;
        await client.query(
          `INSERT INTO import_rows (
            id, organization_id, import_run_id, source_row_number, source_data, normalized_data,
            outcome, issues_json
          ) VALUES ($1,$2,$3,$4,$5,$6,'error',$7)
          ON CONFLICT (organization_id, import_run_id, source_row_number) DO NOTHING`,
          [randomUUID(), principal.organizationId, runId, row.rowNumber, JSON.stringify(row.source), JSON.stringify(row.normalized), JSON.stringify(row.issues)]
        );
        continue;
      }

      if (row.outcome === "skip") {
        skipped++;
        await client.query(
          `INSERT INTO import_rows (
            id, organization_id, import_run_id, source_row_number, source_data, normalized_data,
            outcome, issues_json
          ) VALUES ($1,$2,$3,$4,$5,$6,'skip',$7)
          ON CONFLICT (organization_id, import_run_id, source_row_number) DO NOTHING`,
          [randomUUID(), principal.organizationId, runId, row.rowNumber, JSON.stringify(row.source), JSON.stringify(row.normalized), JSON.stringify(row.issues)]
        );
        continue;
      }

      try {
        const result = await writeTarget(client, principal, input.entity, row.normalized, input.venueId ?? null, row.source);
        if (result.outcome === "create") created++;
        else skipped++;

        await client.query(
          `INSERT INTO import_rows (
            id, organization_id, import_run_id, source_row_number, source_data, normalized_data,
            outcome, issues_json, target_id, committed_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
          ON CONFLICT (organization_id, import_run_id, source_row_number) DO NOTHING`,
          [
            randomUUID(), principal.organizationId, runId, row.rowNumber,
            JSON.stringify(row.source), JSON.stringify(row.normalized),
            result.outcome, JSON.stringify(result.reason ? [{ message: result.reason }] : []),
            result.targetId ?? null
          ]
        );
      } catch (error) {
        errors++;
        await client.query(
          `INSERT INTO import_rows (
            id, organization_id, import_run_id, source_row_number, source_data, normalized_data,
            outcome, issues_json
          ) VALUES ($1,$2,$3,$4,$5,$6,'error',$7)
          ON CONFLICT (organization_id, import_run_id, source_row_number) DO NOTHING`,
          [
            randomUUID(), principal.organizationId, runId, row.rowNumber,
            JSON.stringify(row.source), JSON.stringify(row.normalized),
            JSON.stringify([{ message: error instanceof Error ? error.message : "Import error" }])
          ]
        );
      }
    }

    await client.query(
      `UPDATE import_runs
          SET state='completed', create_count=$3, skip_count=$4, error_count=$5,
              completed_at=now(), updated_at=now()
        WHERE organization_id=$1 AND id=$2`,
      [principal.organizationId, runId, created, skipped, errors]
    );

    return {
      importRunId: runId,
      replayed: false,
      totals: { discovered: input.rows.length, create: created, skip: skipped, error: errors }
    };
  });
}
