import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured.");
    pool = new Pool({
      connectionString,
      max: Number(process.env.VENUELOOM_DB_POOL_MAX ?? 4),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setLocalContext(
  client: PoolClient,
  context: { userId?: string; organizationId?: string }
) {
  if (context.userId) {
    await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId]);
  }
  if (context.organizationId) {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [context.organizationId]);
  }
}

export async function oneOrNull<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const result = await client.query<T>(sql, values);
  return result.rows[0] ?? null;
}
