import { randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import type { OAuthTokenSet, CalendarProvider, CalendarSyncDirection } from "@venueloom/integrations";
import { decryptSecret, encryptSecret } from "./crypto";
import type { TenantSession } from "./types";

export async function saveOAuthState(
  client: PoolClient,
  session: TenantSession,
  input: { provider: CalendarProvider; stateHash: string; codeVerifier: string; redirectUri: string }
): Promise<void> {
  await client.query(
    `INSERT INTO oauth_states(id,organization_id,user_id,provider,state_hash,code_verifier,redirect_uri,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,
    [randomUUID(), session.organizationId, session.userId, input.provider, input.stateHash, input.codeVerifier, input.redirectUri]
  );
}

export async function consumeOAuthState(
  client: PoolClient,
  session: TenantSession,
  provider: CalendarProvider,
  stateHash: string
): Promise<{ codeVerifier: string; redirectUri: string }> {
  const result = await client.query<{ code_verifier: string; redirect_uri: string }>(
    `UPDATE oauth_states SET consumed_at=now()
      WHERE organization_id=$1 AND user_id=$2 AND provider=$3 AND state_hash=$4
        AND consumed_at IS NULL AND expires_at>now()
      RETURNING code_verifier,redirect_uri`,
    [session.organizationId, session.userId, provider, stateHash]
  );
  const row = result.rows[0];
  if (!row) throw new Error("OAuth state is invalid or expired");
  return { codeVerifier: row.code_verifier, redirectUri: row.redirect_uri };
}

export async function upsertCalendarConnection(
  client: PoolClient,
  session: TenantSession,
  input: {
    provider: CalendarProvider;
    accountId: string;
    accountName: string;
    scopes: string[];
    tokens: OAuthTokenSet;
  }
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM integration_connections
      WHERE organization_id=$1 AND provider_code=$2 AND environment='production' AND external_account_id=$3`,
    [session.organizationId, input.provider, input.accountId]
  );
  const connectionId = existing.rows[0]?.id ?? randomUUID();
  if (!existing.rows[0]) {
    await client.query(
      `INSERT INTO integration_connections(
        id,organization_id,provider_code,connection_name,environment,external_account_id,auth_type,granted_scopes,status,authorized_by,authorized_at
       ) VALUES ($1,$2,$3,$4,'production',$5,'oauth',$6,'active',$7,now())`,
      [connectionId, session.organizationId, input.provider, input.accountName, input.accountId, input.scopes, session.userId]
    );
  } else {
    await client.query(
      `UPDATE integration_connections
          SET connection_name=$4,granted_scopes=$5,status='active',authorized_by=$6,authorized_at=now(),revoked_at=NULL,updated_at=now()
        WHERE organization_id=$1 AND id=$2 AND provider_code=$3`,
      [session.organizationId, connectionId, input.provider, input.accountName, input.scopes, session.userId]
    );
  }

  const encrypted = encryptSecret(JSON.stringify(input.tokens));
  const secretId = randomUUID();
  await client.query(
    "INSERT INTO integration_secret_envelopes(id,organization_id,connection_id,purpose,ciphertext) VALUES ($1,$2,$3,'oauth-tokens',$4)",
    [secretId, session.organizationId, connectionId, encrypted]
  );
  await client.query(
    "UPDATE integration_connections SET secret_ref=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",
    [session.organizationId, connectionId, secretId]
  );
  return connectionId;
}

export async function getCalendarConnectionTokens(
  client: PoolClient,
  organizationId: string,
  connectionId: string
): Promise<{ provider: CalendarProvider; tokens: OAuthTokenSet; connectionName: string }> {
  const result = await client.query<{ provider_code: CalendarProvider; connection_name: string; ciphertext: string }>(
    `SELECT c.provider_code,c.connection_name,s.ciphertext
       FROM integration_connections c
       JOIN integration_secret_envelopes s ON s.organization_id=c.organization_id AND s.id=c.secret_ref::uuid
      WHERE c.organization_id=$1 AND c.id=$2 AND c.status='active'`,
    [organizationId, connectionId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Calendar connection not found");
  return {
    provider: row.provider_code,
    connectionName: row.connection_name,
    tokens: JSON.parse(decryptSecret(row.ciphertext)) as OAuthTokenSet
  };
}

export async function updateCalendarConnectionTokens(
  client: PoolClient,
  organizationId: string,
  connectionId: string,
  tokens: OAuthTokenSet
): Promise<void> {
  const connection = await client.query<{ secret_ref: string | null }>(
    "SELECT secret_ref FROM integration_connections WHERE organization_id=$1 AND id=$2",
    [organizationId, connectionId]
  );
  const secretRef = connection.rows[0]?.secret_ref;
  if (!secretRef) throw new Error("Calendar token secret missing");
  await client.query(
    "UPDATE integration_secret_envelopes SET ciphertext=$3,rotated_at=now() WHERE organization_id=$1 AND id=$2",
    [organizationId, secretRef, encryptSecret(JSON.stringify(tokens))]
  );
}

export async function saveCalendarBinding(
  client: PoolClient,
  session: TenantSession,
  input: {
    connectionId: string;
    venueId: string;
    providerCalendarId: string;
    providerCalendarName: string;
    direction: CalendarSyncDirection;
    blockAvailability: boolean;
  }
): Promise<string> {
  if (!session.venueIds.includes(input.venueId)) throw new Error("Venue access denied");
  const connection = await client.query(
    "SELECT id FROM integration_connections WHERE organization_id=$1 AND id=$2 AND provider_code IN ('google-calendar','outlook-calendar') AND status='active'",
    [session.organizationId, input.connectionId]
  );
  if (!connection.rows[0]) throw new Error("Calendar connection not found");

  const id = randomUUID();
  const result = await client.query<{ id: string }>(
    `INSERT INTO calendar_bindings(
      id,organization_id,connection_id,venue_id,provider_calendar_id,provider_calendar_name,sync_direction,block_availability
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (organization_id,connection_id,provider_calendar_id)
     DO UPDATE SET venue_id=EXCLUDED.venue_id,provider_calendar_name=EXCLUDED.provider_calendar_name,
                   sync_direction=EXCLUDED.sync_direction,block_availability=EXCLUDED.block_availability,
                   sync_enabled=true,updated_at=now()
     RETURNING id`,
    [id, session.organizationId, input.connectionId, input.venueId, input.providerCalendarId, input.providerCalendarName, input.direction, input.blockAvailability]
  );
  return result.rows[0]!.id;
}

export async function getCalendarDashboard(client: PoolClient, organizationId: string) {
  const connections = await client.query(
    `SELECT c.id,c.provider_code,c.connection_name,c.status,c.external_account_id,
            COALESCE(json_agg(json_build_object(
              'id',b.id,'venueId',b.venue_id,'calendarId',b.provider_calendar_id,'calendarName',b.provider_calendar_name,
              'direction',b.sync_direction,'blockAvailability',b.block_availability,'enabled',b.sync_enabled,
              'lastSyncedAt',b.last_synced_at,'lastError',b.last_error
            )) FILTER (WHERE b.id IS NOT NULL),'[]'::json) AS bindings
       FROM integration_connections c
       LEFT JOIN calendar_bindings b ON b.organization_id=c.organization_id AND b.connection_id=c.id
      WHERE c.organization_id=$1 AND c.provider_code IN ('google-calendar','outlook-calendar')
      GROUP BY c.id ORDER BY c.created_at`,
    [organizationId]
  );
  return connections.rows;
}
