import type { PoolClient } from "pg";
import { setLocalContext, withTransaction } from "./client";
import type { WorkspacePrincipal } from "./workspace";

export function withTenantTransaction<T>(
  principal: WorkspacePrincipal,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    await setLocalContext(client, {
      userId: principal.userId,
      organizationId: principal.organizationId
    });
    return fn(client);
  });
}

export function assertVenueAccess(principal: WorkspacePrincipal, venueId: string) {
  if (!principal.venueIds.includes(venueId)) {
    const error = new Error("Venue access denied.");
    Object.assign(error, { status: 403 });
    throw error;
  }
}
