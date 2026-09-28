-- Restricted application runtime role. Migration credentials remain privileged.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venueloom_runtime') THEN
    CREATE ROLE venueloom_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

GRANT venueloom_runtime TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO venueloom_runtime;

GRANT SELECT, INSERT, UPDATE ON users, user_identities TO venueloom_runtime;
GRANT SELECT, INSERT, UPDATE ON organizations, memberships, venues, membership_venue_grants TO venueloom_runtime;

GRANT SELECT, INSERT, UPDATE ON
  clients, inquiries, events, invoices, payments, vendors, staff_profiles,
  import_runs, import_rows,
  integration_connections, integration_secrets, integration_oauth_states, external_mappings,
  venue_calendars, calendar_sync_links, calendar_blocks, rental_calendar_links, sync_conflicts
TO venueloom_runtime;

REVOKE ALL ON FUNCTION venueloom_sync_tenant_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION venueloom_resolve_rental_feed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION venueloom_sync_tenant_ids() TO venueloom_runtime;
GRANT EXECUTE ON FUNCTION venueloom_resolve_rental_feed(text) TO venueloom_runtime;
