import type { PoolClient } from "@neondatabase/serverless";

export type TenantRole = "owner" | "admin" | "sales" | "event_manager" | "staff" | "finance";

export interface VerifiedIdentity {
  provider: string;
  subject: string;
  email?: string | null;
  displayName?: string | null;
}

export interface MembershipSummary {
  organizationId: string;
  role: TenantRole;
  status: "active" | "invited" | "disabled";
}

export interface TenantSession {
  userId: string;
  organizationId: string;
  role: TenantRole;
  venueIds: string[];
  defaultVenueId: string | null;
}

export type TenantClient = PoolClient;
