import { getCalendarLinkForOrganization } from "@venueloom/database";
import { reconcileCalendarLink } from "@/lib/integrations/calendar-sync";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string; linkId: string }> }) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const { organizationId, linkId } = await context.params;
  const link = await getCalendarLinkForOrganization(organizationId, linkId);
  if (!link || link.providerCode !== "outlook-calendar") return new Response(null, { status: 404 });

  const body = await request.json() as {
    value?: Array<{ subscriptionId?: string; clientState?: string }>;
  };
  const notifications = body.value ?? [];
  if (!notifications.length) return new Response(null, { status: 202 });

  const valid = notifications.every((item) =>
    item.clientState === link.webhookClientState &&
    (!link.webhookChannelId || item.subscriptionId === link.webhookChannelId)
  );
  if (!valid) return new Response(null, { status: 403 });

  await reconcileCalendarLink(organizationId, linkId);
  return new Response(null, { status: 202 });
}
