import { verifyRequestOrigin } from "@netlify/identity";
import { NextResponse } from "next/server";
import { resolveTenantSession } from "@venueloom/database";
import { getVerifiedIdentity } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    verifyRequestOrigin(request);
    const identity = await getVerifiedIdentity();
    if (!identity) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const body = await request.json();
    const organizationId = String(body.organizationId ?? "");
    const session = await resolveTenantSession(identity, organizationId);
    if (!session || session.organizationId !== organizationId) {
      return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
    }
    const response = NextResponse.json({ organizationId });
    response.cookies.set("vl_org", organizationId, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization switch failed" }, { status: 400 });
  }
}
