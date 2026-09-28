import { getCalendarLinkForOrganization } from "@venueloom/database";
import { reconcileCalendarLink } from "@/lib/integrations/calendar-sync";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string; linkId: string }> }) {
  const { organizationId, linkId } = await context.params;
  const link = await getCalendarLinkForOrganization(organizationId, linkId);
  if (!link || link.providerCode !== "google-calendar") return new Response(null, { status: 404 });

  const channelId = request.headers.get("x-goog-channel-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  const resourceId = request.headers.get("x-goog-resource-id");

  if (!link.webhookClientState || channelToken !== link.webhookClientState) {
    return new Response(null, { status: 403 });
  }
  if (link.webhookChannelId && channelId !== link.webhookChannelId) {
    return new Response(null, { status: 204 });
  }
  if (link.webhookResourceId && resourceId && resourceId !== link.webhookResourceId) {
    return new Response(null, { status: 204 });
  }

  await reconcileCalendarLink(organizationId, linkId);
  return new Response(null, { status: 204 });
}
