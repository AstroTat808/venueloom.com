import { Pool, type PoolClient } from "@neondatabase/serverless";
import { requireRuntimeEnv } from "./env";

let pool: Pool | undefined;
let servicePool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requireRuntimeEnv("DATABASE_URL"),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000
    });
  }
  return pool;
}

export function getServicePool(): Pool {
  if (!servicePool) {
    servicePool = new Pool({
      connectionString: requireRuntimeEnv("DATABASE_SERVICE_URL"),
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000
    });
  }
  return servicePool;
}

export async function withServiceTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getServicePool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setIdentityContext(
  client: PoolClient,
  provider: string,
  subject: string,
  userId?: string
): Promise<void> {
  await client.query("SELECT set_config('app.identity_provider', $1, true)", [provider]);
  await client.query("SELECT set_config('app.identity_subject', $1, true)", [subject]);
  if (userId) await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
}

export async function setTenantContext(
  client: PoolClient,
  userId: string,
  organizationId: string
): Promise<void> {
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
}
