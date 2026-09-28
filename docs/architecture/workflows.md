# Workflows and API contracts

## States and commands

| Aggregate | States | Guarded transitions |
| --- | --- | --- |
| Inquiry | new, contacted, tour_scheduled, proposal_sent, booked, lost | Booked only through conversion; lost can be reopened with reason |
| Event | tentative, confirmed, completed, cancelled | Confirm allocates space; cancel releases allocation; completion does not delete money |
| Reservation | held, confirmed, released, expired | Hold must have expiry; release/expiry audited; conflict check inside transaction |
| Proposal version | draft, sent, accepted, declined, expired, superseded | Accepted exact version is immutable |
| Contract | draft, sent, signed, cancelled | External signed status needs verified evidence; manual register labelled separately |
| Invoice | draft, issued, partially_paid, paid, void | Payment state derived from allocations; issue locks commercial content |
| Payment attempt | pending, requires_action, succeeded, failed, cancelled | Provider-authoritative outcome; duplicate webhook does not duplicate receipt |
| Receipt | pending, paid, voided | Settled amount/event/currency locked; corrections have explicit reversal command |
| Task | todo, in_progress, done | Record completion actor/time; reopen audited |
| Assignment | invited, confirmed, declined, completed | Staff/vendor link and time window required as applicable |

UI labels may retain the brand-sheet spelling. Wire types use stable machine codes or an explicit adapter, never ad hoc status strings throughout SQL.

## Initial operations

`POST /api/v1/inquiries/:id/book` accepts expected version, chosen client or client details, venue, event timing/timezone, space, guests and estimated booking amount. It locks the inquiry and venue, validates membership and references, checks availability, creates client/event/reservation, updates inquiry, writes audit/outbox, and commits. A retry returns the existing created identifiers. A conflict never leaves an orphan client.

`POST /api/v1/events/:id/confirm` and `/cancel` are commands, not arbitrary status updates. Confirm requires a free allocation and valid event dates. Cancel requires appropriate permission and preserves associated receipts/contracts.

`POST /api/v1/payments/manual` records an external receipt with event, amount, currency, received date and reference. It explicitly does not collect funds. `POST /api/v1/payments/:id/void` requires permission, reason and expected version. Refund integration is a different command.

`POST /api/v1/organizations/:id/invitations` eventually creates a narrow invitation and outbox message. An API must not send email merely because someone created a CRM/staff contact.

## HTTP contract

- Browser requests use same-origin credentials. Authenticated responses are private/no-store. State changes enforce origin/CSRF protection as well as authentication.
- Route parameters never establish tenant access. Tenant selection is resolved against active membership on the server.
- Commands accept an idempotency key and expected version. Payloads have strict schemas, length/range limits and typed references.
- Success includes stable IDs, version and request ID. `409` covers stale version, booking conflict or idempotency content mismatch. `401` is unauthenticated; `403` is denied; `404` avoids leaking inaccessible object existence; `422` is validation.
- Error responses follow `application/problem+json` with safe human detail and field errors. Never return raw SQL or provider secrets.
- List routes use cursor pagination and explicit filters. Export is permission-checked, audited, size-limited and eventually an asynchronous private artifact.
- API responses are DTOs, not raw database rows. Money is minor units + currency, instants include offset, local dates are date-only.
- The initial dashboard's `/api/venue/*` presentation adapter can preserve existing UI while the canonical `/api/v1` workflow API grows. It must share the same authorization/domain services, not duplicate rules.

## Integration events

Events are past-tense facts with schema versions: `inquiry.booked.v1`, `event.confirmed.v1`, `event.cancelled.v1`, `invoice.issued.v1`, `payment.received.v1`, `contract.executed.v1`. Store aggregate ID/version, organization, timestamp and correlation ID. Payloads contain only necessary fields; consumers fetch authorized state if needed.

Webhook handlers verify signatures before accepting tenant/account claims. Record delivery IDs, process idempotently and reconcile authoritative provider status when messages arrive out of order. Outbox dispatch never runs inside the booking transaction. Provider outages do not roll back a confirmed booking after the fact; visible delivery status and retries handle the failure.

## Integration and migration operations

Integration commands are explicit application workflows, not generic provider proxy endpoints.

`POST /api/v1/integrations/connections` starts a supported authorization flow or creates a file/bridge connection after permission checks. OAuth callbacks bind the verified provider account/realm to the organization that initiated the state-bearing flow. Credentials are stored only through the secret abstraction.

`POST /api/v1/integrations/:connectionId/discover` queues a read-only discovery job that returns supported object counts/date ranges and provider capability metadata without creating business records.

`POST /api/v1/imports` creates a migration run from an authorized provider connection or private uploaded file. Subsequent commands manage mapping and execution:

- `POST /api/v1/imports/:id/map` stores a versioned field/status mapping.
- `POST /api/v1/imports/:id/dry-run` validates and produces create/update/skip/conflict totals plus row-level exceptions.
- `POST /api/v1/imports/:id/commit` starts resumable bounded batches using the accepted mapping/dedupe decisions.
- `GET /api/v1/imports/:id/report` returns reconciliation totals and safe row results.

A commit is rejected if the dry-run input/file hash, mapping version or target preconditions changed materially after review.

`PATCH /api/v1/integrations/:connectionId/policies/:objectType` changes inbound/outbound/source-of-truth policy. Enabling an unsupported direction is rejected server-side even if a forged browser request asks for it.

`POST /api/v1/integrations/:connectionId/sync` requests an on-demand reconciliation run. The request only queues durable work; it does not hold an HTTP request open while a provider is contacted.

`POST /api/v1/integrations/conflicts/:id/resolve` requires an expected conflict version and an explicit resolution: VenueLoom, external, or validated merged values. Financial/legal/reservation conflicts cannot be bulk auto-resolved by a low-risk CRM policy.

`DELETE /api/v1/integrations/:connectionId` revokes/marks the connection inactive and prevents new sync work. Imported VenueLoom records remain unless a separate authorized business command changes them.

Provider webhooks arrive only on provider-specific verified endpoints. Generic Zapier/Make bridge endpoints accept a strict versioned VenueLoom integration-event schema, are tenant-bound, rate-limited and replay-protected. Arbitrary webhook JSON never maps directly to SQL updates.

### Synchronization processing

Incoming provider change -> signature/secret verification -> durable webhook inbox -> adapter normalization -> mapping lookup -> idempotent domain command -> audit/outbox -> mapping/version update.

Outgoing VenueLoom event -> sync-policy evaluation -> echo suppression -> provider adapter -> durable result/mapping update. Unknown provider outcomes after a timeout are reconciled before retrying a non-idempotent create.

A cursor advances only after the corresponding changes are durably accepted. Webhooks are a latency optimization where supported; periodic reconciliation remains the completeness mechanism when provider capabilities allow it.

See [Integration and Migration Hub](integration-migration-hub.md) for provider capability and conflict rules.

## Reporting definitions

| Metric | Definition |
| --- | --- |
| New inquiries | Inquiries created in selected venue-local reporting interval |
| Events this month | Noncancelled events whose start instant falls within venue-local month |
| Booked value | Event booking estimates, explicitly separated from invoices and cash |
| Recorded paid | Paid receipts less completed reversals; excludes pending/voided entries |
| Outstanding invoices | Issued invoice total minus valid allocations/credits |
| Occupancy | Reserved available space-hours / configured available space-hours, with closure rules documented |
| Conversion rate | Booked inquiries / eligible inquiries in a clearly named cohort |

The initial dashboard may use simpler estimates, but its labels must describe those estimates accurately.
