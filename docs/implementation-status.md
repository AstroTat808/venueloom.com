# Implementation status

The VenueLoom platform foundation now includes the first executable onboarding, tenancy, migration, calendar-sync, conflict, and lodging-sync workflows.

## Implemented in application source

### Authenticated organization and venue tenancy

- Netlify Identity client/server integration.
- Email/password login and registration flows.
- Identity-provider login button driven by configured Netlify Identity settings.
- confirmation, recovery, invitation, and OAuth callback handling.
- internal users keyed by verified provider subject rather than email.
- organization memberships and role model.
- first-organization/first-venue onboarding transaction.
- organization selection treated as a selector only; server membership is revalidated.
- transaction-local PostgreSQL identity/organization context.
- forced RLS on organization-owned tables.
- composite organization foreign keys for tenant relationships.

### Migration commit

- authenticated same-origin CSV/XLSX preview.
- authenticated server-side commit that re-parses and revalidates the original file.
- imports clients, inquiries, events, invoices, payments, vendors, and staff.
- row-level import audit history and source-file hash.
- client/vendor/staff match/update by normalized email.
- event commit checks existing VenueLoom reservations, external calendar blocks, and linked lodging stays.
- future event collisions import as tentative conflicts rather than silently double-booking.
- date-only values are rejected for event datetime fields; an explicit time/offset is required.

### HoneyBook and Dubsado smart migration

- provider export detection from header signatures.
- provider-specific field aliases layered on the generic importer.
- Dubsado first/last client name normalization.
- preservation of unmapped/custom export fields.
- known unsafe financial assumptions intentionally excluded.

### Google Calendar and Microsoft Outlook Calendar

- OAuth authorization-code flow with PKCE.
- encrypted OAuth token storage and refresh.
- account/calendar discovery.
- per-calendar target venue selection.
- inbound, outbound, or two-way policy.
- optional external-event availability blocking.
- Google push notifications + incremental sync tokens.
- Microsoft Graph change notifications + calendarView delta links.
- VenueLoom event mappings and canonical hash loop suppression.
- cancellation write-back.
- all-day external event blocks normalized to the VenueLoom venue timezone.
- durable queue, retries, periodic reconciliation, and watch renewal.
- protected conflict queue with explicit keep-external/keep-VenueLoom/merge/ignore actions.

### Airbnb and Vrbo

- separate lodging units/houses.
- optional lodging-unit -> venue availability blocking.
- encrypted Airbnb/Vrbo source iCal URLs.
- allowlisted HTTPS/webcal provider hosts with redirect revalidation and feed-size/time limits.
- periodic iCal ingestion.
- anonymous occupancy storage only; no guest PII pulled from calendar summaries.
- private tokenized VenueLoom `.ics` export per provider.
- source-provider exclusion prevents iCal echo loops.
- Airbnb/Vrbo provider cards and setup UI.

## Environment activation still required

The source code is not equivalent to a live production connector.

At the time of this implementation:

- no connected Netlify project named VenueLoom was available to enable/configure Identity or deploy environment secrets
- no VenueLoom Neon project ID was available to apply migrations or create restricted/service database credentials
- Google Calendar OAuth client credentials were not supplied
- Microsoft Entra/Graph OAuth client credentials were not supplied
- no customer Airbnb/Vrbo iCal URLs were supplied

Therefore production authentication, database persistence, OAuth authorization, webhooks, scheduled synchronization, and live lodging feeds remain inactive until the activation runbook is completed.

See [integration activation runbook](runbooks/integration-activation.md).

## Verification status

The repository contains CI for Node 24 type checking across all workspaces, importer/integration/database tests, and a production Next.js build.

This execution environment could not reach GitHub/npm for a clean local dependency install, and GitHub Actions had not emitted a run for the feature branch at the time of implementation. Do not mark the release certified until CI executes successfully.
