import {
  findRentalFeedByToken,
  listBlocksForPublicFeed
} from "@venueloom/database";
import { buildVenueLoomIcal } from "@venueloom/integrations";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await context.params;
  const token = rawToken.endsWith(".ics") ? rawToken.slice(0, -4) : rawToken;
  const feed = await findRentalFeedByToken(token);
  if (!feed) return new Response("Calendar not found", { status: 404 });

  const events = await listBlocksForPublicFeed(
    feed.organization_id,
    feed.venue_calendar_id,
    feed.connection_id
  );
  const calendar = buildVenueLoomIcal({
    name: `VenueLoom · ${feed.listing_name}`,
    events
  });

  return new Response(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${feed.provider_code}-venueloom.ics"`,
      "Cache-Control": "private, max-age=60"
    }
  });
}
