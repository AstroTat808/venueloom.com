import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import {
  decryptSecret,
  encryptSecret,
  getServicePool,
  getRuntimeEnv,
  requireRuntimeEnv,
  withServiceTransaction
} from "@venueloom/database";
import {
  getCalendarAdapter,
  type CalendarProvider,
  type ExternalCalendarEvent,
  type OAuthTokenSet
} from "@venueloom/integrations";

type BindingRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  venue_id: string;
  provider_calendar_id: string;
  provider_calendar_name: string;
  sync_direction: "inbound" | "outbound" | "two_way";
  block_availability: boolean;
  cursor_value: string | null;
  cursor_window_start: string | null;
  cursor_window_end: string | null;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_token_hash: string | null;
  webhook_expires_at: string | null;
  last_synced_at: string | null;
  provider_code: CalendarProvider;
  secret_ref: string;
  ciphertext: string;
  venue_timezone: string;
};


function timezoneOffsetAt(instantMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instantMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const renderedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return renderedAsUtc - instantMs;
}

function zonedMidnight(dateOnly: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) throw new Error("Invalid all-day calendar date");
  const desiredUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0);
  let guess = desiredUtc;
  for (let iteration = 0; iteration < 3; iteration++) {
    guess = desiredUtc - timezoneOffsetAt(guess, timeZone);
  }
  return new Date(guess).toISOString();
}

function normalizeExternalEventTimes(binding: BindingRow, external: ExternalCalendarEvent): ExternalCalendarEvent {
  if (!external.allDay) return external;
  return {
    ...external,
    startsAt: zonedMidnight(external.startsAt.slice(0, 10), binding.venue_timezone),
    endsAt: zonedMidnight(external.endsAt.slice(0, 10), binding.venue_timezone)
  };
}

function providerCredentials(provider: CalendarProvider) {
  if (provider === "google-calendar") {
    return {
      clientId: requireRuntimeEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      clientSecret: getRuntimeEnv("GOOGLE_CALENDAR_CLIENT_SECRET")
    };
  }
  return {
    clientId: requireRuntimeEnv("MICROSOFT_CALENDAR_CLIENT_ID"),
    clientSecret: getRuntimeEnv("MICROSOFT_CALENDAR_CLIENT_SECRET")
  };
}

function hashEvent(input: { name: string; starts_at: string; ends_at: string; timezone: string; status: string }) {
  return createHash("sha256").update(JSON.stringify({
    name: input.name,
    starts_at: new Date(input.starts_at).toISOString(),
    ends_at: new Date(input.ends_at).toISOString(),
    timezone: input.timezone,
    status: input.status
  })).digest("hex");
}

