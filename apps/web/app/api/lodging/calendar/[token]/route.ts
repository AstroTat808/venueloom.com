import { getPublicLodgingCalendar } from "@venueloom/database";
import { buildLodgingCalendar } from "@venueloom/integrations";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const rawToken = token.endsWith(".ics") ? token.slice(0, -4) : token;
  if (!/^[A-Za-z0-9_-]{32,}$/.test(rawToken)) return new Response("Not found", { status: 404 });
  const data = await getPublicLodgingCalendar(rawToken);
  const ics = buildLodgingCalendar(data);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="venueloom-availability.ics"',
      "Cache-Control": "private, no-store"
    }
  });
}
