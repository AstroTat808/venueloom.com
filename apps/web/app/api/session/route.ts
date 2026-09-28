import { listMemberships, resolveWorkspace } from "@venueloom/database";
import { errorResponse, requireIdentity } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const requested = request.headers.get("x-venueloom-organization");
    const { memberships } = await listMemberships(identity);
    const principal = await resolveWorkspace(identity, requested);

    return Response.json({
      user: { email: identity.email, displayName: identity.displayName ?? null },
      memberships,
      workspace: principal
        ? {
            organizationId: principal.organizationId,
            organizationName: principal.organizationName,
            role: principal.role,
            membershipId: principal.membershipId,
            venues: principal.venues
          }
        : null
    });
  } catch (error) {
    return errorResponse(error);
  }
}
