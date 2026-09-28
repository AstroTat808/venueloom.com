# Integration activation runbook

Status: implementation-ready, environment activation required.

This runbook activates the authenticated tenant, migration commit, Google/Microsoft calendar sync, and Airbnb/Vrbo lodging availability sync added after the Integration Hub foundation.

## 1. Provision VenueLoom infrastructure

VenueLoom currently expects:

- one Netlify project for the Next.js application
- Netlify Identity enabled for that project
- one Neon PostgreSQL project
- a restricted application/runtime database role
- a separate privileged service/migration database role
- production environment variables stored only in Netlify/secret configuration

Do not point preview builds at production database or OAuth credentials.

## 2. Neon database

Apply migrations in order:

1. `packages/database/migrations/0001_integration_import_foundation.sql`
2. `packages/database/migrations/0002_tenant_calendar_lodging.sql`

The runtime connection in `DATABASE_URL` must not own the schema/tables and must not have `BYPASSRLS`. The migration/service connection in `DATABASE_SERVICE_URL` is used only by server-side workers and controlled migrations.

The application establishes `app.user_id`, `app.identity_provider`, `app.identity_subject`, and `app.organization_id` transaction-locally on the same pooled connection before tenant reads/writes. Tenant-owned tables use forced RLS plus composite organization foreign keys.

Before production, verify with two organizations:

- organization A cannot read/update/export any B record by guessed UUID
- a restricted member cannot access an ungranted venue
- an imported event cannot link to another organization's client/venue
- a worker can reconcile calendar/lodging data but no browser response can expose service credentials

## 3. Netlify Identity

Enable Identity in the VenueLoom Netlify project. Configure registration policy and external login providers in the project UI.

VenueLoom uses:

- server-side `getUser()` after `refreshSession()`
- stable Netlify user ID -> internal `user_identities`
- same-origin verification for mutating routes
- global confirmation/recovery/invite/OAuth callback handling
- an HTTP-only `vl_org` cookie only as an organization selector; membership is rechecked server-side

If Google login is not enabled in Netlify Identity, the login page automatically hides that button.

## 4. Runtime secrets

Configure:

```
PUBLIC_APP_URL=https://venueloom.com

DATABASE_URL=<restricted Neon runtime role>
DATABASE_SERVICE_URL=<server-only service/migration role>

VENUELOOM_ENCRYPTION_KEY=<base64 encoded 32 random bytes>

GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=

MICROSOFT_CALENDAR_CLIENT_ID=
MICROSOFT_CALENDAR_CLIENT_SECRET=
```

Generate the encryption key from cryptographically secure random bytes. Never place it in source control.

## 5. Google Calendar OAuth

Create a Google OAuth web application and configure the production redirect URI:

```
https://venueloom.com/api/integrations/calendar/google/callback
```

VenueLoom requests calendar list read access plus calendar event read/write access and uses OAuth PKCE. The integration stores refresh/access tokens in AES-256-GCM encrypted secret envelopes.

Google change notifications are delivered to:

```
https://venueloom.com/api/webhooks/calendar/google
```

The worker uses the notification only as a wake-up signal, then reconciles using Calendar API incremental sync tokens.

## 6. Microsoft Outlook Calendar OAuth

Create a Microsoft Entra app registration with Microsoft Graph calendar permissions and configure:

```
https://venueloom.com/api/integrations/calendar/microsoft/callback
```

Microsoft Graph notifications are delivered to:

```
https://venueloom.com/api/webhooks/calendar/microsoft
```

VenueLoom validates the subscription/client state and then reconciles using `calendarView/delta`.

## 7. Calendar behavior

For every authorized Google/Microsoft account, the venue owner can choose individual external calendars and configure:

- target VenueLoom venue
- inbound only
- outbound only
- two-way
- whether external busy events block venue availability

External events that are not linked to VenueLoom become availability blocks, not VenueLoom bookings.

VenueLoom-created events carry a stable VenueLoom event mapping when pushed. Echo suppression uses stable external mappings plus canonical hashes.

Concurrent changes to protected event dates/statuses become `sync_conflicts`. The Conflict UI can:

- keep VenueLoom
- accept external values
- manually merge
- ignore the external change

Any external/merged time change reacquires the venue advisory lock and rechecks reservations, external calendar blocks, and lodging occupancy before saving.

## 8. Scheduled integration worker

Netlify runs `netlify/functions/sync-integrations.mts` every minute.

The function:

1. queues Google/Microsoft bindings that need reconciliation
2. queues Airbnb/Vrbo feeds that need polling
3. leases durable queue rows with retry/backoff
4. processes provider sync outside browser requests

Provider push notifications do not perform full synchronization inline.

## 9. Airbnb + Vrbo lodging availability

VenueLoom uses each hosting platform's iCal import/export capability. This is availability synchronization, not a guest-message/payment/full-reservation API.

For each house:

1. create a Lodging unit in VenueLoom
2. optionally link it to a VenueLoom venue
3. optionally enable "house stays block linked venue"
4. export the reservation calendar from Airbnb and paste its iCal URL into VenueLoom
5. VenueLoom returns a private tokenized `.ics` URL; import that URL into Airbnb
6. repeat the same pair of steps for Vrbo

VenueLoom imports only:

- provider event UID
- arrival/start date
- departure/end date
- status
- integrity hash

It intentionally does not store guest names/messages from iCal.

Each outbound provider calendar excludes stays that originated from that same provider. Therefore:

- Airbnb reservation -> VenueLoom -> Vrbo
- Vrbo reservation -> VenueLoom -> Airbnb

without Airbnb receiving its own booking back as a new block.

Source URLs are encrypted at rest and outbound calendar bearer tokens are stored only as SHA-256 hashes.

## 10. HoneyBook + Dubsado migration

The generic migration engine now detects known HoneyBook/Dubsado export headers.

For recognized exports VenueLoom:

- applies provider-specific aliases before generic matching
- combines Dubsado client first/last names
- maps project/client/date/status/source fields where the export contains them
- preserves unmapped provider/custom columns under validated `custom_fields`
- does not reinterpret Dubsado paid summary amounts as invoice totals
- requires explicit time + UTC offset for event datetimes instead of guessing a timezone

The commit endpoint re-parses the original file, repeats validation, checks membership/venue access, hashes the source file, then commits within a tenant transaction with row-level import history.

## 11. Production release checklist

Before enabling real customers:

- Netlify Identity enabled and tested for confirmation/recovery/login
- Neon migrations applied on the intended project
- runtime DB role proven unable to bypass RLS
- service URL unavailable to browser bundles/logs
- encryption key stored in production secrets
- Google OAuth consent/app production configuration complete
- Microsoft Entra app production configuration complete
- Google and Microsoft webhook endpoints externally reachable
- scheduled sync function executing
- OAuth revoke/reauthorize tested
- duplicate and out-of-order notifications tested
- calendar cursor expiration/full resync tested
- reservation/calendar/lodging collision tests pass
- Airbnb/Vrbo test listing iCal round-trip verified
- HoneyBook/Dubsado fixture exports reviewed against current provider formats
- CI typecheck/tests/production build green
