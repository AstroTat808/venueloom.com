-- VenueLoom authenticated tenant, calendar sync, and lodging sync foundation.
-- Additive to 0001. All tenant tables are organization-scoped and FORCE RLS.

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  default_currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  display_name text,
  email text,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','sales','event_manager','staff','finance')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  timezone text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  address_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS membership_venue_grants (
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, membership_id, venue_id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, venue_id) REFERENCES venues(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text,
  normalized_email text,
  phone text,
  organization_name text,
  notes text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_email_uq ON clients(organization_id, normalized_email) WHERE normalized_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS inquiries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  venue_id uuid REFERENCES venues(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  event_type text,
  proposed_date date,
  guests integer CHECK (guests IS NULL OR guests >= 0),
  estimated_minor bigint CHECK (estimated_minor IS NULL OR estimated_minor >= 0),
  currency text NOT NULL DEFAULT 'USD',
  source text,
  status text NOT NULL DEFAULT 'new',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
  name text NOT NULL,
  event_type text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  guests integer CHECK (guests IS NULL OR guests >= 0),
  booking_minor bigint CHECK (booking_minor IS NULL OR booking_minor >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'tentative' CHECK (status IN ('tentative','confirmed','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES events(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('held','confirmed','released','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS reservations_venue_active_idx ON reservations(organization_id, venue_id, starts_at, ends_at) WHERE state IN ('held','confirmed');

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  venue_id uuid REFERENCES venues(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
  document_number text NOT NULL,
  issued_date date,
  due_date date,
  currency text NOT NULL DEFAULT 'USD',
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  status text NOT NULL DEFAULT 'draft',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, document_number),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  venue_id uuid REFERENCES venues(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  reference text,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD',
  received_date date NOT NULL,
  method text,
  status text NOT NULL DEFAULT 'paid',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_org_reference_uq ON payments(organization_id, reference) WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  contact_name text,
  email text,
  normalized_email text,
  phone text,
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_org_email_uq ON vendors(organization_id, normalized_email) WHERE normalized_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_profiles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text,
  normalized_email text,
  phone text,
  role_title text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_org_email_uq ON staff_profiles(organization_id, normalized_email) WHERE normalized_email IS NOT NULL;

-- Harden the integration/import tables introduced in 0001.
ALTER TABLE import_runs ADD CONSTRAINT import_runs_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE integration_connections ADD CONSTRAINT integration_connections_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE import_runs DROP CONSTRAINT IF EXISTS import_runs_source_type_check;
ALTER TABLE import_runs ADD CONSTRAINT import_runs_source_type_check CHECK (source_type IN ('csv','xlsx','provider'));

CREATE TABLE IF NOT EXISTS integration_secret_envelopes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google-calendar','outlook-calendar')),
  state_hash text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_bindings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  provider_calendar_id text NOT NULL,
  provider_calendar_name text NOT NULL,
  sync_direction text NOT NULL CHECK (sync_direction IN ('inbound','outbound','two_way')),
  block_availability boolean NOT NULL DEFAULT true,
  sync_enabled boolean NOT NULL DEFAULT true,
  cursor_value text,
  cursor_window_start timestamptz,
  cursor_window_end timestamptz,
  webhook_channel_id text,
  webhook_resource_id text,
  webhook_token_hash text,
  webhook_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, connection_id, provider_calendar_id)
);

CREATE TABLE IF NOT EXISTS calendar_blocks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  binding_id uuid NOT NULL REFERENCES calendar_bindings(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  external_version text,
  title text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  source_hash text NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','cancelled')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (organization_id, binding_id, external_event_id),
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS calendar_blocks_venue_active_idx ON calendar_blocks(organization_id, venue_id, starts_at, ends_at) WHERE state='active';

CREATE TABLE IF NOT EXISTS integration_sync_queue (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  binding_id uuid REFERENCES calendar_bindings(id) ON DELETE CASCADE,
  feed_id uuid REFERENCES lodging_calendar_feeds(id) ON DELETE CASCADE,
  reason text NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((binding_id IS NOT NULL)::int + (feed_id IS NOT NULL)::int = 1),
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS integration_sync_queue_ready_idx
  ON integration_sync_queue(available_at, created_at)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  internal_id uuid,
  external_id text,
  field_name text NOT NULL,
  venueloom_value jsonb NOT NULL,
  external_value jsonb NOT NULL,
  base_hash text,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','ignored')),
  resolution text CHECK (resolution IS NULL OR resolution IN ('venueloom','external','merged','ignored')),
  resolved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS lodging_units (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  venue_id uuid REFERENCES venues(id) ON DELETE RESTRICT,
  name text NOT NULL,
  timezone text NOT NULL,
  blocks_venue_availability boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS lodging_calendar_feeds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES lodging_units(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('airbnb','vrbo')),
  source_url_secret_id uuid NOT NULL REFERENCES integration_secret_envelopes(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, unit_id, provider)
);

CREATE TABLE IF NOT EXISTS lodging_stays (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES lodging_units(id) ON DELETE CASCADE,
  feed_id uuid REFERENCES lodging_calendar_feeds(id) ON DELETE CASCADE,
  source_provider text NOT NULL CHECK (source_provider IN ('airbnb','vrbo','venueloom','manual')),
  external_uid text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('tentative','confirmed','cancelled','blocked')),
  source_hash text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on > starts_on),
  UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS lodging_stays_external_uq
  ON lodging_stays(organization_id, feed_id, external_uid)
  WHERE feed_id IS NOT NULL AND external_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS lodging_stays_unit_active_idx
  ON lodging_stays(organization_id, unit_id, starts_on, ends_on)
  WHERE status IN ('tentative','confirmed','blocked');

CREATE TABLE IF NOT EXISTS lodging_export_tokens (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES lodging_units(id) ON DELETE CASCADE,
  target_provider text NOT NULL CHECK (target_provider IN ('airbnb','vrbo')),
  token_hash text NOT NULL UNIQUE,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, unit_id, target_provider)
);

-- Public-calendar resolver intentionally returns only availability fields, never guest data.
CREATE OR REPLACE FUNCTION resolve_lodging_export_calendar(p_token_hash text)
RETURNS TABLE (
  organization_id uuid,
  unit_id uuid,
  target_provider text,
  stay_id uuid,
  starts_on date,
  ends_on date,
  status text,
  source_provider text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.organization_id, t.unit_id, t.target_provider, s.id, s.starts_on, s.ends_on, s.status, s.source_provider
  FROM lodging_export_tokens t
  JOIN lodging_stays s
    ON s.organization_id = t.organization_id
   AND s.unit_id = t.unit_id
  WHERE t.token_hash = p_token_hash
    AND t.revoked_at IS NULL
    AND s.status IN ('tentative','confirmed','blocked')
    AND s.source_provider <> t.target_provider
    AND s.ends_on >= CURRENT_DATE;
$$;

-- Tenant RLS helpers.
CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_tenant ON organizations;
CREATE POLICY organizations_tenant ON organizations USING (id = app_org_id()) WITH CHECK (id = app_org_id());

ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_identities_self ON user_identities;
CREATE POLICY user_identities_self ON user_identities
  USING (provider = current_setting('app.identity_provider', true) AND subject = current_setting('app.identity_subject', true))
  WITH CHECK (provider = current_setting('app.identity_provider', true) AND subject = current_setting('app.identity_subject', true));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users USING (id = app_user_id()) WITH CHECK (id = app_user_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships','venues','membership_venue_grants','clients','inquiries','events','reservations',
    'invoices','payments','vendors','staff_profiles','import_runs','import_rows','integration_connections',
    'external_mappings','integration_secret_envelopes','oauth_states','calendar_bindings','calendar_blocks',
    'integration_sync_queue','sync_conflicts','lodging_units','lodging_calendar_feeds','lodging_stays','lodging_export_tokens'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id())', t);
  END LOOP;
END $$;

-- A verified user may discover their own memberships before an organization is selected.
DROP POLICY IF EXISTS tenant_isolation ON memberships;
CREATE POLICY membership_visibility ON memberships
  USING (user_id = app_user_id() OR organization_id = app_org_id())
  WITH CHECK (organization_id = app_org_id());

-- Indexes that support membership resolution and sync workers.
CREATE INDEX IF NOT EXISTS memberships_user_status_idx ON memberships(user_id, status, organization_id);
CREATE INDEX IF NOT EXISTS calendar_bindings_sync_idx ON calendar_bindings(organization_id, sync_enabled, last_synced_at);
CREATE INDEX IF NOT EXISTS lodging_feeds_sync_idx ON lodging_calendar_feeds(organization_id, enabled, last_synced_at);
