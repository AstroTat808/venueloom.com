import { getUser, verifyRequestOrigin } from "@netlify/identity";
import { resolveWorkspace, type IdentityInput } from "@venueloom/database";

export async function requireIdentity(): Promise<IdentityInput> {
  const user = await getUser();
  if (!user?.id || !user.email) {
    const error = new Error("Authentication required.");
    Object.assign(error, { status: 401 });
    throw error;
  }
  return {
    provider: "netlify",
    subject: user.id,
    email: user.email,
    displayName: user.name ?? null
  };
}

export async function requireWorkspace(request?: Request) {
  const identity = await requireIdentity();
  const requestedOrganizationId = request?.headers.get("x-venueloom-organization");
  const principal = await resolveWorkspace(identity, requestedOrganizationId);
  if (!principal) {
    const error = new Error("No active VenueLoom organization membership.");
    Object.assign(error, { status: 403, code: "workspace_required" });
    throw error;
  }
  return { identity, principal };
}

export function verifyMutationOrigin(request: Request) {
  verifyRequestOrigin(request);
}

export function errorResponse(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  return Response.json(
    { error: error instanceof Error ? error.message : "Request failed.", code },
    { status: Number.isFinite(status) ? status : 500 }
  );
}
