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
