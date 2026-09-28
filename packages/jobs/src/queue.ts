import { getServicePool } from "@venueloom/database";
import { syncCalendarBinding } from "./calendar";
import { syncLodgingFeed } from "./lodging";

export async function processIntegrationQueue(limit = 20): Promise<{ processed: number; failed: number }> {
  const jobs = await getServicePool().query<{
    id: string; binding_id: string | null; feed_id: string | null; attempts: number;
  }>(
    `UPDATE integration_sync_queue q
        SET leased_at=now(),attempts=attempts+1
      WHERE q.id IN (
        SELECT id FROM integration_sync_queue
         WHERE completed_at IS NULL AND dead_lettered_at IS NULL AND available_at<=now()
           AND (leased_at IS NULL OR leased_at<now()-interval '10 minutes')
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id,binding_id,feed_id,attempts`,
    [limit]
  );

  let failed = 0;
  for (const job of jobs.rows) {
    try {
      if (job.binding_id) await syncCalendarBinding(job.binding_id);
      else if (job.feed_id) await syncLodgingFeed(job.feed_id);
      await getServicePool().query(
        "UPDATE integration_sync_queue SET completed_at=now(),last_error=NULL WHERE id=$1",
        [job.id]
      );
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message.slice(0,1000) : String(error).slice(0,1000);
      if (job.attempts >= 10) {
        await getServicePool().query(
          `UPDATE integration_sync_queue
              SET leased_at=NULL,dead_lettered_at=now(),last_error=$2
            WHERE id=$1`,
          [job.id, message]
        );
      } else {
        const delayMinutes = Math.min(60, 2 ** Math.min(job.attempts, 5));
        await getServicePool().query(
          `UPDATE integration_sync_queue
              SET leased_at=NULL,available_at=now()+($2::text||' minutes')::interval,last_error=$3
            WHERE id=$1`,
          [job.id, delayMinutes, message]
        );
      }
    }
  }
  return { processed: jobs.rows.length, failed };
}
