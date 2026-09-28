import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import { resolveSyncConflict, withTenantTransaction } from "@venueloom/database";
import { getIntegrationAdminSession } from "../../../../../../lib/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    verifyRequestOrigin(request);
    const tenant = await getIntegrationAdminSession();
    if (!tenant) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
    const { id } = await context.params;
    const body = await request.json();
    const resolution = String(body.resolution ?? "");
    if (!["venueloom","external","merged","ignored"].includes(resolution)) {
      return NextResponse.json({ error: "Invalid conflict resolution" }, { status: 422 });
    }
    await withTenantTransaction(
      tenant.identity,
      tenant.session.organizationId,
      (client, session) => resolveSyncConflict(client, session, id, {
        resolution: resolution as "venueloom" | "external" | "merged" | "ignored",
        mergedValue: body.mergedValue
      })
    );
    return NextResponse.json({ resolved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conflict resolution failed";
    const status = /conflict/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
