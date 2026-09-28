import { randomUUID } from "node:crypto";
import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import {
  connectLodgingCalendar,
  requireRuntimeEnv,
  withTenantTransaction
} from "@venueloom/database";
import { getIntegrationAdminSession } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    verifyRequestOrigin(request);
    const tenant = await getIntegrationAdminSession();
    if (!tenant) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
    const body = await request.json();
    const provider = String(body.provider);
    if (provider !== "airbnb" && provider !== "vrbo") {
      return NextResponse.json({ error: "Provider must be Airbnb or Vrbo." }, { status: 422 });
    }

    const connected = await withTenantTransaction(tenant.identity, tenant.session.organizationId, async (client, session) => {
      const result = await connectLodgingCalendar(client, session, {
        unitId: String(body.unitId),
        provider,
        sourceUrl: String(body.sourceUrl ?? "")
      });
      await client.query(
        "INSERT INTO integration_sync_queue(id,organization_id,feed_id,reason) VALUES ($1,$2,$3,'feed-connected') ON CONFLICT DO NOTHING",
        [randomUUID(), session.organizationId, result.feedId]
      );
      return result;
    });

    const base = requireRuntimeEnv("PUBLIC_APP_URL").replace(/\/$/, "");
    return NextResponse.json({
      feedId: connected.feedId,
      exportUrl: `${base}/api/lodging/calendar/${connected.exportToken}.ics`
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to connect lodging calendar" }, { status: 400 });
  }
}
