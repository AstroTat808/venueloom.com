import { randomBytes } from "node:crypto";
import {
  createRentalCalendarLink,
  createVenueCalendar,
  listRentalLinksForOrganization,
  listVenueCalendars
} from "@venueloom/database";
import { errorResponse, requireWorkspace, verifyMutationOrigin } from "@/lib/auth";
import { allowedRentalFeed, reconcileRentalCalendars } from "@/lib/integrations/calendar-sync";
import { encryptSecret } from "@/lib/secrets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { principal } = await requireWorkspace(request);
    const venueCalendars = (await listVenueCalendars(principal)).filter((calendar) => principal.venueIds.includes(calendar.venueId));
    const links = await listRentalLinksForOrganization(principal.organizationId);
    return Response.json({
      venues: principal.venues,
      venueCalendars,
      links: links.map((link) => ({
        id: link.id,
        providerCode: link.providerCode,
        listingName: link.listingName,
        venueCalendarId: link.venueCalendarId
      }))
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyMutationOrigin(request);
    const { principal } = await requireWorkspace(request);
    const body = await request.json() as {
      providerCode?: "airbnb" | "vrbo";
      venueId?: string;
      venueCalendarId?: string;
      listingName?: string;
      inboundUrl?: string;
    };

    if (!body.providerCode || !["airbnb", "vrbo"].includes(body.providerCode)) {
      return Response.json({ error: "Choose Airbnb or Vrbo." }, { status: 422 });
    }
    if (!body.listingName?.trim() || !body.inboundUrl?.trim()) {
      return Response.json({ error: "House/listing name and exported calendar URL are required." }, { status: 422 });
    }
    allowedRentalFeed(body.providerCode, body.inboundUrl.trim());

    let venueCalendarId = body.venueCalendarId;
    if (!venueCalendarId) {
      if (!body.venueId || !principal.venueIds.includes(body.venueId)) {
        return Response.json({ error: "Choose an authorized venue for this house." }, { status: 422 });
      }
      const created = await createVenueCalendar(principal, {
        venueId: body.venueId,
        name: body.listingName.trim(),
        resourceKind: "rental_house"
      });
      venueCalendarId = created.id;
    } else {
      const calendars = await listVenueCalendars(principal);
      const calendar = calendars.find((item) => item.id === venueCalendarId);
      if (!calendar || !principal.venueIds.includes(calendar.venueId)) {
        return Response.json({ error: "Rental calendar access denied." }, { status: 403 });
      }
    }

    const outboundToken = randomBytes(32).toString("base64url");
    const link = await createRentalCalendarLink(principal, {
      providerCode: body.providerCode,
      venueCalendarId,
      listingName: body.listingName.trim(),
      encryptedInboundUrl: encryptSecret(body.inboundUrl.trim()),
      outboundToken
    });

    await reconcileRentalCalendars(principal.organizationId);

    const origin = (process.env.VENUELOOM_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, "");
    return Response.json({
      ...link,
      venueCalendarId,
      outboundUrl: `${origin}/api/calendar/rental/${outboundToken}.ics`
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
