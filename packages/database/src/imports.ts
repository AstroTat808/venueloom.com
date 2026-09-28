import { randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import type { ImportEntity, ImportPreview } from "@venueloom/importer";
import type { TenantSession } from "./types";

export interface ImportCommitInput {
  entity: ImportEntity;
  sourceName: string;
  sourceSha256: string;
  mapping: Record<string, string | null>;
  preview: ImportPreview;
  venueId?: string | null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}
function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function upsertClient(
  client: PoolClient,
  organizationId: string,
  row: Record<string, unknown>,
  source: string
): Promise<string | null> {
  const name = text(row.name) ?? text(row.client_name);
  if (!name) return null;
  const email = text(row.email) ?? text(row.client_email);
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const id = randomUUID();

  if (normalizedEmail) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO clients(id,organization_id,name,email,normalized_email,phone,organization_name,notes,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (organization_id, normalized_email) WHERE normalized_email IS NOT NULL
       DO UPDATE SET name=EXCLUDED.name, phone=COALESCE(EXCLUDED.phone,clients.phone),
                     organization_name=COALESCE(EXCLUDED.organization_name,clients.organization_name),
                     notes=COALESCE(EXCLUDED.notes,clients.notes), updated_at=now()
       RETURNING id`,
      [id, organizationId, name, email, normalizedEmail, text(row.phone), text(row.company), text(row.notes), source]
    );
    return result.rows[0]?.id ?? null;
  }

  await client.query(
    "INSERT INTO clients(id,organization_id,name,email,phone,organization_name,notes,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, organizationId, name, email, text(row.phone), text(row.company), text(row.notes), source]
  );
  return id;
}

async function venueHasConflict(
  client: PoolClient,
  organizationId: string,
  venueId: string,
  startsAt: string,
  endsAt: string
): Promise<boolean> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [venueId]);
  const result = await client.query<{ conflict: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM reservations
        WHERE organization_id=$1 AND venue_id=$2 AND state IN ('held','confirmed')
          AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz
       UNION ALL
       SELECT 1 FROM calendar_blocks
        WHERE organization_id=$1 AND venue_id=$2 AND state='active'
          AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz
       UNION ALL
       SELECT 1
         FROM lodging_stays s
         JOIN lodging_units u ON u.organization_id=s.organization_id AND u.id=s.unit_id
        WHERE s.organization_id=$1 AND u.venue_id=$2 AND u.blocks_venue_availability=true
          AND s.status IN ('tentative','confirmed','blocked')
          AND s.starts_on < ($4::timestamptz AT TIME ZONE u.timezone)::date
          AND s.ends_on > ($3::timestamptz AT TIME ZONE u.timezone)::date
     ) AS conflict`,
    [organizationId, venueId, startsAt, endsAt]
  );
  return Boolean(result.rows[0]?.conflict);
}

async function commitTarget(
  client: PoolClient,
  session: TenantSession,
  entity: ImportEntity,
  row: Record<string, unknown>,
  venueId: string | null,
  source: string
): Promise<{ targetId?: string; outcome: "create" | "update" | "skip" | "conflict"; issue?: string }> {
  const org = session.organizationId;

  if (entity === "clients") {
    const targetId = await upsertClient(client, org, row, source);
    return targetId ? { targetId, outcome: "update" } : { outcome: "skip" };
  }

  if (entity === "inquiries") {
    const clientId = await upsertClient(client, org, row, source);
    const id = randomUUID();
    await client.query(
      `INSERT INTO inquiries(id,organization_id,venue_id,client_id,name,contact_email,contact_phone,event_type,proposed_date,guests,estimated_minor,currency,source,status,custom_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD',$12,$13,$14)`,
      [
        id, org, venueId, clientId, text(row.event_name) ?? text(row.name) ?? "Imported inquiry",
        text(row.email), text(row.phone), text(row.event_type), text(row.proposed_date),
        numberValue(row.guest_count), numberValue(row.estimated_amount), text(row.source) ?? source,
        text(row.status) ?? "new", row.custom_fields ?? {}
      ]
    );
    return { targetId: id, outcome: "create" };
  }

  if (entity === "events") {
    if (!venueId) return { outcome: "conflict", issue: "Select a venue before importing events." };
    const clientId = await upsertClient(client, org, row, source);
    const startsAt = text(row.starts_at);
    if (!startsAt) return { outcome: "conflict", issue: "Event start time is required." };
    const endsAt = text(row.ends_at) ?? new Date(new Date(startsAt).getTime() + 4 * 60 * 60 * 1000).toISOString();
    const id = randomUUID();
    const isHistorical = new Date(endsAt).getTime() < Date.now();
    const conflict = !isHistorical && await venueHasConflict(client, org, venueId, startsAt, endsAt);
    const status = conflict ? "tentative" : (text(row.status)?.toLowerCase() === "cancelled" ? "cancelled" : "confirmed");

    await client.query(
      `INSERT INTO events(id,organization_id,venue_id,client_id,name,event_type,starts_at,ends_at,timezone,guests,booking_minor,currency,status,custom_fields)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,v.timezone,$9,$10,'USD',$11,$12 FROM venues v WHERE v.organization_id=$2 AND v.id=$3`,
      [id, org, venueId, clientId, text(row.event_name) ?? "Imported event", text(row.event_type), startsAt, endsAt,
       numberValue(row.guest_count), numberValue(row.booking_amount), status, row.custom_fields ?? {}]
    );

    if (!isHistorical && !conflict && status !== "cancelled") {
      await client.query(
        "INSERT INTO reservations(id,organization_id,venue_id,event_id,starts_at,ends_at,state) VALUES ($1,$2,$3,$4,$5,$6,'confirmed')",
        [randomUUID(), org, venueId, id, startsAt, endsAt]
      );
    }

    return conflict
      ? { targetId: id, outcome: "conflict", issue: "Imported as tentative because the venue is already blocked." }
      : { targetId: id, outcome: "create" };
  }

  if (entity === "invoices") {
    const clientId = await upsertClient(client, org, { name: row.client_name, email: row.client_email }, source);
    const id = randomUUID();
    try {
      await client.query(
        `INSERT INTO invoices(id,organization_id,venue_id,client_id,document_number,issued_date,due_date,total_minor,currency,status,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,$10)`,
        [id, org, venueId, clientId, text(row.invoice_number), text(row.issued_date), text(row.due_date),
         numberValue(row.total_amount) ?? 0, text(row.status) ?? "issued", source]
      );
      return { targetId: id, outcome: "create" };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return { outcome: "skip", issue: "Invoice number already exists." };
      throw error;
    }
  }

  if (entity === "payments") {
    const clientId = await upsertClient(client, org, { name: row.client_name }, source);
    const invoiceNumber = text(row.invoice_number);
    let invoiceId: string | null = null;
    if (invoiceNumber) {
      const invoice = await client.query<{ id: string }>(
        "SELECT id FROM invoices WHERE organization_id=$1 AND document_number=$2",
        [org, invoiceNumber]
      );
      invoiceId = invoice.rows[0]?.id ?? null;
    }
    const id = randomUUID();
    try {
      await client.query(
        `INSERT INTO payments(id,organization_id,venue_id,client_id,invoice_id,reference,amount_minor,currency,received_date,method,status,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'USD',$8,$9,'paid',$10)`,
        [id, org, venueId, clientId, invoiceId, text(row.reference), numberValue(row.amount) ?? 0,
         text(row.received_date), text(row.method), source]
      );
      return { targetId: id, outcome: "create" };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return { outcome: "skip", issue: "Payment reference already exists." };
      throw error;
    }
  }

  if (entity === "vendors") {
    const id = randomUUID();
    const email = text(row.email);
    const normalizedEmail = email?.toLowerCase() ?? null;
    if (normalizedEmail) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO vendors(id,organization_id,name,contact_name,email,normalized_email,phone,category,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (organization_id,normalized_email) WHERE normalized_email IS NOT NULL
         DO UPDATE SET name=EXCLUDED.name,contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,
                       category=EXCLUDED.category,notes=EXCLUDED.notes,updated_at=now()
         RETURNING id`,
        [id, org, text(row.name) ?? "Imported vendor", text(row.contact_name), email, normalizedEmail, text(row.phone), text(row.category), text(row.notes)]
      );
      return { targetId: result.rows[0]?.id, outcome: "update" };
    }
    await client.query(
      "INSERT INTO vendors(id,organization_id,name,contact_name,email,phone,category,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, org, text(row.name) ?? "Imported vendor", text(row.contact_name), email, text(row.phone), text(row.category), text(row.notes)]
    );
    return { targetId: id, outcome: "create" };
  }

  const id = randomUUID();
  const email = text(row.email);
  const normalizedEmail = email?.toLowerCase() ?? null;
  if (normalizedEmail) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO staff_profiles(id,organization_id,name,email,normalized_email,phone,role_title,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true))
       ON CONFLICT (organization_id,normalized_email) WHERE normalized_email IS NOT NULL
       DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,role_title=EXCLUDED.role_title,active=EXCLUDED.active,updated_at=now()
       RETURNING id`,
      [id, org, text(row.name) ?? "Imported staff", email, normalizedEmail, text(row.phone), text(row.role), row.active]
    );
    return { targetId: result.rows[0]?.id, outcome: "update" };
  }
  await client.query(
    "INSERT INTO staff_profiles(id,organization_id,name,email,phone,role_title,active) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,true))",
    [id, org, text(row.name) ?? "Imported staff", email, text(row.phone), text(row.role), row.active]
  );
  return { targetId: id, outcome: "create" };
}

export async function commitImportPreview(
  client: PoolClient,
  session: TenantSession,
  input: ImportCommitInput
): Promise<{ importRunId: string; created: number; updated: number; skipped: number; conflicts: number }> {
  if (input.preview.totals.error > 0) throw new Error("Resolve all validation errors before committing the migration.");
  const venueId = input.venueId ?? session.defaultVenueId;
  if (venueId && !session.venueIds.includes(venueId)) throw new Error("Venue access denied");

  const importRunId = randomUUID();
  await client.query(
    `INSERT INTO import_runs(id,organization_id,venue_id,entity_type,source_type,source_name,source_sha256,mapping_json,state,
      discovered_count,create_count,skip_count,error_count,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'committing',$9,0,0,0,$10)`,
    [
      importRunId, session.organizationId, venueId, input.entity,
      input.sourceName.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
      input.sourceName, input.sourceSha256, input.mapping, input.preview.totals.discovered, session.userId
    ]
  );

  let created = 0, updated = 0, skipped = 0, conflicts = 0;
  for (const row of input.preview.rows) {
    if (row.outcome === "skip") {
      skipped++;
      await client.query(
        "INSERT INTO import_rows(id,organization_id,import_run_id,source_row_number,source_data,normalized_data,outcome,issues_json) VALUES ($1,$2,$3,$4,$5,$6,'skip',$7)",
        [randomUUID(), session.organizationId, importRunId, row.rowNumber, row.source, row.normalized, row.issues]
      );
      continue;
    }
    const result = await commitTarget(client, session, input.entity, row.normalized, venueId, input.sourceName);
    if (result.outcome === "create") created++;
    if (result.outcome === "update") updated++;
    if (result.outcome === "skip") skipped++;
    if (result.outcome === "conflict") conflicts++;
    const issues = result.issue ? [...row.issues, { code: "commit", message: result.issue }] : row.issues;
    await client.query(
      `INSERT INTO import_rows(id,organization_id,import_run_id,source_row_number,source_data,normalized_data,outcome,issues_json,target_id,committed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
      [randomUUID(), session.organizationId, importRunId, row.rowNumber, row.source, row.normalized, result.outcome, issues, result.targetId ?? null]
    );
  }

  await client.query(
    `UPDATE import_runs SET state='completed',create_count=$2,skip_count=$3,error_count=0,completed_at=now(),updated_at=now()
     WHERE organization_id=$1 AND id=$4`,
    [session.organizationId, created + updated, skipped + conflicts, importRunId]
  );
  return { importRunId, created, updated, skipped, conflicts };
}
