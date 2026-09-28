import { NextResponse } from "next/server";
import { getCalendarDashboard, withTenantTransaction } from "@venueloom/database";
import { getTenantSession } from "../../../../lib/auth";

export async function GET() {
  const tenant = await getTenantSession();
  if (!tenant) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const data = await withTenantTransaction(tenant.identity, tenant.session.organizationId, async (client, session) => {
    const connections = await getCalendarDashboard(client, session.organizationId);
    const venues = await client.query<{ id: string; name: string }>(
      "SELECT id,name FROM venues WHERE organization_id=$1 AND active=true ORDER BY created_at",
      [session.organizationId]
    );
    return { connections, venues: venues.rows };
  });
  return NextResponse.json(data);
}
