# Delivery sequence and release gates

The architecture is committed first. The approved design then moves into the repository on this foundation. Planned features are not represented as live services.

| Phase | Deliverables | Exit evidence |
| --- | --- | --- |
| 0 — Foundation | Architecture, ADRs, repo structure, brand assets/tokens, CI, environment contract | Architecture commit precedes application commit |
| 1 — Operations core | Authentication adapter, organization/venue model, clients, inquiries, inquiry booking, events, tasks, staff/vendor directory, manual contract/payment registers | Tenant isolation, transactional conversion, booking conflicts, edits persist, build/type checks |
| 2 — Team and scheduling | Invitations, venue grants, full role filters, spaces/holds, staffing availability, event timeline, private uploads | Permission matrix and parallel booking tests; portal field isolation |
| 3 — Sales and commercial | Versioned proposals/contracts, signature provider, invoices/installments, merchant integration | Immutable document versions; provider test-mode signature/payment/refund lifecycle |
| 4 — Portals and automation | Scoped client/vendor portals, reminders, calendar/email sync, webhooks, outbox worker | Expiry/revocation, replay/retry/dead-letter tests, delivery visibility |
| 5 — Growth and accounting | SaaS subscriptions/entitlements, accounting sync, advanced reports, multi-property operations, inventory/payroll where needed | Reconciliation, export/retention, load tests and operational recovery |

## Decisions intentionally deferred

These are provider/business settings behind already-defined boundaries, not gaps in who owns the data:

- Merchant-of-record/connected-account responsibilities, fees, disputes and application fee model before Stripe Connect implementation.
- Signature, outbound email and object-storage providers before those workflows ship.
- Subscription prices, feature limits, trial and cancellation policies before charging for VenueLoom.
- Retention periods, recovery objectives and support access policy before a paid public launch.
- Venue-specific hold duration, cancellation/deposit policy and calendar availability rules before automated client booking.

## Verification strategy

Database tests target tenant isolation, composite links, concurrent booking, transaction rollback, idempotency replay/mismatch, immutable receipts, and optimistic edits. Domain tests target money bounds, date/time conversion including DST folds/gaps, state transitions and permission decisions. Avoid tests that merely repeat a field list.

UI acceptance covers marketing at 1440 and 390 pixels and workspace at 1366, 768 and 390 pixels: no horizontal overflow, keyboard navigation, visible focus, labelled controls, clear empty/loading/error states, and usable dialogs. Compare hero proportions, typography, logo, dashboard silhouette, colors and lower benefit row to the provided sheet. Photographic/screen-rendering differences mean visual fidelity should be reviewed at matching viewport sizes, not described as mathematically pixel-perfect without comparison.

CI runs reproducible dependency installation, type checking, domain/database tests and production build. A PostgreSQL service job verifies database features unavailable in an emulator. Deployment preview follows a green PR. Production applies reviewed migrations with separate credentials and runs smoke checks before traffic promotion.

## Migration and release runbook

1. Create feature branch and schema-only/sanitized database branch.
2. Add numbered migration and data-access/domain changes; include compatibility/backfill plan if changing existing fields.
3. Run tests and build. Never edit a migration already applied in a shared environment.
4. Review PR and preview with test integrations.
5. Back up/check restore point; run migration with migration credentials against the intended environment.
6. Deploy application, run auth/tenant/booking smoke checks and monitor errors/outbox backlog.
7. Roll back compatible application release or apply a forward fix; restore database only with explicit recovery plan and data-loss assessment.
