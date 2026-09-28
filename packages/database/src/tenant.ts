import { randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import { setIdentityContext, setTenantContext, withTransaction } from "./client";
import type { MembershipSummary, TenantRole, TenantSession, VerifiedIdentity } from "./types";

interface IdentityResolution {
  userId: string;
  memberships: MembershipSummary[];
}

async function ensureIdentity(client: PoolClient, identity: VerifiedIdentity): Promise<string> {
  await setIdentityContext(client, identity.provider, identity.subject);

  const existing = await client.query<{ user_id: string }>(
    "SELECT user_id FROM user_identities WHERE provider=$1 AND subject=$2 LIMIT 1",
    [identity.provider, identity.subject]
  );
  if (existing.rows[0]) {
    await setIdentityContext(client, identity.provider, identity.subject, existing.rows[0].user_id);
    return existing.rows[0].user_id;
  }

  const userId = randomUUID();
  await setIdentityContext(client, identity.provider, identity.subject, userId);
  await client.query(
    "INSERT INTO users(id, display_name, email) VALUES ($1,$2,$3)",
    [userId, identity.displayName ?? null, identity.email?.toLowerCase() ?? null]
  );
  await client.query(
    "INSERT INTO user_identities(id,user_id,provider,subject) VALUES ($1,$2,$3,$4)",
    [randomUUID(), userId, identity.provider, identity.subject]
  );
  return userId;
}

async function listMemberships(client: PoolClient, userId: string): Promise<MembershipSummary[]> {
  const result = await client.query<{
    organization_id: string;
    role: TenantRole;
    status: "active" | "invited" | "disabled";
  }>(
    "SELECT organization_id, role, status FROM memberships WHERE user_id=$1 ORDER BY created_at",
    [userId]
  );
  return result.rows.map((row) => ({
    organizationId: row.organization_id,
    role: row.role,
    status: row.status
  }));
}

export async function resolveIdentity(identity: VerifiedIdentity): Promise<IdentityResolution> {
  return withTransaction(async (client) => {
    const userId = await ensureIdentity(client, identity);
    const memberships = await listMemberships(client, userId);
    return { userId, memberships };
  });
}

export async function resolveTenantSession(
  identity: VerifiedIdentity,
  selectedOrganizationId?: string | null
): Promise<TenantSession | null> {
  return withTransaction(async (client) => {
    const userId = await ensureIdentity(client, identity);
    const memberships = (await listMemberships(client, userId)).filter((item) => item.status === "active");
    if (!memberships.length) return null;

    const membership =
      memberships.find((item) => item.organizationId === selectedOrganizationId) ??
      memberships[0]!;
    await setTenantContext(client, userId, membership.organizationId);

    const grants = await client.query<{ venue_id: string }>(
      "SELECT venue_id FROM membership_venue_grants WHERE organization_id=$1 AND membership_id=(SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2)",
      [membership.organizationId, userId]
    );
    const allVenues = await client.query<{ id: string }>(
      "SELECT id FROM venues WHERE organization_id=$1 AND active=true ORDER BY created_at",
      [membership.organizationId]
    );

    const grantedIds = grants.rows.map((row) => row.venue_id);
    const venueIds = membership.role === "owner" || membership.role === "admin"
      ? allVenues.rows.map((row) => row.id)
      : grantedIds;

    return {
      userId,
      organizationId: membership.organizationId,
      role: membership.role,
      venueIds,
      defaultVenueId: venueIds[0] ?? null
    };
  });
}

export async function withTenantTransaction<T>(
  identity: VerifiedIdentity,
  organizationId: string,
  fn: (client: PoolClient, session: TenantSession) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    const userId = await ensureIdentity(client, identity);
    const memberships = await listMemberships(client, userId);
    const membership = memberships.find(
      (item) => item.organizationId === organizationId && item.status === "active"
    );
    if (!membership) throw new Error("Organization access denied");

    await setTenantContext(client, userId, organizationId);
    const venueResult = await client.query<{ id: string }>(
      membership.role === "owner" || membership.role === "admin"
        ? "SELECT id FROM venues WHERE organization_id=$1 AND active=true ORDER BY created_at"
        : "SELECT g.venue_id AS id FROM membership_venue_grants g JOIN memberships m ON m.organization_id=g.organization_id AND m.id=g.membership_id WHERE g.organization_id=$1 AND m.user_id=$2 ORDER BY g.created_at",
      membership.role === "owner" || membership.role === "admin"
        ? [organizationId]
        : [organizationId, userId]
    );
    const venueIds = venueResult.rows.map((row) => row.id);
    return fn(client, {
      userId,
      organizationId,
      role: membership.role,
      venueIds,
      defaultVenueId: venueIds[0] ?? null
    });
  });
}

export async function createOrganizationAndVenue(
  identity: VerifiedIdentity,
  input: { organizationName: string; venueName: string; timezone: string; currency?: string }
): Promise<TenantSession> {
  return withTransaction(async (client) => {
    const userId = await ensureIdentity(client, identity);
    const organizationId = randomUUID();
    const venueId = randomUUID();
    const membershipId = randomUUID();
    const slugBase = input.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "venue";
    const slug = `${slugBase}-${organizationId.slice(0, 8)}`;

    await setTenantContext(client, userId, organizationId);
    await client.query(
      "INSERT INTO organizations(id,name,slug,default_currency) VALUES ($1,$2,$3,$4)",
      [organizationId, input.organizationName.trim(), slug, input.currency ?? "USD"]
    );
    await client.query(
      "INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES ($1,$2,$3,'owner','active')",
      [membershipId, organizationId, userId]
    );
    await client.query(
      "INSERT INTO venues(id,organization_id,name,timezone,currency) VALUES ($1,$2,$3,$4,$5)",
      [venueId, organizationId, input.venueName.trim(), input.timezone, input.currency ?? "USD"]
    );

    return {
      userId,
      organizationId,
      role: "owner",
      venueIds: [venueId],
      defaultVenueId: venueId
    };
  });
}
