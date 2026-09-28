# Implementation status

VenueLoom now has an executable application foundation plus the first authenticated integration/migration milestone.

## Implemented

### Authenticated tenant runtime

- Netlify Identity server-side user verification and custom login/setup screens.
- Global user + provider identity mapping separated from organization membership.
- Organization tenant, memberships, venue grants and multi-venue workspace resolution.
- Every application database transaction downgrades to the restricted `venueloom_runtime` role.
- Transaction-local `app.user_id` and `app.organization_id` context with PostgreSQL RLS.
- Explicit first-owner bootstrap gate; normal users cannot create arbitrary organizations.
- Default VenueLoom calendar created with the first venue.

### Migration commits

- CSV/XLSX preview, auto-mapping, validation and duplicate detection.
- Authenticated, organization-scoped commit endpoint.
- Venue access checks for inquiry/event imports.
- Idempotent import commit key and row-level import ledger.
- Typed target tables for clients, inquiries, events, invoices, payments, vendors and staff.
- Future imported events check connected availability and create VenueLoom busy blocks; historical events do not block current inventory.
- HoneyBook contact export profile detection and auto-mapping.
- Dubsado project export profile detection for client identity, project/event fields, status, dates, source and financial totals.
- Original provider rows are retained as source metadata so custom/unmapped provider fields are not discarded.

### Google + Microsoft calendars

- OAuth authorization-code connections with encrypted refresh-token storage.
- External calendar discovery and explicit VenueLoom-calendar selection.
- Inbound, outbound or two-way policy per mapped calendar.
- Google incremental sync tokens and push notification channels.
- Microsoft Graph delta links and change-notification subscriptions.
- Reconciliation remains authoritative even when a webhook is missed.
- Only VenueLoom-origin blocks write back to external calendars, preventing echo loops.
- External edits to VenueLoom-origin events create protected conflicts rather than silently overwriting or duplicating them.
- Live conflict queue supports Keep VenueLoom or Use external resolution; merged resolution exists at the service layer.

### Airbnb + Vrbo house availability

- Official iCalendar export/import workflow; no password scraping.
- Per-house `rental_house` VenueLoom calendars.
- Encrypted inbound Airbnb/Vrbo feed URLs.
- ETag/Last-Modified conditional polling and stale-block cleanup.
- Source-host allowlisting, HTTPS-only fetch, no redirects and feed-size limits.
- Secret-token VenueLoom `.ics` feed to import back into Airbnb/Vrbo.
- Outbound feed excludes the same source connection to prevent circular duplicate blocks.
- Netlify scheduled reconciliation every 15 minutes.

## Verification

GitHub CI performs:

1. strict TypeScript checking for all workspaces and the Netlify scheduled worker;
2. importer + rental-calendar tests;
3. Next.js production build;
4. all PostgreSQL migrations against a real PostgreSQL 17 service;
5. runtime-role/RLS verification.

A branch is not merged until these checks pass.

## Live activation still requires infrastructure

The connected hosting account does not currently expose an existing VenueLoom Netlify project, and no VenueLoom-specific Neon project ID is available to the connected database tool. Therefore the repository contains the production schema and runtime wiring, but migrations have not been applied to a live VenueLoom database and provider credentials have not been stored.

For live activation:

1. create/link the VenueLoom Netlify project to this repository;
2. enable Netlify Identity and use invite-only registration for initial launch;
3. provision a VenueLoom-specific Neon PostgreSQL project;
4. apply numbered migrations with owner/migration credentials;
5. set `DATABASE_URL`, `VENUELOOM_SECRET_ENCRYPTION_KEY`, `VENUELOOM_PUBLIC_URL`;
6. set Google Calendar and Microsoft Graph OAuth client credentials and matching callback URLs;
7. temporarily enable `VENUELOOM_ALLOW_OWNER_BOOTSTRAP=true` only for approved first-workspace creation, then turn it off;
8. connect calendars/rental feeds through the VenueLoom Integrations UI.
