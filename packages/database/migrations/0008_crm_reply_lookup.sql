CREATE OR REPLACE FUNCTION crm_followup_tenant(followup_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT organization_id FROM crm_followups WHERE id=followup_id LIMIT 1
$$;
REVOKE ALL ON FUNCTION crm_followup_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm_followup_tenant(uuid) TO venueloom_runtime;
