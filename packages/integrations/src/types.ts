export type ProviderCategory =
  | "crm"
  | "accounting"
  | "calendar"
  | "email"
  | "payments"
  | "marketing"
  | "automation"
  | "scheduling"
  | "documents"
  | "storage"
  | "communications"
  | "data"
  | "venue"
  | "lodging";

export type ProviderImplementation =
  | "ready"
  | "foundation"
  | "bridge"
  | "migration"
  | "planned";

export type ConnectionMethod =
  | "oauth"
  | "api_key"
  | "webhook_bridge"
  | "file"
  | "partner_api";

export type SyncMode = "migration" | "inbound" | "outbound" | "two_way";

export type IntegrationObject =
  | "contacts"
  | "clients"
  | "inquiries"
  | "events"
  | "calendar"
  | "appointments"
  | "invoices"
  | "payments"
  | "estimates"
  | "contracts"
  | "files"
  | "vendors"
  | "staff"
  | "tasks"
  | "email"
  | "campaigns"
  | "audiences"
  | "notifications"
  | "lodging_reservations";

export interface ProviderCapability {
  object: IntegrationObject;
  modes: SyncMode[];
}

export interface ProviderDefinition {
  id: string;
  name: string;
  shortName: string;
  category: ProviderCategory;
  description: string;
  implementation: ProviderImplementation;
  connectionMethod: ConnectionMethod;
  capabilities: ProviderCapability[];
  launchWave: 0 | 1 | 2 | 3;
  docsUrl?: string;
  verifiedAt?: string;
  notes?: string;
}
