import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import { sha256 } from "./crypto";
import { storeConnectionSecret } from "./integrations";
import type { TenantSession } from "./types";

export type LodgingProvider = "airbnb" | "vrbo";

function allowedCalendarHost(provider: LodgingProvider, hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (provider === "airbnb") return host === "airbnb.com" || host.endsWith(".airbnb.com");
  return host === "vrbo.com" || host.endsWith(".vrbo.com") || host === "homeaway.com" || host.endsWith(".homeaway.com");
}

export function normalizeLodgingCalendarUrl(provider: LodgingProvider, value: string): string {
  const normalized = value.trim().replace(/^webcal:/i, "https:");
  const url = new URL(normalized);
  if (url.protocol !== "https:") throw new Error("Calendar URL must use HTTPS");
  if (!allowedCalendarHost(provider, url.hostname)) throw new Error(`Calendar URL is not an approved ${provider} host`);
  return url.toString();
}

export async function createLodgingUnit(
  client: PoolClient,
  session: TenantSession,
  input: { name: string; timezone: string; venueId?: string | null; blocksVenueAvailability?: boolean }
): Promise<string> {
  if (input.venueId && !session.venueIds.includes(input.venueId)) throw new Error("Venue access denied");
  const id = randomUUID();
  await client.query(
    `INSERT INTO lodging_units(id,organization_id,venue_id,name,timezone,blocks_venue_availability)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, session.organizationId, input.venueId ?? null, input.name.trim(), input.timezone, Boolean(input.blocksVenueAvailability)]
  );
  return id;
}

export async function connectLodgingCalendar(
  client: PoolClient,
  session: TenantSession,
  input: { unitId: string; provider: LodgingProvider; sourceUrl: string }
): Promise<{ feedId: string; exportToken: string }> {
  const unit = await client.query<{ id: string }>(
    "SELECT id FROM lodging_units WHERE organization_id=$1 AND id=$2 AND active=true",
    [session.organizationId, input.unitId]
  );
  if (!unit.rows[0]) throw new Error("Lodging unit not found");

  const sourceUrl = normalizeLodgingCalendarUrl(input.provider, input.sourceUrl);
  const secretId = await storeConnectionSecret(client, session.organizationId, null, `${input.provider}-ical-url`, sourceUrl);
  const proposedFeedId = randomUUID();
  const feedResult = await client.query<{ id: string }>(
    `INSERT INTO lodging_calendar_feeds(id,organization_id,unit_id,provider,source_url_secret_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (organization_id,unit_id,provider)
     DO UPDATE SET source_url_secret_id=EXCLUDED.source_url_secret_id,enabled=true,last_error=NULL,updated_at=now()
     RETURNING id`,
    [proposedFeedId, session.organizationId, input.unitId, input.provider, secretId]
  );
  const feedId = feedResult.rows[0]!.id;

  const token = randomBytes(32).toString("base64url");
  await client.query(
    `INSERT INTO lodging_export_tokens(id,organization_id,unit_id,target_provider,token_hash)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (organization_id,unit_id,target_provider)
     DO UPDATE SET token_hash=EXCLUDED.token_hash,revoked_at=NULL`,
    [randomUUID(), session.organizationId, input.unitId, input.provider, sha256(token)]
  );

  return { feedId, exportToken: token };
}

export async function getLodgingDashboard(client: PoolClient, organizationId: string) {
  const units = await client.query(
    `SELECT u.id,u.name,u.timezone,u.venue_id,u.blocks_venue_availability,
            COALESCE(json_agg(json_build_object(
              'id',f.id,'provider',f.provider,'enabled',f.enabled,'lastSyncedAt',f.last_synced_at,'lastError',f.last_error
            )) FILTER (WHERE f.id IS NOT NULL),'[]'::json) AS feeds
       FROM lodging_units u
       LEFT JOIN lodging_calendar_feeds f ON f.organization_id=u.organization_id AND f.unit_id=u.id
      WHERE u.organization_id=$1 AND u.active=true
      GROUP BY u.id ORDER BY u.created_at`,
    [organizationId]
  );
  return units.rows;
}

export async function getPublicLodgingCalendar(token: string) {
  const { getPool } = await import("./client");
  const result = await getPool().query<{
    unit_name: string;
    stay_id: string;
    starts_on: string;
    ends_on: string;
    status: string;
    source_provider: string;
  }>("SELECT unit_name,stay_id,starts_on,ends_on,status,source_provider FROM resolve_lodging_export_calendar($1)", [sha256(token)]);
  return {
    name: result.rows[0]?.unit_name ?? "VenueLoom Availability",
    events: result.rows.map((row) => ({
      uid: row.stay_id,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      summary: "Unavailable"
    }))
  };
}
