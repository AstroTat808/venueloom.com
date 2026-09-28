import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { oneOrNull, setLocalContext, withTransaction } from "./client";

export type WorkspaceRole = "owner" | "admin" | "sales" | "event_manager" | "staff" | "finance";

export interface IdentityInput {
  provider: "netlify";
  subject: string;
  email: string;
  displayName?: string | null;
}

export interface WorkspaceMembership {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: WorkspaceRole;
}

export interface WorkspacePrincipal extends WorkspaceMembership {
  userId: string;
  email: string;
  venueIds: string[];
  venues: Array<{ id: string; name: string; timezone: string; currency: string }>;
}

async function resolveIdentity(client: PoolClient, identity: IdentityInput): Promise<string> {
  const linked = await oneOrNull<{ user_id: string }>(
    client,
    "SELECT user_id FROM user_identities WHERE provider = $1 AND subject = $2",
    [identity.provider, identity.subject]
  );
  if (linked) return linked.user_id;

  const existing = await oneOrNull<{ id: string }>(
    client,
    "SELECT id FROM users WHERE lower(email) = lower($1)",
    [identity.email]
  );
  const userId = existing?.id ?? randomUUID();

  if (!existing) {
    await client.query(
      "INSERT INTO users (id, display_name, email) VALUES ($1,$2,$3)",
      [userId, identity.displayName ?? null, identity.email]
    );
  }

  await client.query(
    "INSERT INTO user_identities (id, user_id, provider, subject, email_at_link) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (provider, subject) DO NOTHING",
    [randomUUID(), userId, identity.provider, identity.subject, identity.email]
  );
  return userId;
}

export async function listMemberships(identity: IdentityInput): Promise<{ userId: string; memberships: WorkspaceMembership[] }> {
  return withTransaction(async (client) => {
    const userId = await resolveIdentity(client, identity);
    await setLocalContext(client, { userId });

    const result = await client.query<{
      membership_id: string;
      organization_id: string;
      organization_name: string;
      organization_slug: string;
      role: WorkspaceRole;
    }>(
      `SELECT m.id AS membership_id, m.organization_id, o.name AS organization_name,
              o.slug AS organization_slug, m.role
         FROM memberships m
         JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = $1 AND m.status = 'active'
        ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, o.name`,
      [userId]
    );

    return {
      userId,
      memberships: result.rows.map((row) => ({
        membershipId: row.membership_id,
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        organizationSlug: row.organization_slug,
        role: row.role
      }))
    };
  });
}

export async function resolveWorkspace(
  identity: IdentityInput,
  requestedOrganizationId?: string | null
): Promise<WorkspacePrincipal | null> {
  const { userId, memberships } = await listMemberships(identity);
  const membership = requestedOrganizationId
    ? memberships.find((item) => item.organizationId === requestedOrganizationId)
    : memberships[0];

  if (!membership) return null;

  return withTransaction(async (client) => {
    await setLocalContext(client, { userId, organizationId: membership.organizationId });

    const allVenues = await client.query<{ id: string; name: string; timezone: string; currency: string }>(
      `SELECT id, name, timezone, currency
         FROM venues
        WHERE organization_id = $1 AND active = true
        ORDER BY name`,
      [membership.organizationId]
    );

    let venues = allVenues.rows;
    if (!["owner", "admin"].includes(membership.role)) {
      const grants = await client.query<{ id: string; name: string; timezone: string; currency: string }>(
        `SELECT v.id, v.name, v.timezone, v.currency
           FROM membership_venue_grants g
           JOIN venues v ON v.organization_id = g.organization_id AND v.id = g.venue_id
          WHERE g.organization_id = $1 AND g.membership_id = $2 AND v.active = true
          ORDER BY v.name`,
        [membership.organizationId, membership.membershipId]
      );
      venues = grants.rows;
    }

    return {
      ...membership,
      userId,
      email: identity.email,
      venueIds: venues.map((venue) => venue.id),
      venues
    };
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
}

export async function bootstrapFirstOrganization(
  identity: IdentityInput,
  input: {
    organizationName: string;
    venueName: string;
    timezone: string;
    currency?: string;
  }
): Promise<WorkspacePrincipal> {
  const existing = await listMemberships(identity);
  if (existing.memberships.length) {
    const principal = await resolveWorkspace(identity, existing.memberships[0]!.organizationId);
    if (!principal) throw new Error("Membership could not be resolved.");
    return principal;
  }

  return withTransaction(async (client) => {
    const userId = await resolveIdentity(client, identity);
    if (process.env.VENUELOOM_ALLOW_OWNER_BOOTSTRAP !== "true") {
      throw new Error("Owner bootstrap is disabled. Enable VENUELOOM_ALLOW_OWNER_BOOTSTRAP only while creating an approved first workspace.");
    }

    const organizationId = randomUUID();
    const membershipId = randomUUID();
    const venueId = randomUUID();
    await setLocalContext(client, { userId, organizationId });

    const baseSlug = slugify(input.organizationName) || "venue";
    const slug = `${baseSlug}-${organizationId.slice(0, 8)}`;

    await client.query(
      "INSERT INTO organizations (id, name, slug, default_currency) VALUES ($1,$2,$3,$4)",
      [organizationId, input.organizationName, slug, input.currency ?? "USD"]
    );
    await client.query(
      "INSERT INTO memberships (id, organization_id, user_id, role, status) VALUES ($1,$2,$3,'owner','active')",
      [membershipId, organizationId, userId]
    );
    await client.query(
      `INSERT INTO venues (id, organization_id, name, timezone, currency)
       VALUES ($1,$2,$3,$4,$5)`,
      [venueId, organizationId, input.venueName, input.timezone, input.currency ?? "USD"]
    );
    await client.query(
      `INSERT INTO venue_calendars (id, organization_id, venue_id, name, resource_kind, timezone)
       VALUES ($1,$2,$3,$4,'venue',$5)`,
      [randomUUID(), organizationId, venueId, `${input.venueName} Calendar`, input.timezone]
    );

    return {
      membershipId,
      organizationId,
      organizationName: input.organizationName,
      organizationSlug: slug,
      role: "owner",
      userId,
      email: identity.email,
      venueIds: [venueId],
      venues: [{ id: venueId, name: input.venueName, timezone: input.timezone, currency: input.currency ?? "USD" }]
    };
  });
}
