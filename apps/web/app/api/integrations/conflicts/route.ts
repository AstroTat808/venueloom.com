import { NextResponse } from "next/server";
import { listOpenSyncConflicts, withTenantTransaction } from "@venueloom/database";
import { getIntegrationAdminSession } from "../../../../lib/auth";

export async function GET() {
  const tenant = await getIntegrationAdminSession();
  if (!tenant) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
  const conflicts = await withTenantTransaction(
    tenant.identity,
    tenant.session.organizationId,
    (client, session) => listOpenSyncConflicts(client, session.organizationId)
  );
  return NextResponse.json({ conflicts });
}
