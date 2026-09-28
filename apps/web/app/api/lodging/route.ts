import { NextResponse } from "next/server";
import { getLodgingDashboard, withTenantTransaction } from "@venueloom/database";
import { getIntegrationAdminSession } from "../../../lib/auth";

export async function GET() {
  const tenant = await getIntegrationAdminSession();
  if (!tenant) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
  const data = await withTenantTransaction(tenant.identity, tenant.session.organizationId, async (client, session) => {
    const units = await getLodgingDashboard(client, session.organizationId);
    const venues = await client.query<{ id: string; name: string }>(
      "SELECT id,name FROM venues WHERE organization_id=$1 AND active=true ORDER BY created_at",
      [session.organizationId]
    );
    return { units, venues: venues.rows };
  });
  return NextResponse.json(data);
}
