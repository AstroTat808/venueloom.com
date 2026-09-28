import { getUser } from "@netlify/identity";
import { cookies } from "next/headers";
import { resolveIdentity, resolveTenantSession, type TenantSession, type VerifiedIdentity } from "@venueloom/database";

export async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  const user = await getUser();
  if (!user?.id) return null;
  return {
    provider: "netlify-identity",
    subject: user.id,
    email: user.email ?? null,
    displayName: user.name ?? user.email ?? null
  };
}

export async function getTenantSession(): Promise<{ identity: VerifiedIdentity; session: TenantSession } | null> {
  const identity = await getVerifiedIdentity();
  if (!identity) return null;
  const cookieStore = await cookies();
  const selectedOrganizationId = cookieStore.get("vl_org")?.value ?? null;
  const session = await resolveTenantSession(identity, selectedOrganizationId);
  return session ? { identity, session } : null;
}

export async function getIdentityState() {
  const identity = await getVerifiedIdentity();
  if (!identity) return { identity: null, memberships: [] };
  const resolved = await resolveIdentity(identity);
  return { identity, memberships: resolved.memberships };
}
