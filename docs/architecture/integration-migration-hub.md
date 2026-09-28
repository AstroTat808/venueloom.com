# Integration and migration hub

Status: foundation design · 27 September 2026.

VenueLoom treats migration and coexistence as product capabilities, not support-only data work. A venue operator should be able to bring an existing business into VenueLoom with a controlled import, keep selected systems connected while evaluating VenueLoom, or run a long-term two-way integration where the external platform exposes sufficient APIs.

The user-facing product name is **Integrations & Migration**. The internal boundary is the **Integration Hub**.

## Product goals

1. Make switching to VenueLoom low-risk. Users can preview, map, deduplicate and validate data before committing an import.
2. Allow gradual adoption. A customer may migrate CRM first while keeping accounting, calendar or another CRM connected.
3. Support coexistence without creating sync loops, duplicate clients, double invoices or competing workflow automations.
4. Make provider limitations explicit. "Two-way sync" is enabled per object and operation, not advertised globally when a provider only exposes partial actions.
5. Make every imported or synchronized record traceable to its source and reversible where business rules permit.
6. Add new providers through one adapter contract rather than bespoke database columns and one-off cron jobs.

## User experience

### Onboarding entry point

During organization onboarding, show:

**Bring your business with you**

- Start fresh
- Import from another platform
- Connect another platform and keep it in sync
- Upload a spreadsheet or export file

The provider picker is searchable and grouped into CRM, accounting, calendar, payments, email/marketing, storage, automation and generic file import.

Recommended launch providers:

- HoneyBook
- Dubsado
- QuickBooks Online
- Quicken Classic / Quicken Business & Personal
- Quicken Simplifi
- Google Calendar
- Microsoft Outlook Calendar
- Stripe
- Square
- PayPal
- Xero
- Gmail / Google Workspace
- Microsoft 365 / Outlook
- Zapier / Make webhook bridge
- CSV / XLSX generic importer

The catalog can show "Coming soon" providers without creating fake connections.

### Three connection modes

Every provider capability declares one or more supported modes:

| Mode | Meaning | Example |
| --- | --- | --- |
| Migration | Historical one-time import with preview and reconciliation | Dubsado project CSV into inquiries/events |
| One-way sync | External -> VenueLoom or VenueLoom -> external | VenueLoom invoices -> accounting |
| Two-way sync | Both sides can create/update supported objects with loop suppression and conflict handling | QuickBooks customer/invoice/payment sync where configured |

Mode is configured per object family. A connection may be two-way for contacts but one-way for invoices and migration-only for documents.

### Migration wizard

The migration wizard is a durable multi-step job, not a single HTTP request:

1. **Connect or upload** — OAuth/API-key connection when supported; otherwise CSV/XLSX/QIF/OFX/provider export.
2. **Discover** — count supported source objects and date ranges without writing VenueLoom records.
3. **Map** — map source fields, statuses, event types, locations, staff, tax categories and custom fields to VenueLoom.
4. **Match & dedupe** — identify likely existing clients, events and invoices using deterministic keys plus reviewable fuzzy suggestions.
5. **Dry run** — validate every record and show create/update/skip/conflict totals.
6. **Review exceptions** — user resolves ambiguous matches, invalid dates, currencies, duplicate emails and unsupported statuses.
7. **Import** — commit in bounded batches with resumable cursors and idempotency.
8. **Reconcile** — compare source counts/totals against VenueLoom results and publish a migration report.
9. **Choose coexistence** — disconnect source, keep read-only sync, or enable supported ongoing directions.

A failed batch can be retried without duplicating already imported records.

### Integration settings

Each organization gets **Settings -> Integrations & Migration** with:

- Connected / available provider cards
- Connection health and authorization expiry
- Environment/account identity
- Sync mode by object family
- Direction arrows showing which system can create/update
- Source-of-truth preference
- Field/status mapping profile
- Last successful sync, next poll if applicable and webhook status
- Import history and downloadable exception report
- Conflict review queue
- Failed sync/dead-letter queue with retry
- "Pause sync", "Sync now", "Reauthorize", "Disconnect"
- Destructive disconnect warning explaining which records remain in VenueLoom

A separate **Sync Center** provides organization-wide operational history: provider, object, direction, action, outcome, source ID, VenueLoom ID, duration, retry count and correlation ID.

## Provider capability model

Provider support is data-driven. The application must not infer capabilities from provider name.

A provider manifest declares:

