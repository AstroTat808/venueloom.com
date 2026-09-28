-- Typed operational targets for safe migration commits.

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS clients_email_idx ON clients (organization_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS inquiries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  client_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  event_name text,
  event_type text,
  proposed_date date,
  guest_count integer CHECK (guest_count IS NULL OR guest_count >= 0),
  estimated_minor bigint CHECK (estimated_minor IS NULL OR estimated_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'new',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, venue_id) REFERENCES venues (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, client_id) REFERENCES clients (organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  client_id uuid,
  name text NOT NULL,
  event_type text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL,
  guest_count integer CHECK (guest_count IS NULL OR guest_count >= 0),
  booking_minor bigint CHECK (booking_minor IS NULL OR booking_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'tentative',
  source text,
  historical_import boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, venue_id) REFERENCES venues (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, client_id) REFERENCES clients (organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  event_id uuid,
  invoice_number text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  issued_date date,
  due_date date,
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, invoice_number),
  FOREIGN KEY (organization_id, event_id) REFERENCES events (organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  event_id uuid,
  invoice_id uuid,
  reference text,
  client_name text,
  received_date date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  method text,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, event_id) REFERENCES events (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices (organization_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_uq
  ON payments (organization_id, reference) WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text,
  phone text,
  role text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clients','inquiries','events','invoices','payments','vendors','staff_profiles']
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
