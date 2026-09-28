-- Identity, tenant and venue foundation.

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  default_currency char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  display_name text,
  email text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS user_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  subject text NOT NULL,
  email_at_link text,
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
  currency char(3) NOT NULL DEFAULT 'USD',
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_code char(2) NOT NULL DEFAULT 'US',
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
  FOREIGN KEY (organization_id, membership_id)
    REFERENCES memberships (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, venue_id)
    REFERENCES venues (organization_id, id) ON DELETE CASCADE
);

ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS commit_key text;
CREATE UNIQUE INDEX IF NOT EXISTS import_runs_commit_key_uq
  ON import_runs (organization_id, commit_key) WHERE commit_key IS NOT NULL;

ALTER TABLE import_runs
  ADD CONSTRAINT import_runs_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- User identities must be globally resolvable before a tenant is selected.
-- Memberships allow a user to discover only their own organization memberships.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_self_or_tenant ON memberships;
CREATE POLICY membership_self_or_tenant ON memberships
USING (
  user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  OR organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON venues;
CREATE POLICY tenant_isolation ON venues
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE membership_venue_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_venue_grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON membership_venue_grants;
CREATE POLICY tenant_isolation ON membership_venue_grants
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON import_runs;
CREATE POLICY tenant_isolation ON import_runs
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON import_rows;
CREATE POLICY tenant_isolation ON import_rows
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integration_connections;
CREATE POLICY tenant_isolation ON integration_connections
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE external_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON external_mappings;
CREATE POLICY tenant_isolation ON external_mappings
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_member_or_selected ON organizations;
CREATE POLICY organization_member_or_selected ON organizations
USING (
  id = NULLIF(current_setting('app.organization_id', true), '')::uuid
  OR EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = organizations.id
      AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND m.status = 'active'
  )
)
WITH CHECK (id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