- auth: OAuth2, API key, service account, webhook secret, file import, bridge
- transport: REST, GraphQL, webhook, polling, file
- object families: contacts, clients, inquiries/projects, events, invoices, payments, tasks, appointments, files, vendors, staff
- operations per object: discover, read, create, update, archive/delete, webhook/poll
- direction: inbound, outbound, bidirectional
- cursor strategy: webhook + reconcile, modified-since, page token, full scan hash
- provider concurrency/rate-limit hints
- external version token support
- export/import formats
- provider-specific limitations shown in UI

Capability checks happen server-side before a sync job is queued.

## Initial provider strategy

The following reflects public provider capabilities verified on 27 September 2026 and must be revalidated before implementation because third-party APIs change.

### HoneyBook

HoneyBook publicly documents a Zapier connection using a user-level API key. Its help center states that custom HoneyBook fields are not currently supported by the Zapier integration. HoneyBook can export contacts to CSV and can import contacts/projects from CSV/XLS/XLSX.

VenueLoom implementation:

- **Migration:** guided CSV/XLSX import for contacts, leads/projects and financial summaries where source exports provide them.
- **Coexistence:** official Zapier/Make-style bridge into VenueLoom inbound webhooks and VenueLoom outbound events where HoneyBook exposes the required trigger/action.
- **Direct API:** do not depend on an undocumented general-purpose HoneyBook API.
- **UI:** show capability-specific limitations instead of a blanket two-way badge.

### Dubsado

Dubsado publicly documents API keys for its Zapier connection. Current Zapier triggers include new lead/job projects, payments, contract signed and project status changes. The documented outbound Dubsado action is currently Create Project. Dubsado supports CSV exports for contacts/projects including mapped fields and invoice totals.

VenueLoom implementation:

- **Migration:** CSV importer with mappings for contacts, project status, event dates, custom fields and invoice totals.
- **Inbound coexistence:** strong via Dubsado trigger -> bridge -> VenueLoom webhook.
- **Outbound coexistence:** limited to operations Dubsado exposes, currently most usefully project creation.
- **Conflict UI:** clearly mark object families that are not writable back to Dubsado.

### Quicken

Quicken Classic and Quicken cloud companion products are not treated as a public third-party CRM/accounting API surface. Quicken documents data export/manual import capabilities and product-internal cloud synchronization. Quicken Simplifi also documents file import and separate product boundaries.

VenueLoom implementation:

- **Migration:** file-based import for financial history where the user's Quicken product can export a supported CSV/QIF/OFX/QFX format.
- **Coexistence:** no screen scraping and no request for Quicken usernames/passwords.
- **Ongoing accounting:** recommend a direct supported accounting connector such as QuickBooks Online or Xero when the user wants durable two-way accounting synchronization.

### QuickBooks Online

QuickBooks Online has a formal OAuth 2.0 accounting API and webhook model. Entity updates include provider-side version tokens such as SyncToken.

VenueLoom implementation:

- **OAuth2 connection** scoped per QuickBooks company/realm.
- **Two-way eligible objects:** customers, invoices, payments, estimates and selected reference data, subject to VenueLoom accounting policy.
- **Webhook-first inbound changes** plus periodic reconciliation polling.
- **Conflict safety:** preserve QuickBooks SyncToken/external version and require a fresh read before update after conflicts.
- **Financial authority:** configurable per object. VenueLoom never silently overwrites settled payment history.

## Canonical integration contract

Each provider adapter implements the narrow capabilities it actually supports. The application layer does not call provider SDKs directly.

Conceptual TypeScript contract:

```ts
type SyncDirection = "inbound" | "outbound";

type ExternalObjectType =
  | "contact"
  | "client"
  | "inquiry"
  | "event"
  | "invoice"
  | "payment"
  | "task"
  | "appointment"
  | "vendor"
  | "file";

interface IntegrationAdapter {
  provider: string;
  capabilities(): ProviderCapabilities;

  testConnection(connection: IntegrationConnection): Promise<ConnectionHealth>;

  discover?(
    connection: IntegrationConnection,
    request: DiscoveryRequest,
  ): AsyncIterable<ExternalRecordSummary>;

  pull?(
    connection: IntegrationConnection,
    request: PullRequest,
  ): AsyncIterable<ExternalChange>;

  push?(
    connection: IntegrationConnection,
    change: CanonicalChange,
  ): Promise<PushResult>;

  verifyWebhook?(request: RawWebhookRequest): Promise<VerifiedWebhook>;
}
```

Adapters normalize provider payloads into versioned canonical DTOs before domain commands run. Provider payload JSON is retained only where useful for diagnostics/audit and never becomes the business source of truth.

## Canonical object mapping

VenueLoom remains authoritative for VenueLoom relationships. Provider records are mapped, not reparented.

Examples:

