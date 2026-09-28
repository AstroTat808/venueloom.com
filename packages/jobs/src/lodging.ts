import { randomUUID } from "node:crypto";
import {
  decryptSecret,
  getServicePool,
  normalizeLodgingCalendarUrl
} from "@venueloom/database";
import { parseLodgingCalendar } from "@venueloom/integrations";

type Provider = "airbnb" | "vrbo";

async function fetchCalendar(provider: Provider, initialUrl: string): Promise<string> {
  let current = normalizeLodgingCalendarUrl(provider, initialUrl);
  for (let redirects = 0; redirects < 4; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(current, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "VenueLoom-CalendarSync/1.0" }
    }).finally(() => clearTimeout(timer));

    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Calendar redirect did not provide a location");
      current = normalizeLodgingCalendarUrl(provider, new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`${provider} calendar returned HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("Calendar feed exceeds 2 MB limit");
    return text;
  }
  throw new Error("Calendar feed redirected too many times");
}

export async function syncLodgingFeed(feedId: string): Promise<void> {
  const result = await getServicePool().query<{
    id: string; organization_id: string; unit_id: string; provider: Provider; ciphertext: string;
  }>(
    `SELECT f.id,f.organization_id,f.unit_id,f.provider,s.ciphertext
       FROM lodging_calendar_feeds f
       JOIN integration_secret_envelopes s ON s.organization_id=f.organization_id AND s.id=f.source_url_secret_id
      WHERE f.id=$1 AND f.enabled=true`,
    [feedId]
  );
  const feed = result.rows[0];
  if (!feed) throw new Error("Lodging calendar feed not found");

  try {
    const ics = await fetchCalendar(feed.provider, decryptSecret(feed.ciphertext));
    const stays = parseLodgingCalendar(ics);
    const seen: string[] = [];
    for (const stay of stays) {
      seen.push(stay.uid);
      await getServicePool().query(
        `INSERT INTO lodging_stays(id,organization_id,unit_id,feed_id,source_provider,external_uid,starts_on,ends_on,status,source_hash,last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         ON CONFLICT (organization_id,feed_id,external_uid)
         DO UPDATE SET starts_on=EXCLUDED.starts_on,ends_on=EXCLUDED.ends_on,status=EXCLUDED.status,
                       source_hash=EXCLUDED.source_hash,last_seen_at=now(),updated_at=now()`,
        [randomUUID(), feed.organization_id, feed.unit_id, feed.id, feed.provider, stay.uid, stay.startsOn, stay.endsOn, stay.status, stay.sourceHash]
      );
    }
    await getServicePool().query(
      `UPDATE lodging_stays SET status='cancelled',updated_at=now()
        WHERE organization_id=$1 AND feed_id=$2 AND status<>'cancelled'
          AND ends_on>=CURRENT_DATE AND NOT (external_uid=ANY($3::text[]))`,
      [feed.organization_id, feed.id, seen]
    );
    await getServicePool().query(
      "UPDATE lodging_calendar_feeds SET last_synced_at=now(),last_error=NULL,updated_at=now() WHERE organization_id=$1 AND id=$2",
      [feed.organization_id, feed.id]
    );
  } catch (error) {
    await getServicePool().query(
      "UPDATE lodging_calendar_feeds SET last_error=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",
      [feed.organization_id, feed.id, error instanceof Error ? error.message.slice(0,1000) : String(error).slice(0,1000)]
    );
    throw error;
  }
}

export async function queueDueLodgingFeeds(): Promise<number> {
  const result = await getServicePool().query<{ id: string; organization_id: string }>(
    `SELECT id,organization_id FROM lodging_calendar_feeds
      WHERE enabled=true AND (last_synced_at IS NULL OR last_synced_at<now()-interval '15 minutes')
      LIMIT 100`
  );
  for (const row of result.rows) {
    await getServicePool().query(
      `INSERT INTO integration_sync_queue(id,organization_id,feed_id,reason)
       SELECT $1,$2,$3,'lodging-poll'
       WHERE NOT EXISTS (SELECT 1 FROM integration_sync_queue WHERE feed_id=$3 AND completed_at IS NULL)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), row.organization_id, row.id]
    );
  }
  return result.rows.length;
}
