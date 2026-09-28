import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import { createLodgingUnit, withTenantTransaction } from "@venueloom/database";
import { getTenantSession } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    verifyRequestOrigin(request);
    const tenant = await getTenantSession();
    if (!tenant) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const timezone = String(body.timezone ?? "").trim();
    if (!name || !timezone) return NextResponse.json({ error: "House name and timezone are required." }, { status: 422 });

    const unitId = await withTenantTransaction(tenant.identity, tenant.session.organizationId, (client, session) =>
      createLodgingUnit(client, session, {
        name,
        timezone,
        venueId: body.venueId ? String(body.venueId) : null,
        blocksVenueAvailability: Boolean(body.blocksVenueAvailability)
      })
    );
    return NextResponse.json({ unitId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create lodging unit" }, { status: 400 });
  }
}
