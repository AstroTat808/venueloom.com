# Delivery sequence and release gates

The architecture is committed first. The approved design then moves into the repository on this foundation. Planned features are not represented as live services.

| Phase | Deliverables | Exit evidence |
| --- | --- | --- |
| 0 — Foundation | Architecture, ADRs, repo structure, brand assets/tokens, CI, environment contract, Integration Hub contracts/provider capability model | Architecture commit precedes application commit |
| 1 — Operations core | Authentication adapter, organization/venue model, clients, inquiries, inquiry booking, events, tasks, staff/vendor directory, manual contract/payment registers, generic CSV/XLSX migration engine + dry run/mapping/dedupe/reconciliation | Tenant isolation, transactional conversion, booking conflicts, idempotent re-import, edits persist, build/type checks |
| 2 — Team and migration onboarding | Invitations, venue grants, full role filters, spaces/holds, staffing availability, event timeline, private uploads, HoneyBook/Dubsado migration profiles, Zapier/Make bridge | Permission matrix, parallel booking tests, provider fixture imports, row-level exception reports, portal field isolation |
| 3 — Sales and commercial | Versioned proposals/contracts, signature provider, invoices/installments, merchant integration | Immutable document versions; provider test-mode signature/payment/refund lifecycle |
| 4 — Portals and live integrations | Scoped client/vendor portals, reminders, calendar/email sync, provider webhooks, sync policies/cursors/runs/conflicts, outbox worker, Sync Center | Expiry/revocation, replay/retry/dead-letter tests, conflict handling, loop suppression, delivery visibility |
| 5 — Growth and accounting | SaaS subscriptions/entitlements, QuickBooks Online/accounting sync, advanced reports, multi-property operations, inventory/payroll where needed | Accounting reconciliation, concurrent external edits, export/retention, load tests and operational recovery |

## Integration release gates

A migration adapter ships only after source fixtures prove:

- discover/count before write
- explicit field/status mapping
- deterministic validation errors
- duplicate detection and review
- dry-run create/update/skip/conflict totals
- resumable/idempotent batch execution
- post-import count and financial-total reconciliation
- tenant isolation and import-file access controls

A connector is labeled **two-way** only for object families that pass:

- initial backfill and incremental create/update
- duplicate/out-of-order webhook or poll delivery
- provider rate limiting and temporary outage
- expired/revoked authorization
- concurrent local/external edit
- timeout with unknown remote outcome
- echo-loop suppression
- disconnect/reconnect
- delete/archive semantics
- financial/legal conflict policy where applicable

## Decisions intentionally deferred

These are provider/business settings behind already-defined boundaries, not gaps in who owns the data:

- Merchant-of-record/connected-account responsibilities, fees, disputes and application fee model before Stripe Connect implementation.
- Signature, outbound email and object-storage providers before those workflows ship.
- Subscription prices, feature limits, trial and cancellation policies before charging for VenueLoom.
- Retention periods, recovery objectives and support access policy before a paid public launch.
- Venue-specific hold duration, cancellation/deposit policy and calendar availability rules before automated client booking.
- Provider-specific live sync scope remains capability-driven and is revalidated against the provider's supported API/webhook surface before release.

## Verification strategy

Database tests target tenant isolation, composite links, concurrent booking, transaction rollback, idempotency replay/mismatch, immutable receipts, integration mapping uniqueness, cursor advancement, and optimistic edits. Domain tests target money bounds, date/time conversion including DST folds/gaps, state transitions, sync conflict policy and permission decisions. Avoid tests that merely repeat a field list.

UI acceptance covers marketing at 1440 and 390 pixels and workspace at 1366, 768 and 390 pixels: no horizontal overflow, keyboard navigation, visible focus, labelled controls, clear empty/loading/error states, and usable dialogs. Integration onboarding must expose direction/source-of-truth choices in plain language, show dry-run totals before import, and make conflicts/errors recoverable without support intervention. Compare hero proportions, typography, logo, dashboard silhouette, colors and lower benefit row to the provided sheet. Photographic/screen-rendering differences mean visual fidelity should be reviewed at matching viewport sizes, not described as mathematically pixel-perfect without comparison.

CI runs reproducible dependency installation, type checking, domain/database tests and production build. A PostgreSQL service job verifies database features unavailable in an emulator. Deployment preview follows a green PR. Production applies reviewed migrations with separate credentials and runs smoke checks before traffic promotion.

## Migration and release runbook

1. Create feature branch and schema-only/sanitized database branch.
2. Add numbered migration and data-access/domain changes; include compatibility/backfill plan if changing existing fields.
3. Run tests and build. Never edit a migration already applied in a shared environment.
4. Review PR and preview with test integrations.
5. Back up/check restore point; run migration with migration credentials against the intended environment.
6. Deploy application, run auth/tenant/booking/integration smoke checks and monitor errors/outbox/sync backlog.
7. Roll back compatible application release or apply a forward fix; restore database only with explicit recovery plan and data-loss assessment.
