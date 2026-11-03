import {randomUUID} from "node:crypto";
import {getPool,setLocalContext,withTransaction} from "./client";
export async function recordCrmReply(input:{followupId:string;emailId:string;from:string;subject:string;body:string}){
 const orgResult=await withTransaction(async db=>db.query<{crm_followup_tenant:string|null}>("SELECT crm_followup_tenant($1::uuid)",[input.followupId]));
 const org=orgResult.rows[0]?.crm_followup_tenant;
 if(!org)return false;
 return withTransaction(async db=>{
  await setLocalContext(db,{organizationId:org});
  const lead=await db.query<{inquiry_id:string;client_id:string|null;email:string|null}>("SELECT f.inquiry_id,i.client_id,i.email FROM crm_followups f JOIN inquiries i ON i.organization_id=f.organization_id AND i.id=f.inquiry_id WHERE f.organization_id=$1 AND f.id=$2 FOR UPDATE OF f",[org,input.followupId]);
  const row=lead.rows[0];
  if(!row?.email||row.email.trim().toLowerCase()!==input.from.trim().toLowerCase())return false;
  const already=await db.query("SELECT 1 FROM crm_communications WHERE organization_id=$1 AND provider_message_id=$2",[org,input.emailId]);
  if(already.rowCount)return true;
  await db.query("INSERT INTO crm_communications(id,organization_id,inquiry_id,client_id,direction,subject,body,provider_message_id) VALUES($1,$2,$3,$4,'inbound',$5,$6,$7)",[randomUUID(),org,row.inquiry_id,row.client_id,input.subject,input.body.slice(0,20000),input.emailId]);
  await db.query("UPDATE crm_followups SET state='cancelled',lease_until=NULL WHERE organization_id=$1 AND inquiry_id=$2 AND state='pending'",[org,row.inquiry_id]);
  return true;
 });
}
