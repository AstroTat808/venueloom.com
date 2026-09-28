import { createHash, randomUUID } from "node:crypto";
import { getPool, setLocalContext, withTransaction } from "./client";
import { assertVenueAccess, withTenantTransaction } from "./tenant";
import type { WorkspacePrincipal } from "./workspace";

export interface VenueCalendar {
  id: string;
  venueId: string;
  name: string;
  resourceKind: "venue" | "space" | "rental_house";
  timezone: string;
  blocksBooking: boolean;
}

export async function listVenueCalendars(principal: WorkspacePrincipal): Promise<VenueCalendar[]> {
  return withTenantTransaction(principal, async (client) => {
    const result = await client.query<{
      id: string; venue_id: string; name: string; resource_kind: VenueCalendar["resourceKind"];
      timezone: string; blocks_booking: boolean;
    }>(
      `SELECT id, venue_id, name, resource_kind, timezone, blocks_booking
         FROM venue_calendars WHERE organization_id=$1 AND active=true ORDER BY name`,
      [principal.organizationId]
    );
    return result.rows.map((row) => ({
      id: row.id, venueId: row.venue_id, name: row.name, resourceKind: row.resource_kind,
      timezone: row.timezone, blocksBooking: row.blocks_booking
    }));
  });
}

export async function createVenueCalendar(
  principal: WorkspacePrincipal,
  input: { venueId: string; name: string; resourceKind: VenueCalendar["resourceKind"]; timezone?: string }
) {
  assertVenueAccess(principal, input.venueId);
  const venue = principal.venues.find((item) => item.id === input.venueId);
  return withTenantTransaction(principal, async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO venue_calendars (id, organization_id, venue_id, name, resource_kind, timezone)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, principal.organizationId, input.venueId, input.name, input.resourceKind, input.timezone ?? venue?.timezone ?? "UTC"]
    );
    return { id };
  });
}

export async function createOAuthState(
  principal: WorkspacePrincipal,
  providerCode: string,
  state: string,
  returnPath = "/integrations"
) {
  const hash = createHash("sha256").update(state).digest("hex");
  return withTenantTransaction(principal, async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO integration_oauth_states (
        id, organization_id, membership_id, provider_code, state_hash, return_path, expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')`,
      [id, principal.organizationId, principal.membershipId, providerCode, hash, returnPath]
    );
    return id;
  });
}

export async function consumeOAuthState(providerCode: string, state: string) {
  const hash = createHash("sha256").update(state).digest("hex");
  return withTransaction(async (client) => {
    const found = await client.query<{
      id: string; organization_id: string; membership_id: string; return_path: string;
    }>(
      `SELECT id, organization_id, membership_id, return_path
         FROM integration_oauth_states
        WHERE provider_code=$1 AND state_hash=$2 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [providerCode, hash]
    );
    const row = found.rows[0];
    if (!row) return null;
    await setLocalContext(client, { organizationId: row.organization_id });
    await client.query("UPDATE integration_oauth_states SET used_at=now() WHERE id=$1", [row.id]);
    return {
      organizationId: row.organization_id,
      membershipId: row.membership_id,
      returnPath: row.return_path
    };
  });
}

export async function upsertIntegrationConnection(
  principal: WorkspacePrincipal,
  input: {
    providerCode: string;
    name: string;
    authType: "oauth" | "ical";
    externalAccountId?: string | null;
  }
) {
  return withTenantTransaction(principal, async (client) => {
    if (input.externalAccountId) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM integration_connections
          WHERE organization_id=$1 AND provider_code=$2 AND environment='production' AND external_account_id=$3
          LIMIT 1`,
        [principal.organizationId, input.providerCode, input.externalAccountId]
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE integration_connections
              SET connection_name=$3, auth_type=$4, status='active', revoked_at=NULL, updated_at=now()
            WHERE organization_id=$1 AND id=$2`,
          [principal.organizationId, existing.rows[0].id, input.name, input.authType]
        );
        return existing.rows[0].id;
      }
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO integration_connections (
        id, organization_id, provider_code, connection_name, external_account_id,
        auth_type, status, authorized_by, authorized_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'active',$7,now())`,
      [id, principal.organizationId, input.providerCode, input.name, input.externalAccountId ?? null, input.authType, principal.membershipId]
    );
    return id;
  });
}

