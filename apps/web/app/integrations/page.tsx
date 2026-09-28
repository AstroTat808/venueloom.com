import { providerCatalog } from "@venueloom/integrations";
import { IntegrationsDashboard } from "./ui";

export default function IntegrationsPage() {
  return <IntegrationsDashboard providers={providerCatalog} />;
}