| External concept | VenueLoom target |
| --- | --- |
| HoneyBook/Dubsado contact | contact + client/client_contact |
| CRM project/lead | inquiry or event depending on mapped status |
| booked project | event plus source inquiry where enough history exists |
| appointment | tour/calendar appointment |
| invoice | invoice + immutable source snapshot |
| payment | payment + allocation where invoice mapping exists |
| contract signed signal | source activity unless full signed document/evidence can be imported |
| vendor | vendor |
| task | task |

A project import never auto-confirms a venue reservation without checking venue/date conflicts. Imported historical events can be marked historical without reserving present inventory.

## Sync data model

Add the following organization-scoped tables as integration work begins:

### integration_connections

Stores one authorized external account.

Key fields:

- organization_id
- provider_code
- connection_name
- environment
- external_account_id / realm_id
- auth_type
- secret_ref or encrypted credential envelope
- granted_scopes
- status: active, degraded, reauth_required, paused, revoked
- authorized_by_membership_id
- authorized_at, expires_at, revoked_at
- last_health_check_at

Secrets are never returned to normal UI DTOs.

### integration_sync_policies

One row per connection/object family.

- object_type
- inbound_enabled
- outbound_enabled
- source_of_truth: venueloom, external, newest, manual_conflict
- create_policy
- update_policy
- delete/archive policy
- historical_start_at
- field_mapping_version
- status_mapping_version

Financial objects default to conservative/manual conflict behavior.

### external_mappings

Stable identity bridge:

- connection_id
- object_type
- external_id
- internal_id
- external_parent_id if required
- external_version/etag/sync_token
- source_created_at
- source_updated_at
- last_seen_hash
- last_pulled_at
- last_pushed_at
- mapping_state

Unique on organization + connection + object_type + external_id and on the appropriate internal mapping where one-to-one is required.

### sync_cursors

Stores the last durable provider cursor, modified-since watermark or pagination token per connection/object. Cursor advances only after the associated changes are durably accepted.

### sync_runs and sync_items

A run is the durable attempt; items provide per-record results.

Run:

- connection, object type, direction, trigger
- started/finished times
- cursor_before/cursor_after
- discovered/created/updated/skipped/conflict/error counts
- state and correlation ID

Item:

- external ID/internal ID
- operation
- before/after hashes
- outcome
- error code/redacted message
- retry metadata

### sync_conflicts

Reviewable conflict queue:

- connection/object/internal/external IDs
- base snapshot hash
- VenueLoom candidate
- external candidate
- field-level conflict summary
- resolution: venueloom, external, merged, ignored
- resolved by/time
- resulting versions

Do not silently apply "last write wins" to invoices, payments, signed contracts, event dates or reservation state.

### import_runs, import_files and import_rows

Import files are private/quarantined. Parsed rows retain original row number, raw normalized source values, mapping result, validation status and committed target IDs so a migration is explainable and resumable.

## Change origin and loop prevention

Two-way sync must suppress echo loops.

Every synchronized mutation carries:

- origin_system
- origin_connection_id
- origin_external_event_id where present
- correlation_id
- canonical payload hash

Incoming external change -> verified inbox -> canonical translation -> idempotent VenueLoom command -> domain event/outbox.

When the resulting VenueLoom event is considered for outbound sync, the job suppresses an immediate write back to the same source connection when the canonical state matches the accepted inbound hash. A genuine later VenueLoom edit creates a new version/hash and may be pushed.

Never use timestamps alone for loop suppression.

## Conflict policy

For mutable low-risk CRM fields, users may choose VenueLoom wins, external wins, newest wins or manual review.

Always manual/reconciled for:

- reservation/event start/end when booking conflicts are possible
- issued invoices
- settled payments/refunds
- executed contracts
- tax/currency changes that affect totals
- destructive deletes

Provider version tokens are used when available. If a provider update fails because the external object changed, re-read and create a conflict rather than retrying the stale write indefinitely.

## Import matching and dedupe

Matching is deterministic first:

1. Existing external mapping
2. Provider-stable ID carried in prior import metadata
3. Exact normalized email + organization context
4. Exact invoice/document number scoped to source account
5. Exact event external ID/reference

Fuzzy matching (name + phone + event date, for example) produces review suggestions only. It never silently merges financial or legal records.

The importer supports:

- create
- update matched
- skip
- import as duplicate intentionally
- link-only to an existing VenueLoom record

Every bulk decision is previewed before commit.

## Webhook bridge for providers without direct APIs

VenueLoom exposes per-connection, secret-bearing integration endpoints designed for automation platforms:

- inbound event endpoint
- connection test endpoint
- optional schema metadata endpoint

The bridge accepts only a strict versioned VenueLoom integration event schema. Arbitrary incoming JSON does not directly write CRM rows.