export async function storeIntegrationSecret(
  principal: WorkspacePrincipal,
  input: { connectionId: string; purpose: string; encryptedValue: string }
) {
  return withTenantTransaction(principal, async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM integration_secrets
        WHERE organization_id=$1 AND connection_id=$2 AND purpose=$3
        ORDER BY created_at DESC LIMIT 1`,
      [principal.organizationId, input.connectionId, input.purpose]
    );
    if (existing.rows[0]) {
      await client.query(
        "UPDATE integration_secrets SET encrypted_value=$3, rotated_at=now() WHERE organization_id=$1 AND id=$2",
        [principal.organizationId, existing.rows[0].id, input.encryptedValue]
      );
      return existing.rows[0].id;
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO integration_secrets (id, organization_id, connection_id, purpose, encrypted_value)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, principal.organizationId, input.connectionId, input.purpose, input.encryptedValue]
    );
    return id;
  });
}

export async function createCalendarSyncLink(
  principal: WorkspacePrincipal,
  input: {
    connectionId: string; venueCalendarId: string; externalCalendarId: string;
    externalCalendarName?: string; syncMode: "inbound" | "outbound" | "two_way";
    blockAvailability?: boolean;
  }
) {
  return withTenantTransaction(principal, async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO calendar_sync_links (
        id, organization_id, connection_id, venue_calendar_id, external_calendar_id,
        external_calendar_name, sync_mode, block_availability
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (organization_id, connection_id, venue_calendar_id, external_calendar_id)
      DO UPDATE SET external_calendar_name=EXCLUDED.external_calendar_name,
                    sync_mode=EXCLUDED.sync_mode, block_availability=EXCLUDED.block_availability,
                    active=true, updated_at=now()`,
      [
        id, principal.organizationId, input.connectionId, input.venueCalendarId,
        input.externalCalendarId, input.externalCalendarName ?? null, input.syncMode,
        input.blockAvailability ?? true
      ]
    );
    return id;
  });
}

export async function createRentalCalendarLink(
  principal: WorkspacePrincipal,
  input: {
    providerCode: "airbnb" | "vrbo";
    venueCalendarId: string;
    listingName: string;
    encryptedInboundUrl: string;
    outboundToken: string;
  }
) {
  return withTenantTransaction(principal, async (client) => {
    const connectionId = randomUUID();
    await client.query(
      `INSERT INTO integration_connections (
        id, organization_id, provider_code, connection_name, auth_type, status,
        authorized_by, authorized_at
      ) VALUES ($1,$2,$3,$4,'ical','active',$5,now())`,
      [connectionId, principal.organizationId, input.providerCode, input.listingName, principal.membershipId]
    );
    const secretId = randomUUID();
    await client.query(
      `INSERT INTO integration_secrets (id, organization_id, connection_id, purpose, encrypted_value)
       VALUES ($1,$2,$3,'rental_ical_url',$4)`,
      [secretId, principal.organizationId, connectionId, input.encryptedInboundUrl]
    );
    const id = randomUUID();
    await client.query(
      `INSERT INTO rental_calendar_links (
        id, organization_id, connection_id, venue_calendar_id, provider_code, listing_name,
        inbound_secret_id, outbound_token_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id, principal.organizationId, connectionId, input.venueCalendarId, input.providerCode,
        input.listingName, secretId, createHash("sha256").update(input.outboundToken).digest("hex")
      ]
    );
    return { id, connectionId };
  });
}

export async function findRentalFeedByToken(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const pool = getPool();
  const result = await pool.query<{
    id: string; organization_id: string; venue_calendar_id: string; listing_name: string; timezone: string;
  }>(
    `SELECT r.id, r.organization_id, r.venue_calendar_id, r.listing_name, vc.timezone
       FROM rental_calendar_links r
       JOIN venue_calendars vc ON vc.organization_id=r.organization_id AND vc.id=r.venue_calendar_id
      WHERE r.outbound_token_hash=$1 AND r.active=true LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function listBlocksForPublicFeed(organizationId: string, venueCalendarId: string) {
  return withTransaction(async (client) => {
    await setLocalContext(client, { organizationId });
    const result = await client.query<{
      id: string; summary: string | null; starts_at: Date; ends_at: Date; all_day: boolean; status: string;
    }>(
      `SELECT id, summary, starts_at, ends_at, all_day, status
         FROM calendar_blocks
        WHERE organization_id=$1 AND venue_calendar_id=$2
          AND status <> 'cancelled'
          AND ends_at >= now() - interval '1 day'
          AND starts_at <= now() + interval '2 years'
        ORDER BY starts_at`,
      [organizationId, venueCalendarId]
    );
    return result.rows;
  });
}

export async function upsertCalendarBlockByExternalId(input: {
  organizationId: string;
  venueCalendarId: string;
  connectionId: string;
  sourceType: "google" | "microsoft" | "airbnb" | "vrbo";
  externalId: string;
  summary?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  status?: "busy" | "tentative" | "cancelled";
  payloadHash?: string;
  sourceUpdatedAt?: Date | null;
}) {
  return withTransaction(async (client) => {
    await setLocalContext(client, { organizationId: input.organizationId });
    const id = randomUUID();
    await client.query(
      `INSERT INTO calendar_blocks (
        id, organization_id, venue_calendar_id, source_type, connection_id, external_id, summary,
        starts_at, ends_at, all_day, status, payload_hash, source_updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (organization_id, connection_id, external_id)
      DO UPDATE SET summary=EXCLUDED.summary, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
                    all_day=EXCLUDED.all_day, status=EXCLUDED.status, payload_hash=EXCLUDED.payload_hash,
                    source_updated_at=EXCLUDED.source_updated_at, updated_at=now()`,
      [
        id, input.organizationId, input.venueCalendarId, input.sourceType, input.connectionId,
        input.externalId, input.summary ?? null, input.startsAt, input.endsAt, input.allDay ?? false,
        input.status ?? "busy", input.payloadHash ?? null, input.sourceUpdatedAt ?? null
      ]
    );
  });
}

export async function withOrganizationTransaction<T>(
  organizationId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>
) {
  return withTransaction(async (client) => {
    await setLocalContext(client, { organizationId });
    return fn(client);
  });
}
