# Implementation status

Architecture-first initialization is complete and application implementation has started.

## Implemented on the current integrations feature branch

- Next.js/React application workspace and VenueLoom integrations route.
- Branded Integrations & Migration dashboard UI.
- Searchable provider catalog with 30+ CRM, accounting, calendar, email, payment, marketing, automation, scheduling, document, storage, communications, data and venue-system entries.
- Capability metadata per provider so migration, inbound, outbound and two-way modes are represented per object rather than globally.
- Generic CSV/XLS/XLSX migration engine for clients, inquiries, events, invoices, payments, vendors and staff.
- File-size and row-count limits.
- Header auto-mapping and mapping coverage checks.
- Normalization for email, phone, dates, whole numbers, money and booleans.
- Deterministic row validation and in-file duplicate detection.
- Server-side dry-run API with create/skip/error totals and row-level review results.
- Migration wizard UI, Sync Center foundation, and conflict-resolution UI.
- PostgreSQL migration file for import runs/rows plus connection/external-mapping foundation.

## Deliberately gated

Production import **commit** is not enabled yet. VenueLoom does not yet have the authenticated organization-membership database context required by the architecture. Enabling writes before that exists would allow an upload/request to choose or spoof a tenant.

Provider OAuth/API credentials and live sync are also not activated merely because their cards appear in the catalog. Each adapter must pass the release gates in docs/architecture/integration-migration-hub.md.

The next persistence step is to wire verified authentication → active organization membership → transaction-local database tenant context, apply RLS, then connect the import commit adapter to the target CRM/event/finance repositories.