async function loadBinding(bindingId: string): Promise<BindingRow> {
  const result = await getServicePool().query<BindingRow>(
    `SELECT b.*,c.provider_code,c.secret_ref,s.ciphertext,v.timezone AS venue_timezone
       FROM calendar_bindings b
       JOIN integration_connections c ON c.organization_id=b.organization_id AND c.id=b.connection_id
       JOIN integration_secret_envelopes s ON s.organization_id=c.organization_id AND s.id=c.secret_ref::uuid
       JOIN venues v ON v.organization_id=b.organization_id AND v.id=b.venue_id
      WHERE b.id=$1 AND b.sync_enabled=true AND c.status='active'`,
    [bindingId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Calendar binding not found");
  return row;
}

async function tokensFor(binding: BindingRow): Promise<OAuthTokenSet> {
  let tokens = JSON.parse(decryptSecret(binding.ciphertext)) as OAuthTokenSet;
  if (new Date(tokens.expiresAt).getTime() > Date.now() + 5 * 60 * 1000) return tokens;
  if (!tokens.refreshToken) throw new Error("Calendar authorization requires reauthentication");

  const adapter = getCalendarAdapter(binding.provider_code);
  const credentials = providerCredentials(binding.provider_code);
  tokens = await adapter.refreshToken({ ...credentials, refreshToken: tokens.refreshToken });
  await getServicePool().query(
    "UPDATE integration_secret_envelopes SET ciphertext=$2,rotated_at=now() WHERE id=$1",
    [binding.secret_ref, encryptSecret(JSON.stringify(tokens))]
  );
  return tokens;
}

async function openConflict(client: PoolClient, binding: BindingRow, external: ExternalCalendarEvent, internalId: string, field: string, internalValue: unknown, externalValue: unknown) {
  await client.query(
    `INSERT INTO sync_conflicts(id,organization_id,connection_id,object_type,internal_id,external_id,field_name,venueloom_value,external_value)
     SELECT $1,$2,$3,'calendar_event',$4,$5,$6,$7,$8
     WHERE NOT EXISTS (
       SELECT 1 FROM sync_conflicts
        WHERE organization_id=$2 AND connection_id=$3 AND external_id=$5 AND field_name=$6 AND state='open'
     )`,
    [randomUUID(), binding.organization_id, binding.connection_id, internalId, external.id, field, JSON.stringify(internalValue), JSON.stringify(externalValue)]
  );
}

async function hasVenueConflict(client: PoolClient, binding: BindingRow, eventId: string, startsAt: string, endsAt: string): Promise<boolean> {
  const result = await client.query<{ conflict: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM reservations
        WHERE organization_id=$1 AND venue_id=$2 AND event_id IS DISTINCT FROM $3::uuid
          AND state IN ('held','confirmed') AND starts_at<$5::timestamptz AND ends_at>$4::timestamptz
       UNION ALL
       SELECT 1 FROM calendar_blocks
        WHERE organization_id=$1 AND venue_id=$2 AND binding_id<>$6::uuid AND state='active'
          AND starts_at<$5::timestamptz AND ends_at>$4::timestamptz
       UNION ALL
       SELECT 1 FROM lodging_stays s JOIN lodging_units u ON u.organization_id=s.organization_id AND u.id=s.unit_id
        WHERE s.organization_id=$1 AND u.venue_id=$2 AND u.blocks_venue_availability=true
          AND s.status IN ('tentative','confirmed','blocked')
          AND s.starts_on < ($5::timestamptz AT TIME ZONE u.timezone)::date
          AND s.ends_on > ($4::timestamptz AT TIME ZONE u.timezone)::date
     ) AS conflict`,
    [binding.organization_id, binding.venue_id, eventId, startsAt, endsAt, binding.id]
  );
  return Boolean(result.rows[0]?.conflict);
}

async function applyInbound(binding: BindingRow, incoming: ExternalCalendarEvent) {
  const external = normalizeExternalEventTimes(binding, incoming);
  const mapping = await getServicePool().query<{ internal_id: string; last_seen_hash: string | null }>(
    `SELECT internal_id,last_seen_hash FROM external_mappings
      WHERE organization_id=$1 AND connection_id=$2 AND object_type='calendar_event' AND external_id=$3`,
    [binding.organization_id, binding.connection_id, external.id]
  );
  const internalId = mapping.rows[0]?.internal_id ?? external.venueLoomEventId;

  if (!internalId) {
    if (!binding.block_availability) return;
    if (external.cancelled) {
      await getServicePool().query(
        "UPDATE calendar_blocks SET state='cancelled',updated_at=now(),last_seen_at=now() WHERE organization_id=$1 AND binding_id=$2 AND external_event_id=$3",
        [binding.organization_id, binding.id, external.id]
      );
      return;
    }
    const sourceHash = createHash("sha256").update(JSON.stringify(external)).digest("hex");
    await getServicePool().query(
      `INSERT INTO calendar_blocks(id,organization_id,venue_id,binding_id,external_event_id,external_version,title,starts_at,ends_at,all_day,source_hash,state,last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',now())
       ON CONFLICT (organization_id,binding_id,external_event_id)
       DO UPDATE SET external_version=EXCLUDED.external_version,title=EXCLUDED.title,starts_at=EXCLUDED.starts_at,
                     ends_at=EXCLUDED.ends_at,all_day=EXCLUDED.all_day,source_hash=EXCLUDED.source_hash,
                     state='active',last_seen_at=now(),updated_at=now()`,
      [randomUUID(), binding.organization_id, binding.venue_id, binding.id, external.id, external.version ?? null,
       external.title, external.startsAt, external.endsAt, external.allDay, sourceHash]
    );
    return;
  }

  await withServiceTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [binding.venue_id]);

    const local = await client.query<{
      id: string; name: string; starts_at: string; ends_at: string; timezone: string; status: string; updated_at: string;
    }>(
      "SELECT id,name,starts_at,ends_at,timezone,status,updated_at FROM events WHERE organization_id=$1 AND id=$2 FOR UPDATE",
      [binding.organization_id, internalId]
    );
    const event = local.rows[0];
    if (!event) return;

    if (external.cancelled) {
      if (event.status === "cancelled") {
        const cancelledHash = hashEvent(event);
        await client.query(
          `INSERT INTO external_mappings(id,organization_id,connection_id,object_type,external_id,internal_id,external_version,last_seen_hash,last_pulled_at)
           VALUES ($1,$2,$3,'calendar_event',$4,$5,$6,$7,now())
           ON CONFLICT (organization_id,connection_id,object_type,external_id)
           DO UPDATE SET external_version=EXCLUDED.external_version,last_seen_hash=EXCLUDED.last_seen_hash,last_pulled_at=now(),updated_at=now()`,
          [randomUUID(), binding.organization_id, binding.connection_id, external.id, event.id, external.version ?? null, cancelledHash]
        );
        return;
      }
      await openConflict(client, binding, external, event.id, "status", event.status, "cancelled");
      return;
    }

    const localChanged = Boolean(
      binding.last_synced_at &&
      new Date(event.updated_at).getTime() > new Date(binding.last_synced_at).getTime()
    );
    const externalChanged = Boolean(
      !binding.last_synced_at ||
      !external.updatedAt ||
      new Date(external.updatedAt).getTime() > new Date(binding.last_synced_at).getTime()
    );

    if (localChanged && externalChanged) {
      await openConflict(client, binding, external, event.id, "event", {
        name: event.name, startsAt: event.starts_at, endsAt: event.ends_at
      }, {
        name: external.title, startsAt: external.startsAt, endsAt: external.endsAt
      });
      return;
    }

    if (await hasVenueConflict(client, binding, event.id, external.startsAt, external.endsAt)) {
      await openConflict(client, binding, external, event.id, "availability", {
        startsAt: event.starts_at, endsAt: event.ends_at
      }, {
        startsAt: external.startsAt, endsAt: external.endsAt
      });
      return;
    }

    await client.query(
      `UPDATE events SET name=$3,starts_at=$4,ends_at=$5,version=version+1,updated_at=now()
        WHERE organization_id=$1 AND id=$2`,
      [binding.organization_id, event.id, external.title, external.startsAt, external.endsAt]
    );
    await client.query(
      `UPDATE reservations SET starts_at=$3,ends_at=$4,updated_at=now()
        WHERE organization_id=$1 AND event_id=$2 AND state IN ('held','confirmed')`,
      [binding.organization_id, event.id, external.startsAt, external.endsAt]
    );

    const refreshed = {
      name: external.title,
      starts_at: external.startsAt,
      ends_at: external.endsAt,
      timezone: event.timezone,
      status: event.status
    };
    await client.query(
      `INSERT INTO external_mappings(id,organization_id,connection_id,object_type,external_id,internal_id,external_version,last_seen_hash,last_pulled_at)
       VALUES ($1,$2,$3,'calendar_event',$4,$5,$6,$7,now())
       ON CONFLICT (organization_id,connection_id,object_type,external_id)
       DO UPDATE SET internal_id=EXCLUDED.internal_id,external_version=EXCLUDED.external_version,
                     last_seen_hash=EXCLUDED.last_seen_hash,last_pulled_at=now(),updated_at=now()`,
      [randomUUID(), binding.organization_id, binding.connection_id, external.id, event.id, external.version ?? null, hashEvent(refreshed)]
    );
  });
}

async function pushOutbound(binding: BindingRow, tokens: OAuthTokenSet) {
  if (binding.sync_direction === "inbound") return;
  const adapter = getCalendarAdapter(binding.provider_code);
  const events = await getServicePool().query<{
    id: string; name: string; starts_at: string; ends_at: string; timezone: string; status: string;
    external_id: string | null; last_seen_hash: string | null;
  }>(
    `SELECT e.id,e.name,e.starts_at,e.ends_at,e.timezone,e.status,m.external_id,m.last_seen_hash
       FROM events e
       LEFT JOIN external_mappings m
         ON m.organization_id=e.organization_id AND m.connection_id=$3 AND m.object_type='calendar_event' AND m.internal_id=e.id
      WHERE e.organization_id=$1 AND e.venue_id=$2 AND e.status IN ('tentative','confirmed','cancelled')
        AND e.ends_at>now()-interval '90 days' AND e.starts_at<now()+interval '730 days'`,
    [binding.organization_id, binding.venue_id, binding.connection_id]
  );

  for (const event of events.rows) {
    const localHash = hashEvent(event);
    if (event.last_seen_hash === localHash) continue;

    if (event.status === "cancelled") {
      if (event.external_id) {
        await adapter.deleteEvent({
          tokens,
          calendarId: binding.provider_calendar_id,
          externalEventId: event.external_id
        });
        await getServicePool().query(
          `UPDATE external_mappings
              SET last_seen_hash=$4,last_pushed_at=now(),updated_at=now()
            WHERE organization_id=$1 AND connection_id=$2 AND object_type='calendar_event' AND external_id=$3`,
          [binding.organization_id, binding.connection_id, event.external_id, localHash]
        );
      }
      continue;
    }

    const pushed = await adapter.upsertEvent({
      tokens,
      calendarId: binding.provider_calendar_id,
      externalEventId: event.external_id ?? undefined,
      event: {
        title: event.name,
        startsAt: new Date(event.starts_at).toISOString(),
        endsAt: new Date(event.ends_at).toISOString(),
        timezone: event.timezone,
        venueLoomEventId: event.id
      }
    });
    await getServicePool().query(
      `INSERT INTO external_mappings(id,organization_id,connection_id,object_type,external_id,internal_id,external_version,last_seen_hash,last_pushed_at)
       VALUES ($1,$2,$3,'calendar_event',$4,$5,$6,$7,now())
       ON CONFLICT (organization_id,connection_id,object_type,external_id)
       DO UPDATE SET internal_id=EXCLUDED.internal_id,external_version=EXCLUDED.external_version,last_seen_hash=EXCLUDED.last_seen_hash,last_pushed_at=now(),updated_at=now()`,
      [randomUUID(), binding.organization_id, binding.connection_id, pushed.id, event.id, pushed.version ?? null, localHash]
    );
  }
}

async function ensureWatch(binding: BindingRow, tokens: OAuthTokenSet) {
  if (binding.webhook_expires_at && new Date(binding.webhook_expires_at).getTime() > Date.now() + 24 * 60 * 60 * 1000) return;
  const baseUrl = requireRuntimeEnv("PUBLIC_APP_URL").replace(/\/$/, "");
  const adapter = getCalendarAdapter(binding.provider_code);
  const verificationToken = randomBytes(24).toString("base64url");
  const channelId = randomUUID();
  const providerPath = binding.provider_code === "google-calendar" ? "google" : "microsoft";
  const watch = await adapter.createWatch({
    tokens,
    calendarId: binding.provider_calendar_id,
    webhookUrl: `${baseUrl}/api/webhooks/calendar/${providerPath}`,
    verificationToken,
    channelId
  });
  await getServicePool().query(
    `UPDATE calendar_bindings
        SET webhook_channel_id=$3,webhook_resource_id=$4,webhook_token_hash=$5,webhook_expires_at=$6,updated_at=now()
      WHERE organization_id=$1 AND id=$2`,
    [binding.organization_id, binding.id, watch.channelId, watch.resourceId ?? null,
     createHash("sha256").update(verificationToken).digest("hex"), watch.expiresAt]
  );
}

export async function syncCalendarBinding(bindingId: string): Promise<void> {
  const binding = await loadBinding(bindingId);
  const tokens = await tokensFor(binding);
  const adapter = getCalendarAdapter(binding.provider_code);
  const now = Date.now();
  const windowStart = binding.cursor_window_start ?? new Date(now - 90 * 86400000).toISOString();
  const windowEnd = binding.cursor_window_end ?? new Date(now + 730 * 86400000).toISOString();

  if (binding.sync_direction !== "outbound") {
    const fullResync = !binding.cursor_value;
    const syncStartedAt = new Date().toISOString();
    try {
      const pulled = await adapter.pullChanges({
        tokens,
        calendarId: binding.provider_calendar_id,
        cursor: binding.cursor_value,
        windowStart,
        windowEnd
      });
      for (const event of pulled.events) await applyInbound(binding, event);
      if (fullResync) {
        await getServicePool().query(
          `UPDATE calendar_blocks
              SET state='cancelled',updated_at=now()
            WHERE organization_id=$1 AND binding_id=$2 AND state='active'
              AND last_seen_at<$3::timestamptz
              AND starts_at<$5::timestamptz AND ends_at>$4::timestamptz`,
          [binding.organization_id, binding.id, syncStartedAt, windowStart, windowEnd]
        );
      }
      await getServicePool().query(
        `UPDATE calendar_bindings SET cursor_value=$3,cursor_window_start=$4,cursor_window_end=$5,last_synced_at=now(),last_error=NULL,updated_at=now()
          WHERE organization_id=$1 AND id=$2`,
        [binding.organization_id, binding.id, pulled.nextCursor, windowStart, windowEnd]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/410|sync token|delta/i.test(message)) {
        await getServicePool().query(
          "UPDATE calendar_bindings SET cursor_value=NULL,last_error=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",
          [binding.organization_id, binding.id, "Provider cursor expired; full resync queued."]
        );
      } else throw error;
    }
  }

  await pushOutbound(binding, tokens);
  await ensureWatch(binding, tokens);
  await getServicePool().query(
    "UPDATE calendar_bindings SET last_synced_at=now(),last_error=NULL,updated_at=now() WHERE organization_id=$1 AND id=$2",
    [binding.organization_id, binding.id]
  );
}

export async function enqueueCalendarWebhook(input: {
  provider: "google" | "microsoft";
  channelId: string;
  verificationToken?: string | null;
}): Promise<boolean> {
  const tokenHash = input.verificationToken
    ? createHash("sha256").update(input.verificationToken).digest("hex")
    : null;
  const expectedProvider = input.provider === "google" ? "google-calendar" : "outlook-calendar";
  const result = await getServicePool().query<{ organization_id: string; id: string; webhook_token_hash: string | null }>(
    `SELECT b.organization_id,b.id,b.webhook_token_hash
       FROM calendar_bindings b
       JOIN integration_connections c ON c.organization_id=b.organization_id AND c.id=b.connection_id
      WHERE b.webhook_channel_id=$1 AND b.sync_enabled=true AND c.provider_code=$2 AND c.status='active'`,
    [input.channelId, expectedProvider]
  );
  const binding = result.rows[0];
  if (!binding) return false;
  if (binding.webhook_token_hash && binding.webhook_token_hash !== tokenHash) return false;
  await getServicePool().query(
    "INSERT INTO integration_sync_queue(id,organization_id,binding_id,reason) VALUES ($1,$2,$3,'webhook') ON CONFLICT DO NOTHING",
    [randomUUID(), binding.organization_id, binding.id]
  );
  return true;
}

export async function queueDueCalendarBindings(): Promise<number> {
  const result = await getServicePool().query<{ id: string; organization_id: string }>(
    `SELECT id,organization_id FROM calendar_bindings
      WHERE sync_enabled=true AND (last_synced_at IS NULL OR last_synced_at<now()-interval '15 minutes')
      LIMIT 100`
  );
  for (const row of result.rows) {
    await getServicePool().query(
      `INSERT INTO integration_sync_queue(id,organization_id,binding_id,reason)
       SELECT $1,$2,$3,'reconcile'
       WHERE NOT EXISTS (SELECT 1 FROM integration_sync_queue WHERE binding_id=$3 AND completed_at IS NULL AND dead_lettered_at IS NULL)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), row.organization_id, row.id]
    );
  }
  return result.rows.length;
}
