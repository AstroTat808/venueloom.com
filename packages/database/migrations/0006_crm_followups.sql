CREATE TABLE IF NOT EXISTS crm_email_templates (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, subject text NOT NULL, body text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE TABLE IF NOT EXISTS crm_followups (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 inquiry_id uuid NOT NULL, template_id uuid NOT NULL, due_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, last_error text,
 sent_at timestamptz, provider_message_id text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,inquiry_id) REFERENCES inquiries(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,template_id) REFERENCES crm_email_templates(organization_id,id)
);
CREATE INDEX IF NOT EXISTS crm_followups_due_idx ON crm_followups(state,due_at);
CREATE TABLE IF NOT EXISTS crm_communications (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 inquiry_id uuid, client_id uuid, direction text NOT NULL CHECK(direction IN ('outbound','inbound','note')),
 channel text NOT NULL DEFAULT 'email', subject text, body text, provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,inquiry_id) REFERENCES inquiries(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES clients(organization_id,id)
);
CREATE INDEX IF NOT EXISTS crm_communications_client_idx ON crm_communications(organization_id,client_id,created_at DESC);
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['crm_email_templates','crm_followups','crm_communications'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON crm_email_templates,crm_followups,crm_communications TO venueloom_runtime;
