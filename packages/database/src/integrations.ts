import { randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import { decryptSecret, encryptSecret } from "./crypto";

export async function storeConnectionSecret(
  client: PoolClient,
  organizationId: string,
  connectionId: string | null,
  purpose: string,
  value: string
): Promise<string> {
  const id = randomUUID();
  await client.query(
    "INSERT INTO integration_secret_envelopes(id,organization_id,connection_id,purpose,ciphertext) VALUES ($1,$2,$3,$4,$5)",
    [id, organizationId, connectionId, purpose, encryptSecret(value)]
  );
  return id;
}

export async function readConnectionSecret(
  client: PoolClient,
  organizationId: string,
  secretId: string
): Promise<string> {
  const result = await client.query<{ ciphertext: string }>(
    "SELECT ciphertext FROM integration_secret_envelopes WHERE organization_id=$1 AND id=$2",
    [organizationId, secretId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Integration secret not found");
  return decryptSecret(row.ciphertext);
}

export async function createIntegrationConnection(
  client: PoolClient,
  organizationId: string,
  userId: string,
  input: {
    providerCode: string;
    connectionName: string;
    authType: "oauth" | "api_key" | "webhook_bridge" | "file" | "partner_api";
    externalAccountId?: string | null;
    grantedScopes?: string[];
  }
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO integration_connections(
      id,organization_id,provider_code,connection_name,environment,external_account_id,auth_type,granted_scopes,status,authorized_by,authorized_at
     ) VALUES ($1,$2,$3,$4,'production',$5,$6,$7,'active',$8,now())`,
    [id, organizationId, input.providerCode, input.connectionName, input.externalAccountId ?? null,
     input.authType, input.grantedScopes ?? [], userId]
  );
  return id;
}
