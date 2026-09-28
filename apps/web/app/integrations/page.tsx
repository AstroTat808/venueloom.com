import { getUser } from "@netlify/identity";
import { resolveWorkspace } from "@venueloom/database";
import { providerCatalog } from "@venueloom/integrations";
import { redirect } from "next/navigation";
import { IntegrationsDashboard } from "./ui";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await getUser();
  if (!user?.id || !user.email) redirect("/login");

  const principal = await resolveWorkspace({
    provider: "netlify",
    subject: user.id,
    email: user.email,
    displayName: user.name ?? null
  });

  if (!principal) redirect("/setup");

  return (
    <IntegrationsDashboard
      providers={providerCatalog}
      workspace={{
        organizationId: principal.organizationId,
        organizationName: principal.organizationName,
        role: principal.role,
        userName: user.name ?? user.email,
        venues: principal.venues
      }}
    />
  );
}
