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
  const organizationId = state.split(".")[0] ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  return withTransaction(async (client) => {
    await setLocalContext(client, { organizationId });
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
    await client.query("UPDATE integration_oauth_states SET used_at=now() WHERE organization_id=$1 AND id=$2", [row.organization_id, row.id]);
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
    organization_id: string; venue_calendar_id: string; connection_id: string;
    provider_code: "airbnb" | "vrbo"; listing_name: string; timezone: string;
  }>("SELECT * FROM venueloom_resolve_rental_feed($1)", [tokenHash]);
  return result.rows[0] ?? null;
}

export async function listBlocksForPublicFeed(organizationId: string, venueCalendarId: string, excludeConnectionId?: string | null) {
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
          AND ($3::uuid IS NULL OR connection_id IS DISTINCT FROM $3::uuid)
        ORDER BY starts_at`,
      [organizationId, venueCalendarId, excludeConnectionId ?? null]
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

export async function listSyncTenantIds(): Promise<string[]> {
  const result = await getPool().query<{ organization_id: string }>(
    "SELECT organization_id FROM venueloom_sync_tenant_ids()"
  );
  return result.rows.map((row) => row.organization_id);
}

export interface CalendarLinkRuntime {
  id: string;
  organizationId: string;
  connectionId: string;
  providerCode: "google-calendar" | "outlook-calendar";
  venueCalendarId: string;
  externalCalendarId: string;
  syncMode: "inbound" | "outbound" | "two_way";
  blockAvailability: boolean;
  syncCursor: string | null;
  webhookChannelId: string | null;
  webhookResourceId: string | null;
  webhookClientState: string | null;
  webhookExpiresAt: Date | null;
  encryptedToken: string | null;
}

export async function listCalendarLinksForOrganization(organizationId: string): Promise<CalendarLinkRuntime[]> {
  return withOrganizationTransaction(organizationId, async (client) => {
    const result = await client.query<{
      id: string; connection_id: string; provider_code: CalendarLinkRuntime["providerCode"];
      venue_calendar_id: string; external_calendar_id: string; sync_mode: CalendarLinkRuntime["syncMode"];
      block_availability: boolean; sync_cursor: string | null; webhook_channel_id: string | null;
      webhook_resource_id: string | null; webhook_client_state: string | null; webhook_expires_at: Date | null;
      encrypted_value: string | null;
    }>(
      `SELECT l.id, l.connection_id, c.provider_code, l.venue_calendar_id, l.external_calendar_id,
              l.sync_mode, l.block_availability, l.sync_cursor, l.webhook_channel_id,
              l.webhook_resource_id, l.webhook_client_state, l.webhook_expires_at,
              s.encrypted_value
         FROM calendar_sync_links l
         JOIN integration_connections c
           ON c.organization_id=l.organization_id AND c.id=l.connection_id
         LEFT JOIN LATERAL (
           SELECT encrypted_value
           FROM integration_secrets s
           WHERE s.organization_id=l.organization_id
             AND s.connection_id=l.connection_id
             AND s.purpose='oauth_tokens'
           ORDER BY s.created_at DESC LIMIT 1
         ) s ON true
        WHERE l.organization_id=$1 AND l.active=true AND c.status='active'
        ORDER BY l.created_at`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId,
      connectionId: row.connection_id,
      providerCode: row.provider_code,
      venueCalendarId: row.venue_calendar_id,
      externalCalendarId: row.external_calendar_id,
      syncMode: row.sync_mode,
      blockAvailability: row.block_availability,
      syncCursor: row.sync_cursor,
      webhookChannelId: row.webhook_channel_id,
      webhookResourceId: row.webhook_resource_id,
      webhookClientState: row.webhook_client_state,
      webhookExpiresAt: row.webhook_expires_at,
      encryptedToken: row.encrypted_value
    }));
  });
}

export async function getCalendarLinkForOrganization(
  organizationId: string,
  linkId: string
): Promise<CalendarLinkRuntime | null> {
  const links = await listCalendarLinksForOrganization(organizationId);
  return links.find((link) => link.id === linkId) ?? null;
}

export async function updateCalendarLinkState(
  organizationId: string,
  linkId: string,
  patch: {
    syncCursor?: string | null;
    webhookChannelId?: string | null;
    webhookResourceId?: string | null;
    webhookClientState?: string | null;
    webhookExpiresAt?: Date | null;
    lastError?: string | null;
    syncedNow?: boolean;
  }
) {
  return withOrganizationTransaction(organizationId, async (client) => {
    await client.query(
      `UPDATE calendar_sync_links
          SET sync_cursor = CASE WHEN $3::boolean THEN $4 ELSE sync_cursor END,
              webhook_channel_id = CASE WHEN $5::boolean THEN $6 ELSE webhook_channel_id END,
              webhook_resource_id = CASE WHEN $7::boolean THEN $8 ELSE webhook_resource_id END,
              webhook_client_state = CASE WHEN $9::boolean THEN $10 ELSE webhook_client_state END,
              webhook_expires_at = CASE WHEN $11::boolean THEN $12 ELSE webhook_expires_at END,
              last_error = CASE WHEN $13::boolean THEN $14 ELSE last_error END,
              last_sync_at = CASE WHEN $15::boolean THEN now() ELSE last_sync_at END,
              updated_at = now()
        WHERE organization_id=$1 AND id=$2`,
      [
        organizationId, linkId,
        Object.prototype.hasOwnProperty.call(patch, "syncCursor"), patch.syncCursor ?? null,
        Object.prototype.hasOwnProperty.call(patch, "webhookChannelId"), patch.webhookChannelId ?? null,
        Object.prototype.hasOwnProperty.call(patch, "webhookResourceId"), patch.webhookResourceId ?? null,
        Object.prototype.hasOwnProperty.call(patch, "webhookClientState"), patch.webhookClientState ?? null,
        Object.prototype.hasOwnProperty.call(patch, "webhookExpiresAt"), patch.webhookExpiresAt ?? null,
        Object.prototype.hasOwnProperty.call(patch, "lastError"), patch.lastError ?? null,
        patch.syncedNow ?? false
      ]
    );
  });
}

export async function getConnectionSecret(
  organizationId: string,
  connectionId: string,
  purpose: string
): Promise<string | null> {
  return withOrganizationTransaction(organizationId, async (client) => {
    const result = await client.query<{ encrypted_value: string }>(
      `SELECT encrypted_value FROM integration_secrets
        WHERE organization_id=$1 AND connection_id=$2 AND purpose=$3
        ORDER BY created_at DESC LIMIT 1`,
      [organizationId, connectionId, purpose]
    );
    return result.rows[0]?.encrypted_value ?? null;
  });
}

export interface RentalLinkRuntime {
  id: string;
  organizationId: string;
  connectionId: string;
  venueCalendarId: string;
  providerCode: "airbnb" | "vrbo";
  listingName: string;
  encryptedInboundUrl: string | null;
  lastEtag: string | null;
  lastModified: string | null;
}

export async function listRentalLinksForOrganization(organizationId: string): Promise<RentalLinkRuntime[]> {
  return withOrganizationTransaction(organizationId, async (client) => {
    const result = await client.query<{
      id: string; connection_id: string; venue_calendar_id: string; provider_code: "airbnb" | "vrbo";
      listing_name: string; encrypted_value: string | null; last_etag: string | null; last_modified: string | null;
    }>(
      `SELECT r.id, r.connection_id, r.venue_calendar_id, r.provider_code, r.listing_name,
              s.encrypted_value, r.last_etag, r.last_modified
         FROM rental_calendar_links r
         LEFT JOIN integration_secrets s
           ON s.organization_id=r.organization_id AND s.id=r.inbound_secret_id
        WHERE r.organization_id=$1 AND r.active=true
        ORDER BY r.created_at`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      id: row.id, organizationId, connectionId: row.connection_id,
      venueCalendarId: row.venue_calendar_id, providerCode: row.provider_code,
      listingName: row.listing_name, encryptedInboundUrl: row.encrypted_value,
      lastEtag: row.last_etag, lastModified: row.last_modified
    }));
  });
}

export async function updateRentalLinkSyncState(
  organizationId: string,
  linkId: string,
  patch: { etag?: string | null; lastModified?: string | null; error?: string | null }
) {
  return withOrganizationTransaction(organizationId, async (client) => {
    await client.query(
      `UPDATE rental_calendar_links
          SET last_etag=COALESCE($3,last_etag),
              last_modified=COALESCE($4,last_modified),
              last_error=$5,
              last_sync_at=CASE WHEN $5 IS NULL THEN now() ELSE last_sync_at END,
              updated_at=now()
        WHERE organization_id=$1 AND id=$2`,
      [organizationId, linkId, patch.etag ?? null, patch.lastModified ?? null, patch.error ?? null]
    );
  });
}

export async function listVenueLoomBlocksForOutbound(
  organizationId: string,
  venueCalendarId: string
) {
  return withOrganizationTransaction(organizationId, async (client) => {
    const result = await client.query<{
      id: string; summary: string | null; starts_at: Date; ends_at: Date; all_day: boolean; updated_at: Date;
    }>(
      `SELECT id, summary, starts_at, ends_at, all_day, updated_at
         FROM calendar_blocks
        WHERE organization_id=$1 AND venue_calendar_id=$2
          AND source_type='venueloom' AND status <> 'cancelled'
          AND ends_at >= now() - interval '30 days'
          AND starts_at <= now() + interval '2 years'
        ORDER BY starts_at`,
      [organizationId, venueCalendarId]
    );
    return result.rows;
  });
}

export async function getExternalMapping(
  organizationId: string,
  connectionId: string,
  internalId: string
) {
  return withOrganizationTransaction(organizationId, async (client) => {
    const result = await client.query<{ external_id: string; external_version: string | null; last_seen_hash: string | null }>(
      `SELECT external_id, external_version, last_seen_hash
         FROM external_mappings
        WHERE organization_id=$1 AND connection_id=$2 AND object_type='calendar_event' AND internal_id=$3
        LIMIT 1`,
      [organizationId, connectionId, internalId]
    );
    return result.rows[0] ?? null;
  });
}

export async function upsertExternalCalendarMapping(input: {
  organizationId: string; connectionId: string; internalId: string; externalId: string;
  externalVersion?: string | null; hash?: string | null;
}) {
  return withOrganizationTransaction(input.organizationId, async (client) => {
    await client.query(
      `INSERT INTO external_mappings (
        id, organization_id, connection_id, object_type, external_id, internal_id,
        external_version, last_seen_hash, last_pushed_at
      ) VALUES ($1,$2,$3,'calendar_event',$4,$5,$6,$7,now())
      ON CONFLICT (organization_id, connection_id, object_type, external_id)
      DO UPDATE SET internal_id=EXCLUDED.internal_id, external_version=EXCLUDED.external_version,
                    last_seen_hash=EXCLUDED.last_seen_hash, last_pushed_at=now(), updated_at=now()`,
      [
        randomUUID(), input.organizationId, input.connectionId, input.externalId,
        input.internalId, input.externalVersion ?? null, input.hash ?? null
      ]
    );
  });
}

export async function markMissingExternalBlocksCancelled(
  organizationId: string,
  connectionId: string,
  seenExternalIds: string[]
) {
  return withOrganizationTransaction(organizationId, async (client) => {
    if (!seenExternalIds.length) return;
    await client.query(
      `UPDATE calendar_blocks
          SET status='cancelled', updated_at=now()
        WHERE organization_id=$1 AND connection_id=$2
          AND external_id IS NOT NULL
          AND NOT (external_id = ANY($3::text[]))`,
      [organizationId, connectionId, seenExternalIds]
    );
  });
}

export async function storeIntegrationSecretForOrganization(input: {
  organizationId: string; connectionId: string; purpose: string; encryptedValue: string;
}) {
  return withOrganizationTransaction(input.organizationId, async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM integration_secrets
        WHERE organization_id=$1 AND connection_id=$2 AND purpose=$3
        ORDER BY created_at DESC LIMIT 1`,
      [input.organizationId, input.connectionId, input.purpose]
    );
    if (existing.rows[0]) {
      await client.query(
        "UPDATE integration_secrets SET encrypted_value=$3, rotated_at=now() WHERE organization_id=$1 AND id=$2",
        [input.organizationId, existing.rows[0].id, input.encryptedValue]
      );
      return existing.rows[0].id;
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO integration_secrets (id, organization_id, connection_id, purpose, encrypted_value)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, input.organizationId, input.connectionId, input.purpose, input.encryptedValue]
    );
    return id;
  });
}

export async function getIntegrationConnection(organizationId: string, connectionId: string) {
  return withOrganizationTransaction(organizationId, async (client) => {
    const result = await client.query<{
      id: string; provider_code: string; connection_name: string; external_account_id: string | null; status: string;
    }>(
      `SELECT id, provider_code, connection_name, external_account_id, status
         FROM integration_connections
        WHERE organization_id=$1 AND id=$2 LIMIT 1`,
      [organizationId, connectionId]
    );
    return result.rows[0] ?? null;
  });
}
