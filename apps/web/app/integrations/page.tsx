import { redirect } from "next/navigation";
import { withTenantTransaction } from "@venueloom/database";
import { getTenantSession, getIdentityState } from "../../lib/auth";
import { IntegrationsDashboard } from "./ui";
import { providerCatalog } from "@venueloom/integrations";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const tenant = await getTenantSession();
  if (!tenant) {
    const identity = await getIdentityState();
    redirect(identity.identity ? "/onboarding" : "/login");
  }

  const workspace = await withTenantTransaction(
    tenant.identity,
    tenant.session.organizationId,
    async (client, session) => {
      const org = await client.query<{ name: string }>("SELECT name FROM organizations WHERE id=$1", [session.organizationId]);
      const venues = await client.query<{ id: string; name: string }>(
        "SELECT id,name FROM venues WHERE organization_id=$1 AND active=true ORDER BY created_at",
        [session.organizationId]
      );
      return {
        organizationName: org.rows[0]?.name ?? "VenueLoom",
        venues: venues.rows
      };
    }
  );

  return (
    <IntegrationsDashboard
      providers={providerCatalog}
      organizationName={workspace.organizationName}
      venues={workspace.venues}
    />
  );
}
