import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import { createOrganizationAndVenue } from "@venueloom/database";
import { getVerifiedIdentity } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    verifyRequestOrigin(request);
    const identity = await getVerifiedIdentity();
    if (!identity) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const body = await request.json();
    const organizationName = String(body.organizationName ?? "").trim();
    const venueName = String(body.venueName ?? "").trim();
    const timezone = String(body.timezone ?? "").trim();
    if (!organizationName || !venueName || !timezone) {
      return NextResponse.json({ error: "Organization, venue, and timezone are required." }, { status: 422 });
    }
    const session = await createOrganizationAndVenue(identity, { organizationName, venueName, timezone });
    const response = NextResponse.json({ organizationId: session.organizationId, venueId: session.defaultVenueId });
    response.cookies.set("vl_org", session.organizationId, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Onboarding failed" }, { status: 400 });
  }
}
