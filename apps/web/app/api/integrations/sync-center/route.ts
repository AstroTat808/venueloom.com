import { NextResponse } from "next/server";
import { withTenantTransaction } from "@venueloom/database";
import { getIntegrationAdminSession } from "../../../../lib/auth";

export async function GET() {
  const tenant = await getIntegrationAdminSession();
  if (!tenant) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });

  const data = await withTenantTransaction(
    tenant.identity,
    tenant.session.organizationId,
    async (client, session) => {
      const [connections, bindings, feeds, conflicts, queue, imports] = await Promise.all([
        client.query<{
          id: string;
          provider_code: string;
          connection_name: string;
          status: string;
          updated_at: string;
        }>(
          `SELECT id,provider_code,connection_name,status,updated_at
             FROM integration_connections
            WHERE organization_id=$1
            ORDER BY updated_at DESC`,
          [session.organizationId]
        ),
        client.query<{
          id: string;
          provider_code: string;
          provider_calendar_name: string;
          sync_direction: string;
          last_synced_at: string | null;
          last_error: string | null;
          sync_enabled: boolean;
        }>(
          `SELECT b.id,c.provider_code,b.provider_calendar_name,b.sync_direction,
                  b.last_synced_at,b.last_error,b.sync_enabled
             FROM calendar_bindings b
             JOIN integration_connections c
               ON c.organization_id=b.organization_id AND c.id=b.connection_id
            WHERE b.organization_id=$1
            ORDER BY b.updated_at DESC`,
          [session.organizationId]
        ),
        client.query<{
          id: string;
          provider: string;
          unit_name: string;
          last_synced_at: string | null;
          last_error: string | null;
          enabled: boolean;
        }>(
          `SELECT f.id,f.provider,u.name AS unit_name,f.last_synced_at,f.last_error,f.enabled
             FROM lodging_calendar_feeds f
             JOIN lodging_units u
               ON u.organization_id=f.organization_id AND u.id=f.unit_id
            WHERE f.organization_id=$1
            ORDER BY f.updated_at DESC`,
          [session.organizationId]
        ),
        client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM sync_conflicts WHERE organization_id=$1 AND state='open'",
          [session.organizationId]
        ),
        client.query<{
          id: string;
          reason: string;
          binding_id: string | null;
          feed_id: string | null;
          attempts: number;
          last_error: string | null;
          available_at: string;
          completed_at: string | null;
          dead_lettered_at: string | null;
          created_at: string;
        }>(
          `SELECT id,reason,binding_id,feed_id,attempts,last_error,available_at,completed_at,dead_lettered_at,created_at
             FROM integration_sync_queue
            WHERE organization_id=$1
            ORDER BY created_at DESC
            LIMIT 50`,
          [session.organizationId]
        ),
        client.query<{
          id: string;
          entity_type: string;
          source_name: string;
          state: string;
          discovered_count: number;
          create_count: number;
          update_count: number;
          skip_count: number;
          conflict_count: number;
          error_count: number;
          created_at: string;
          completed_at: string | null;
        }>(
          `SELECT id,entity_type,source_name,state,discovered_count,create_count,update_count,
                  skip_count,conflict_count,error_count,created_at,completed_at
             FROM import_runs
            WHERE organization_id=$1
            ORDER BY created_at DESC
            LIMIT 20`,
          [session.organizationId]
        )
      ]);

      const pendingJobs = queue.rows.filter((job) => !job.completed_at && !job.dead_lettered_at).length;
      const deadLetters = queue.rows.filter((job) => Boolean(job.dead_lettered_at)).length;
      const unhealthyConnections =
        connections.rows.filter((item) => item.status !== "active").length +
        bindings.rows.filter((item) => Boolean(item.last_error)).length +
        feeds.rows.filter((item) => Boolean(item.last_error)).length;

      return {
        summary: {
          activeConnections: connections.rows.filter((item) => item.status === "active").length,
          pendingJobs,
          deadLetters,
          openConflicts: conflicts.rows[0]?.count ?? 0,
          unhealthyConnections
        },
        connections: connections.rows,
        bindings: bindings.rows,
        feeds: feeds.rows,
        queue: queue.rows,
        imports: imports.rows
      };
    }
  );

  return NextResponse.json(data);
}
