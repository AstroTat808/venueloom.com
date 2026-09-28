# Architecture decision records

Accepted for the foundation. Revisit through a new ADR, not a silent shortcut.

| ADR | Decision | Consequence |
| --- | --- | --- |
| 001 | Modular monolith in one TypeScript monorepo | One deploy initially; modules own their workflows and tables |
| 002 | Organization tenant with multiple venues | Never scope business ownership directly to an auth user |
| 003 | PostgreSQL with composite tenant FKs, RLS and explicit migrations | Core data is relational; no universal JSON records table |
| 004 | Internal UUID users plus provider identity mapping | Auth provider can change without rewriting every business FK |
| 005 | Transactional commands, versions, idempotency and outbox | Reliable retries and provider operations without dual writes |
| 006 | Instants plus IANA timezone; half-open reservations | DST and multi-property calendars have explicit semantics |
| 007 | Integer minor-unit money and immutable commercial snapshots | Refunds/revisions preserve historical truth |
| 008 | Venue payment collection separate from SaaS billing | Platform revenue and venue receipts cannot be conflated |
| 009 | Next.js/Netlify target; Neon PostgreSQL | Existing Sites prototype remains a visual reference, not the production data model |
| 010 | Private files and narrow portal grants | A client/vendor link does not grant organization membership |
| 011 | Preserve approved VenueLoom brand sheet | Fraunces, Manrope, exact palette, woven V and dashboard composition shared throughout |
| [012](012-integration-migration-hub.md) | Capability-driven Integration Hub for migration and coexistence | Imports, one-way sync and safe per-object two-way sync share one auditable framework |

## Rejected shortcuts

Per-user data ownership would require reparenting records when staff join or owners change. Arbitrary JSON records would hide relationships and financial invariants. Browser-only storage would not support a shared venue team. Calling payment or email providers inside a booking transaction would couple booking correctness to network availability. Starting with microservices would create unnecessary deployment and consistency problems. Provider-specific business columns, undocumented APIs, password scraping and blanket last-write-wins synchronization are also rejected.

## Known tradeoffs

A monolith needs enforced module boundaries. Shared-schema tenancy needs rigorous query and role tests. Netlify Identity is a deployment dependency until another adapter is implemented. A SQL-first repository requires careful DTO/schema alignment; tests and migrations provide the contract. The Integration Hub adds durable mapping/cursor/conflict state before every live connector exists, but avoids rebuilding migration and sync semantics separately for each provider. Advanced finance, portals and integrations will require additive schema migrations; the foundation avoids changing their ownership model.
