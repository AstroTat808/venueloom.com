# Security and permissions

## Target role matrix

A checkmark grants access only within granted venues; financial/payroll fields require their own permissions. Initial foundation may restrict the workspace to owners/admins until each restricted query is implemented.

| Capability | Owner | Admin | Sales | Event manager | Staff | Finance | Client/vendor portal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manage organization, billing, owner transfer | Yes | Limited | — | — | — | Billing read if granted | — |
| Invite members / grant roles | Yes | Non-owner roles | — | — | — | — | — |
| CRM and proposals | Yes | Yes | Yes | Event contacts only | — | Billing contacts | Own event scope |
| Confirm/cancel bookings | Yes | Yes | If granted | Yes | — | — | Request only |
| Event tasks and run of show | Yes | Yes | Read | Yes | Assigned items | Read if granted | Explicitly shared items |
| Contracts | Yes | Yes | Draft/send if granted | Read if granted | — | Read | Own document only |
| Receipts, invoices, refunds | Yes | Yes | Estimate only | Estimate only | — | Yes | Own invoices/receipts |
| Staff rates and payroll | Yes | If granted | — | Availability only | Own approved data | If granted | — |
| Export all organization data | Yes | Explicit grant | — | — | — | Finance export only | — |
| Integrations and secrets | Yes | Explicit grant | — | — | — | Payment config if granted | — |

## Request flow

1. Verify identity server-side; do not trust an unsigned cookie, decoded-only JWT, browser role or email match.
2. Resolve provider subject to internal user and active membership. A disabled user/membership is denied immediately.
3. Establish organization context within a database transaction. Runtime role has no ownership, schema DDL or RLS bypass.
4. Check command permission and object/venue scope; constrain every read including dashboard counts, search, related records, exports and file URLs.
5. Validate referenced objects with composite foreign keys and explicit authorization. Parameterize SQL.
6. Commit business changes with idempotency, audit and outbox; return a filtered DTO.

RLS protects organization rows, not application-level roles. A member cannot become an owner by editing profile metadata. Support access, if introduced, must be time-bounded, explicitly authorized and audited; no silent impersonation feature.

## Threats and required controls

| Threat | Control | Test |
| --- | --- | --- |
| Cross-tenant record IDs | Composite foreign keys, RLS, membership resolution | User A cannot read, edit, link or export B |
| Venue-restricted member sees other venue | Scoped repositories and DTO fields | Counts/search/exports/linked dialogs honor grants |
| Stale tab overwrites updates | Expected aggregate version | Concurrent update gets 409 |
| Concurrent double booking | Transaction venue lock + reservation constraints | Competing confirmations yield one winner |
| Duplicate payment/webhook | Unique provider key and idempotency | Replayed delivery posts once |
| CSRF/session confusion | Verified auth, same-origin writes, secure cookies | Foreign origin denied; absent principal denied |
| XSS through client notes | Text rendering, sanitized document HTML, CSP | Stored note remains text, not script |
| Leaked attachment | Private storage, scoped signed URL, scanning | Other tenant cannot mint/download URL |
| Sensitive logs | Structured redaction, no request body dumping | No secrets/payment details/contract bodies in logs |
| Malicious inbound email | Sender verification and restricted workflow parsing | Email text cannot grant privileges or trigger arbitrary actions |
| Forged/replayed provider webhook | Provider signature/secret verification, timestamp/replay checks, durable delivery ID dedupe | Invalid/replayed delivery cannot mutate a record |
| Cross-tenant external mapping | Organization-scoped connection + composite mapping FKs/uniqueness | External ID from A cannot resolve/link to B |
| Compromised OAuth/API credential | Least scopes, encrypted secret reference, revoke/reauthorize state, no credential logging | Revoked token stops work; secret absent from browser/logs |
| Malicious migration file | Private upload, type/size limits, quarantine/scanning, bounded parser, no formulas/macros executed | Crafted file cannot execute code or escape tenant |
| Unsafe sync overwrite | Provider version tokens, expected VenueLoom version, conflict queue for protected fields | Concurrent edit becomes conflict rather than silent overwrite |
| Sync echo/amplification loop | Origin + connection + correlation + canonical hash suppression | Inbound change is not immediately written back indefinitely |
| Automation bridge abuse | High-entropy per-connection secret, strict versioned schema, rate/replay limits | Arbitrary JSON cannot invoke unrestricted domain writes |
| Provider URL / webhook SSRF | Provider endpoints from allowlisted adapter config; user callbacks require HTTPS and egress validation | Private/link-local destinations rejected |
| Preview with real production data | Schema-only/sanitized branches, distinct env | No production database URL in PR environment |

Use CSP, frame restrictions, strict content type, referrer policy and HTTPS. Apply rate limits to auth, imports, search, invitations and expensive exports. Sensitive commands support re-authentication when provider capability is available. Audit administrative/financial actions and exports with actor and correlation ID; do not treat UI activity feed as the sole security log.

## Production gate

Production access requires verified auth configuration, restricted DB credentials, real PostgreSQL RLS tests, tenant/role tests, configured backups and restore exercise, monitoring, retention policy, and a reviewed release. Provider payments/signatures and live synchronization require test-mode lifecycle verification before live credentials. Integration launch also requires tenant mapping tests, revoke/reauthorize tests, conflict/loop tests and safe import-file handling. A local schema emulator is useful but cannot prove deployed credentials, network behavior or provider webhook configuration.
