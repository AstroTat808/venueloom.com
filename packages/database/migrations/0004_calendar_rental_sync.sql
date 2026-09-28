-- Calendar, OAuth and rental occupancy synchronization.

ALTER TABLE integration_connections DROP CONSTRAINT IF EXISTS integration_connections_auth_type_check;
ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_auth_type_check
  CHECK (auth_type IN ('oauth','api_key','webhook_bridge','file','partner_api','ical'));

CREATE TABLE IF NOT EXISTS integration_secrets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  connection_id uuid,
  purpose text NOT NULL,
  encrypted_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES integration_connections (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS integration_oauth_states (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  provider_code text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  return_path text NOT NULL DEFAULT '/integrations',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, membership_id)
    REFERENCES memberships (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_calendars (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  name text NOT NULL,
  resource_kind text NOT NULL DEFAULT 'venue'
    CHECK (resource_kind IN ('venue','space','rental_house')),
  timezone text NOT NULL,
  blocks_booking boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, venue_id)
    REFERENCES venues (organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS calendar_sync_links (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  venue_calendar_id uuid NOT NULL,
  external_calendar_id text NOT NULL,
  external_calendar_name text,
  sync_mode text NOT NULL CHECK (sync_mode IN ('inbound','outbound','two_way')),
  block_availability boolean NOT NULL DEFAULT true,
  sync_cursor text,
  webhook_channel_id text,
  webhook_resource_id text,
  webhook_client_state text,
  webhook_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, connection_id, venue_calendar_id, external_calendar_id),
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES integration_connections (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, venue_calendar_id)
    REFERENCES venue_calendars (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar_blocks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  venue_calendar_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('venueloom','google','microsoft','airbnb','vrbo')),
  connection_id uuid,
  external_id text,
  summary text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'busy' CHECK (status IN ('busy','tentative','cancelled')),
  payload_hash text,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, venue_calendar_id)
    REFERENCES venue_calendars (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES integration_connections (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_blocks_external_uq
  ON calendar_blocks (organization_id, connection_id, external_id)
  WHERE connection_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendar_blocks_range_idx
  ON calendar_blocks (organization_id, venue_calendar_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS rental_calendar_links (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  venue_calendar_id uuid NOT NULL,
  provider_code text NOT NULL CHECK (provider_code IN ('airbnb','vrbo')),
  listing_name text NOT NULL,
  inbound_secret_id uuid,
  outbound_token_hash text NOT NULL,
  last_etag text,
  last_modified text,
  last_sync_at timestamptz,
  last_error text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES integration_connections (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, venue_calendar_id)
    REFERENCES venue_calendars (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, inbound_secret_id)
    REFERENCES integration_secrets (organization_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  venue_calendar_id uuid,
  object_type text NOT NULL DEFAULT 'calendar_event',
  internal_id uuid,
  external_id text,
  local_candidate jsonb NOT NULL,
  external_candidate jsonb NOT NULL,
  field_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','ignored')),
  resolution text CHECK (resolution IS NULL OR resolution IN ('venueloom','external','merged','ignored')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, connection_id, object_type, external_id, state),
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES integration_connections (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, venue_calendar_id)
    REFERENCES venue_calendars (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sync_conflicts_open_idx
  ON sync_conflicts (organization_id, state, created_at DESC);

DO $
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'integration_secrets','integration_oauth_states','venue_calendars',
    'calendar_sync_links','calendar_blocks','rental_calendar_links','sync_conflicts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- Narrow bootstrap helpers for scheduled workers/public rental feeds. They reveal only IDs
-- needed to establish normal tenant context; business rows remain RLS-protected.
CREATE OR REPLACE FUNCTION venueloom_sync_tenant_ids()
RETURNS TABLE (organization_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c.organization_id
  FROM integration_connections c
  WHERE c.status = 'active'
    AND c.provider_code IN ('google-calendar','outlook-calendar','airbnb','vrbo');
$$;

CREATE OR REPLACE FUNCTION venueloom_resolve_rental_feed(p_token_hash text)
RETURNS TABLE (
  organization_id uuid,
  venue_calendar_id uuid,
  connection_id uuid,
  provider_code text,
  listing_name text,
  timezone text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.organization_id, r.venue_calendar_id, r.connection_id, r.provider_code, r.listing_name, vc.timezone
  FROM rental_calendar_links r
  JOIN venue_calendars vc
    ON vc.organization_id = r.organization_id AND vc.id = r.venue_calendar_id
  WHERE r.outbound_token_hash = p_token_hash AND r.active = true
  LIMIT 1;
$$;
