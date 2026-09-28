import { randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import type { TenantSession } from "./types";

export type ConflictResolution = "venueloom" | "external" | "merged" | "ignored";

export async function listOpenSyncConflicts(client: PoolClient, organizationId: string) {
  const result = await client.query(
    `SELECT sc.id,sc.object_type,sc.internal_id,sc.external_id,sc.field_name,
            sc.venueloom_value,sc.external_value,sc.created_at,
            c.provider_code,c.connection_name,
            e.name AS event_name,e.venue_id
       FROM sync_conflicts sc
       LEFT JOIN integration_connections c
         ON c.organization_id=sc.organization_id AND c.id=sc.connection_id
       LEFT JOIN events e
         ON e.organization_id=sc.organization_id AND e.id=sc.internal_id
      WHERE sc.organization_id=$1 AND sc.state='open'
      ORDER BY sc.created_at DESC`,
    [organizationId]
  );
  return result.rows;
}

async function queueConnectionBindings(
  client: PoolClient,
  organizationId: string,
  connectionId: string | null
): Promise<void> {
  if (!connectionId) return;
  const bindings = await client.query<{ id: string }>(
    "SELECT id FROM calendar_bindings WHERE organization_id=$1 AND connection_id=$2 AND sync_enabled=true",
    [organizationId, connectionId]
  );
  for (const binding of bindings.rows) {
    await client.query(
      `INSERT INTO integration_sync_queue(id,organization_id,binding_id,reason)
       SELECT $1,$2,$3,'conflict-resolved'
       WHERE NOT EXISTS (
         SELECT 1 FROM integration_sync_queue
          WHERE organization_id=$2 AND binding_id=$3 AND completed_at IS NULL
       )`,
      [randomUUID(), organizationId, binding.id]
    );
  }
}

async function eventAvailabilityConflict(
  client: PoolClient,
  organizationId: string,
  eventId: string,
  venueId: string,
  startsAt: string,
  endsAt: string
): Promise<boolean> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [venueId]);
  const result = await client.query<{ conflict: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM reservations
        WHERE organization_id=$1 AND venue_id=$2
          AND event_id IS DISTINCT FROM $3::uuid
          AND state IN ('held','confirmed')
          AND starts_at < $5::timestamptz AND ends_at > $4::timestamptz
       UNION ALL
       SELECT 1 FROM calendar_blocks
        WHERE organization_id=$1 AND venue_id=$2 AND state='active'
          AND starts_at < $5::timestamptz AND ends_at > $4::timestamptz
       UNION ALL
       SELECT 1
         FROM lodging_stays s
         JOIN lodging_units u
           ON u.organization_id=s.organization_id AND u.id=s.unit_id
        WHERE s.organization_id=$1 AND u.venue_id=$2 AND u.blocks_venue_availability=true
          AND s.status IN ('tentative','confirmed','blocked')
          AND s.starts_on < ($5::timestamptz AT TIME ZONE u.timezone)::date
          AND s.ends_on > ($4::timestamptz AT TIME ZONE u.timezone)::date
     ) AS conflict`,
    [organizationId, venueId, eventId, startsAt, endsAt]
  );
  return Boolean(result.rows[0]?.conflict);
}

export async function resolveSyncConflict(
  client: PoolClient,
  session: TenantSession,
  conflictId: string,
  input: {
    resolution: ConflictResolution;
    mergedValue?: { name?: string; startsAt?: string; endsAt?: string };
  }
): Promise<void> {
  const result = await client.query<{
    id: string;
    connection_id: string | null;
    object_type: string;
    internal_id: string | null;
    field_name: string;
    external_value: unknown;
  }>(
    `SELECT id,connection_id,object_type,internal_id,field_name,external_value
       FROM sync_conflicts
      WHERE organization_id=$1 AND id=$2 AND state='open'
      FOR UPDATE`,
    [session.organizationId, conflictId]
  );
  const conflict = result.rows[0];
  if (!conflict) throw new Error("Conflict is no longer open");

  if (input.resolution === "ignored" || input.resolution === "venueloom") {
    await client.query(
      `UPDATE sync_conflicts
          SET state=$3,resolution=$4,resolved_by=$5,resolved_at=now()
        WHERE organization_id=$1 AND id=$2`,
      [
        session.organizationId,
        conflictId,
        input.resolution === "ignored" ? "ignored" : "resolved",
        input.resolution,
        session.userId
      ]
    );
    if (input.resolution === "venueloom") {
      await queueConnectionBindings(client, session.organizationId, conflict.connection_id);
    }
    return;
  }

  if (conflict.object_type !== "calendar_event" || !conflict.internal_id) {
    throw new Error("External/merged resolution is not supported for this conflict type");
  }

  const eventResult = await client.query<{
    id: string;
    venue_id: string;
    name: string;
    starts_at: string;
    ends_at: string;
    status: string;
  }>(
    "SELECT id,venue_id,name,starts_at,ends_at,status FROM events WHERE organization_id=$1 AND id=$2 FOR UPDATE",
    [session.organizationId, conflict.internal_id]
  );
  const event = eventResult.rows[0];
  if (!event) throw new Error("Event no longer exists");
  if (!session.venueIds.includes(event.venue_id)) throw new Error("Venue access denied");

  const external =
    typeof conflict.external_value === "object" && conflict.external_value !== null
      ? conflict.external_value as Record<string, unknown>
      : {};
  const chosen = input.resolution === "merged" ? (input.mergedValue ?? {}) : external;

  if (conflict.field_name === "status" && input.resolution === "external") {
    const status = typeof conflict.external_value === "string"
      ? conflict.external_value
      : String((external as Record<string, unknown>).status ?? "");
    if (status !== "cancelled") throw new Error("Unsupported external event status");
    await client.query(
      "UPDATE events SET status='cancelled',version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2",
      [session.organizationId, event.id]
    );
    await client.query(
      "UPDATE reservations SET state='released',updated_at=now() WHERE organization_id=$1 AND event_id=$2 AND state IN ('held','confirmed')",
      [session.organizationId, event.id]
    );
  } else {
    const name = typeof chosen.name === "string" && chosen.name.trim() ? chosen.name.trim() : event.name;
    const startsAt = typeof chosen.startsAt === "string"
      ? chosen.startsAt
      : typeof chosen.starts_at === "string"
        ? chosen.starts_at
        : event.starts_at;
    const endsAt = typeof chosen.endsAt === "string"
      ? chosen.endsAt
      : typeof chosen.ends_at === "string"
        ? chosen.ends_at
        : event.ends_at;

    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      throw new Error("Event end must be after the start");
    }
    if (await eventAvailabilityConflict(client, session.organizationId, event.id, event.venue_id, startsAt, endsAt)) {
      throw new Error("The selected external/merged time conflicts with another reservation, calendar block, or lodging stay");
    }

    await client.query(
      `UPDATE events
          SET name=$3,starts_at=$4,ends_at=$5,version=version+1,updated_at=now()
        WHERE organization_id=$1 AND id=$2`,
      [session.organizationId, event.id, name, startsAt, endsAt]
    );
    await client.query(
      `UPDATE reservations SET starts_at=$3,ends_at=$4,updated_at=now()
        WHERE organization_id=$1 AND event_id=$2 AND state IN ('held','confirmed')`,
      [session.organizationId, event.id, startsAt, endsAt]
    );
  }

  await client.query(
    `UPDATE sync_conflicts
        SET state='resolved',resolution=$3,resolved_by=$4,resolved_at=now()
      WHERE organization_id=$1 AND id=$2`,
    [session.organizationId, conflictId, input.resolution, session.userId]
  );
  await queueConnectionBindings(client, session.organizationId, conflict.connection_id);
}
