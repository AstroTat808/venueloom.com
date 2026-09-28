import {
  createCalendarSyncLink,
  listVenueCalendars
} from "@venueloom/database";
import { errorResponse, requireWorkspace, verifyMutationOrigin } from "@/lib/auth";
import { reconcileCalendarLink } from "@/lib/integrations/calendar-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    verifyMutationOrigin(request);
    const { principal } = await requireWorkspace(request);
    const body = await request.json() as {
      connectionId?: string;
      venueCalendarId?: string;
      externalCalendarId?: string;
      externalCalendarName?: string;
      syncMode?: "inbound" | "outbound" | "two_way";
      blockAvailability?: boolean;
    };

    if (!body.connectionId || !body.venueCalendarId || !body.externalCalendarId || !body.syncMode) {
      return Response.json({ error: "Connection, VenueLoom calendar, external calendar, and sync mode are required." }, { status: 422 });
    }

    const calendars = await listVenueCalendars(principal);
    const target = calendars.find((calendar) => calendar.id === body.venueCalendarId);
    if (!target || !principal.venueIds.includes(target.venueId)) {
      return Response.json({ error: "Venue calendar access denied." }, { status: 403 });
    }

    const linkId = await createCalendarSyncLink(principal, {
      connectionId: body.connectionId,
      venueCalendarId: body.venueCalendarId,
      externalCalendarId: body.externalCalendarId,
      externalCalendarName: body.externalCalendarName,
      syncMode: body.syncMode,
      blockAvailability: body.blockAvailability ?? true
    });

    await reconcileCalendarLink(principal.organizationId);
    return Response.json({ linkId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
