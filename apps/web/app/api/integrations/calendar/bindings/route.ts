import { randomUUID } from "node:crypto";
import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import { saveCalendarBinding, withTenantTransaction } from "@venueloom/database";
import { getTenantSession } from "../../../../../lib/auth";

export async function POST(request: Request) {
  try {
    verifyRequestOrigin(request);
    const tenant = await getTenantSession();
    if (!tenant) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const body = await request.json();
    const direction = String(body.direction ?? "");
    if (!["inbound","outbound","two_way"].includes(direction)) {
      return NextResponse.json({ error: "Invalid sync direction" }, { status: 422 });
    }

    const bindingId = await withTenantTransaction(tenant.identity, tenant.session.organizationId, async (client, session) => {
      const id = await saveCalendarBinding(client, session, {
        connectionId: String(body.connectionId),
        venueId: String(body.venueId),
        providerCalendarId: String(body.calendarId),
        providerCalendarName: String(body.calendarName ?? body.calendarId),
        direction: direction as "inbound" | "outbound" | "two_way",
        blockAvailability: body.blockAvailability !== false
      });
      await client.query(
        "INSERT INTO integration_sync_queue(id,organization_id,binding_id,reason) VALUES ($1,$2,$3,'binding-created')",
        [randomUUID(), session.organizationId, id]
      );
      return id;
    });
    return NextResponse.json({ bindingId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save calendar binding" }, { status: 400 });
  }
}
