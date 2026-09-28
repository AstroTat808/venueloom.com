import { NextResponse } from "next/server";
import { listOpenSyncConflicts, withTenantTransaction } from "@venueloom/database";
import { getTenantSession } from "../../../../lib/auth";

export async function GET() {
  const tenant = await getTenantSession();
  if (!tenant) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const conflicts = await withTenantTransaction(
    tenant.identity,
    tenant.session.organizationId,
    (client, session) => listOpenSyncConflicts(client, session.organizationId)
  );
  return NextResponse.json({ conflicts });
}
