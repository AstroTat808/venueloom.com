-- VenueLoom integration/import foundation.
-- Apply only through the reviewed migration runbook with organization-scoped runtime roles.

CREATE TABLE IF NOT EXISTS import_runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  venue_id uuid,
  entity_type text NOT NULL CHECK (entity_type IN ('clients','inquiries','events','invoices','payments','vendors','staff')),
  source_type text NOT NULL CHECK (source_type IN ('csv','xlsx','xls','provider')),
  source_name text NOT NULL,
  source_sha256 text NOT NULL,
  mapping_json jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('uploaded','mapped','previewed','committing','completed','failed','cancelled')),
  discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  create_count integer NOT NULL DEFAULT 0 CHECK (create_count >= 0),
  skip_count integer NOT NULL DEFAULT 0 CHECK (skip_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS import_runs_org_created_idx
  ON import_runs (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  import_run_id uuid NOT NULL,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  source_data jsonb NOT NULL,
  normalized_data jsonb NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('create','update','skip','error','conflict')),
  issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_id uuid,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, import_run_id, source_row_number),
  FOREIGN KEY (organization_id, import_run_id)
    REFERENCES import_runs (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS import_rows_run_outcome_idx
  ON import_rows (organization_id, import_run_id, outcome);

CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  provider_code text NOT NULL,
  connection_name text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  external_account_id text,
  auth_type text NOT NULL CHECK (auth_type IN ('oauth','api_key','webhook_bridge','file','partner_api')),
  secret_ref text,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('active','degraded','reauth_required','paused','revoked')),
  authorized_by uuid,
  authorized_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_health_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_external_account_uq
  ON integration_connections (organization_id, provider_code, environment, external_account_id)
  WHERE external_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS external_mappings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  internal_id uuid NOT NULL,
  external_version text,
  last_seen_hash text,
  last_pulled_at timestamptz,
  last_pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, connection_id, object_type, external_id),
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES integration_connections (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS external_mappings_internal_idx
  ON external_mappings (organization_id, object_type, internal_id);

-- RLS policies are intentionally added with the authenticated tenant/runtime role migration.
-- Do not grant the web runtime direct access before transaction-local organization context exists.