Examples:

- HoneyBook booked project -> Zapier -> VenueLoom `crm.project.upsert.v1`
- Dubsado new lead -> Zapier -> VenueLoom `crm.inquiry.upsert.v1`
- VenueLoom new inquiry -> outbound webhook -> Zapier -> supported provider action

Each endpoint has rotation, rate limits, replay protection, tenant binding and audit history.

## Jobs and reliability

- Provider network calls run outside business transactions.
- Pull/webhook work is accepted into a durable inbox/outbox before processing.
- Jobs are idempotent and retry with bounded exponential backoff.
- Rate limits are provider-aware.
- Webhooks are reconciled by polling where the provider supports it; webhook receipt is not assumed to be complete history.
- Large migrations run in bounded batches and resume from committed checkpoints.
- A provider outage never blocks normal VenueLoom CRM/event operations.
- Dead-lettered items remain visible to admins and can be replayed after correction.

## Security and privacy

- Prefer OAuth over reusable API keys where a provider supports it.
- Never collect third-party passwords for scraping.
- Store OAuth refresh tokens/API keys in an encrypted envelope or secret manager; database stores only a secret reference plus non-sensitive metadata.
- Per-organization tenant isolation applies to connections, mappings, jobs, webhooks, imports and conflicts.
- Verify provider webhook signatures before accepting events.
- Generic bridge webhooks use high-entropy secrets, request timestamps and replay protection.
- Imported files are private, size-limited, malware-scanned/quarantined and auto-expire according to retention policy after reconciliation.
- The user must see requested scopes and choose which object families to sync.
- Revocation stops new sync work immediately without deleting VenueLoom records.
- Sensitive exports/import reports are audited.

## Accounting guardrails

An accounting connector does not turn the CRM database into a general ledger automatically.

VenueLoom distinguishes:

- booking value
- invoice state
- received venue payments
- provider payment attempts
- refunds/credits
- accounting postings

Before enabling write-back for a provider, define authority per object. A typical QuickBooks configuration may make VenueLoom authoritative for customers/invoices created by VenueLoom while QuickBooks remains authoritative for accounting classifications and reconciliation. Payment synchronization must deduplicate by provider/account/external transaction ID.

## Delivery order

### Integration foundation

Build before provider-specific UI:

1. provider manifest registry
2. integration_connections + encrypted secret abstraction
3. external_mappings
4. sync policies/cursors/runs/items/conflicts
5. canonical DTO/event schemas
6. webhook inbox/outbox integration
7. CSV/XLSX importer engine with preview and row-level results
8. Integrations & Migration settings UI
9. Sync Center and conflict resolution UI

### Provider wave 1

- Generic CSV/XLSX
- Dubsado migration
- HoneyBook migration
- Zapier/Make webhook bridge
- Google/Microsoft calendar adapters

### Provider wave 2

- QuickBooks Online OAuth + webhooks
- Stripe/Square/PayPal finance references
- Xero if demand warrants

### Provider wave 3

- Deeper CRM connectors as public/partner APIs permit
- Quicken file import templates
- Additional venue/event platforms based on customer demand

Provider order can change without changing the Integration Hub schema.

## Release gates

An adapter cannot be labeled two-way until tests cover:

- initial backfill
- incremental create/update
- duplicate delivery
- out-of-order delivery
- provider rate limit
- expired/revoked authorization
- local/external concurrent edit
- retry after timeout where provider outcome is unknown
- echo-loop suppression
- disconnect/reconnect
- source deletion/archive semantics
- tenant isolation
- financial conflict rules where applicable

Migration release additionally requires fixture exports from the supported provider version, dry-run totals, deterministic row errors and reconciliation evidence.

## Source references

Provider behavior changes. Revalidate before shipping a connector.

- HoneyBook Zapier integration: https://help.honeybook.com/en/articles/2209205-automate-tasks-with-zapier
- HoneyBook contact export: https://help.honeybook.com/en/articles/2650752-download-and-export-your-contacts-list-from-honeybook
- HoneyBook spreadsheet import: https://help.honeybook.com/en/articles/9242203-add-and-import-contacts-in-honeybook
- Dubsado Zapier triggers/actions: https://help.dubsado.com/en/articles/15920601-dubsado-triggers-and-actions-in-zapier
- Dubsado project export: https://help.dubsado.com/en/articles/15920571-exporting-project-data
- Quicken data access/export guidance: https://www.quicken.com/support/what-quicken-data-access-guarantee/
- Quicken cloud sync boundary: https://www.quicken.com/support/how-set-and-sync-accounts-quicken-your-mobile-device/
- QuickBooks Online webhooks: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/configure-webhooks
