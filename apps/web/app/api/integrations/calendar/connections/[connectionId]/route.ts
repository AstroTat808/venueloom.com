import {
  getConnectionSecret,
  getIntegrationConnection,
  listVenueCalendars
} from "@venueloom/database";
import {
  listGoogleCalendars,
  listMicrosoftCalendars
} from "@venueloom/integrations";
import { errorResponse, requireWorkspace } from "@/lib/auth";
import { getUsableCalendarToken } from "@/lib/integrations/calendar-sync";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await context.params;
    const { principal } = await requireWorkspace(request);
    const connection = await getIntegrationConnection(principal.organizationId, connectionId);
    if (!connection || !["google-calendar", "outlook-calendar"].includes(connection.provider_code)) {
      return Response.json({ error: "Calendar connection not found." }, { status: 404 });
    }

    const encrypted = await getConnectionSecret(principal.organizationId, connectionId, "oauth_tokens");
    const token = await getUsableCalendarToken(
      principal.organizationId,
      connectionId,
      connection.provider_code as "google-calendar" | "outlook-calendar",
      encrypted
    );

    const externalCalendars = connection.provider_code === "google-calendar"
      ? await listGoogleCalendars(token.accessToken)
      : await listMicrosoftCalendars(token.accessToken);

    const venueCalendars = (await listVenueCalendars(principal)).filter((calendar) =>
      principal.venueIds.includes(calendar.venueId)
    );

    return Response.json({
      connection: {
        id: connection.id,
        providerCode: connection.provider_code,
        name: connection.connection_name
      },
      externalCalendars,
      venueCalendars
    });
  } catch (error) {
    return errorResponse(error);
  }
}
