import { randomUUID } from "node:crypto";
import { assertVenueAccess, withTenantTransaction } from "./tenant";
import type { WorkspacePrincipal } from "./workspace";
function guard(p:WorkspacePrincipal){if(!["owner","admin","sales","event_manager"].includes(p.role))throw Object.assign(new Error("CRM permission denied."),{status:403});}
export async function listCrmActivity(p:WorkspacePrincipal,clientId:string){
 return withTenantTransaction(p,async db=>{
  const client=await db.query("SELECT id FROM clients WHERE organization_id=$1 AND id=$2",[p.organizationId,clientId]);
  if(!client.rowCount)throw Object.assign(new Error("Client not found."),{status:404});
  const rows=await db.query("SELECT direction,channel,subject,body,created_at FROM crm_communications WHERE organization_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 100",[p.organizationId,clientId]);
  return rows.rows;
 });
}
export async function createEmailTemplate(p:WorkspacePrincipal,input:{name:string;subject:string;body:string}){
 guard(p);
 if(!input.name?.trim()||!input.subject?.trim()||!input.body?.trim())throw Object.assign(new Error("Template name, subject and body are required."),{status:422});
 return withTenantTransaction(p,async db=>{
  const id=randomUUID();
  await db.query("INSERT INTO crm_email_templates(id,organization_id,name,subject,body) VALUES($1,$2,$3,$4,$5)",[id,p.organizationId,input.name.trim(),input.subject.trim(),input.body.trim()]);
  return {id};
 });
}
export async function scheduleCrmFollowup(p:WorkspacePrincipal,input:{inquiryId:string;templateId:string;dueAt:string}){
 guard(p);
 const due=new Date(input.dueAt);
 if(!Number.isFinite(due.getTime())||due.getTime()<Date.now())throw Object.assign(new Error("Future follow-up date required."),{status:422});
 return withTenantTransaction(p,async db=>{
  const lead=await db.query<{venue_id:string;status:string}>("SELECT venue_id,status FROM inquiries WHERE organization_id=$1 AND id=$2",[p.organizationId,input.inquiryId]);
  if(!lead.rows[0])throw Object.assign(new Error("Inquiry not found."),{status:404});
  assertVenueAccess(p,lead.rows[0].venue_id);
  if(["won","lost"].includes(lead.rows[0].status))throw Object.assign(new Error("Closed inquiries cannot be scheduled."),{status:409});
  const template=await db.query("SELECT 1 FROM crm_email_templates WHERE organization_id=$1 AND id=$2 AND enabled=true",[p.organizationId,input.templateId]);
  if(!template.rowCount)throw Object.assign(new Error("Template not found."),{status:404});
  const id=randomUUID();
  await db.query("INSERT INTO crm_followups(id,organization_id,inquiry_id,template_id,due_at) VALUES($1,$2,$3,$4,$5)",[id,p.organizationId,input.inquiryId,input.templateId,due.toISOString()]);
  return {id};
 });
}
