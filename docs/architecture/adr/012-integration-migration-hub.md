# ADR 012 — Capability-driven Integration Hub

Status: accepted · 27 September 2026.

## Context

VenueLoom customers may already operate in HoneyBook, Dubsado, Quicken/QuickBooks, calendars, payment systems, spreadsheets and other venue software. Forcing a hard cutover increases onboarding risk. Building a separate importer or sync path for every provider would duplicate deduplication, retries, security, conflict handling and audit behavior.

Third-party platforms also expose uneven capabilities. Some have OAuth APIs and webhooks, some expose only automation-platform triggers/actions, and some are primarily file migration sources. Treating every provider as a generic "two-way integration" would create unsafe promises and data loss.

## Decision

VenueLoom will implement one organization-scoped Integration Hub with:

- provider capability manifests
- concrete provider adapters behind a canonical contract
- a generic CSV/XLSX/file migration engine
- durable connection, mapping, cursor, run/item and conflict state
- verified webhook inbox plus transactional outbox
- per-object sync direction and source-of-truth policy
- origin/correlation/hash loop suppression
- resumable imports with discovery, mapping, dry run, exception review and reconciliation
- explicit release gates before an object family can be labeled two-way

Provider payloads are normalized into VenueLoom domain commands. They never bypass reservation, financial, document or tenant invariants.

## Consequences

### Positive

- Users can migrate gradually instead of performing a risky all-at-once cutover.
- One sync framework can support CRM, accounting, calendar and automation providers.
- Provider limitations are visible and honest at the object/action level.
- Imported/synchronized records remain traceable to an external source.
- Retry, conflict, dedupe and audit behavior is consistent across providers.
- A provider can move from file import to deeper API integration without changing VenueLoom's business ownership model.

### Costs

- The platform carries mapping/cursor/conflict infrastructure before every provider uses every capability.
- Two-way sync needs substantial provider-specific testing.
- Some providers will remain migration-only or asymmetric indefinitely.
- Customer support tooling must surface sync health and exceptions clearly.

## Rejected alternatives

### Hard cutover only

Rejected because it raises switching friction and does not support customers who must keep accounting/calendar/CRM systems in parallel.

### Provider-specific tables and cron jobs

Rejected because each provider would reinvent mapping, retries, reconciliation and audit semantics.

### Universal last-write-wins

Rejected because it can corrupt booking dates, financial documents, payments and signed contracts.

### Password-based scraping

Rejected because it creates unacceptable credential, reliability and provider-policy risk. VenueLoom uses documented APIs, supported automation bridges or user-provided export files.

### External-system-as-database

Rejected because VenueLoom's tenant, booking, document and financial invariants must remain enforceable even during provider outages.

## Operational rule

"Connected" does not mean "two-way." The UI may display **Migration**, **One-way**, or **Two-way** only from the adapter's validated capability manifest and enabled per-object policy.

See [Integration and Migration Hub](../integration-migration-hub.md).
