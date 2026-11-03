CREATE OR REPLACE FUNCTION crm_due_organization_ids()
RETURNS TABLE(organization_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT DISTINCT f.organization_id FROM crm_followups f
 WHERE (f.state='pending' AND f.due_at<=now()) OR (f.state='sending' AND f.lease_until<now())
$$;
REVOKE ALL ON FUNCTION crm_due_organization_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm_due_organization_ids() TO venueloom_runtime;
CREATE UNIQUE INDEX IF NOT EXISTS crm_communications_provider_uq ON crm_communications(organization_id,provider_message_id) WHERE provider_message_id IS NOT NULL;
