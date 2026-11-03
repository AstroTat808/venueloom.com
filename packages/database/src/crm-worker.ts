import {randomUUID} from "node:crypto";
import {getPool,setLocalContext,withTransaction} from "./client";
type Job={id:string;inquiry_id:string;client_id:string|null;email:string|null;name:string;subject:string;body:string;attempts:number};
export async function runCrmFollowups(send:(email:{to:string;subject:string;text:string;idempotencyKey:string})=>Promise<string>){
 const tenants=await withTransaction(async db=>(await db.query<{organization_id:string}>("SELECT organization_id FROM crm_due_organization_ids()")).rows);
 let sent=0,failed=0;
 for(const tenant of tenants){
  const org=tenant.organization_id;
  const jobs=await withTransaction(async db=>{
   await setLocalContext(db,{organizationId:org});
   const result=await db.query<Job>(`SELECT f.id,f.inquiry_id,i.client_id,i.email,i.name,t.subject,t.body,f.attempts
     FROM crm_followups f JOIN inquiries i ON i.organization_id=f.organization_id AND i.id=f.inquiry_id
     JOIN crm_email_templates t ON t.organization_id=f.organization_id AND t.id=f.template_id
     WHERE f.organization_id=$1 AND t.enabled AND i.status NOT IN ('won','lost')
       AND ((f.state='pending' AND f.due_at<=now()) OR (f.state='sending' AND f.lease_until<now()))
       AND NOT EXISTS(SELECT 1 FROM crm_communications c WHERE c.organization_id=f.organization_id AND c.inquiry_id=f.inquiry_id AND c.direction='inbound')
     ORDER BY f.due_at FOR UPDATE OF f SKIP LOCKED LIMIT 20`,[org]);
   for(const job of result.rows)await db.query("UPDATE crm_followups SET state='sending',lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE organization_id=$1 AND id=$2",[org,job.id]);
   return result.rows;
  });
  for(const job of jobs){
   try{
    if(!job.email)throw new Error("No recipient email");
    const eligible=await withTransaction(async db=>{
     await setLocalContext(db,{organizationId:org});
     const check=await db.query("SELECT 1 FROM crm_followups f JOIN inquiries i ON i.organization_id=f.organization_id AND i.id=f.inquiry_id WHERE f.organization_id=$1 AND f.id=$2 AND f.state='sending' AND i.status NOT IN ('won','lost') AND NOT EXISTS(SELECT 1 FROM crm_communications c WHERE c.organization_id=f.organization_id AND c.inquiry_id=f.inquiry_id AND c.direction='inbound')",[org,job.id]);
     return Boolean(check.rowCount);
    });
    if(!eligible){await mark(org,job.id,"cancelled",null);continue;}
    const subject=job.subject.replaceAll("{{name}}",job.name);
    const text=job.body.replaceAll("{{name}}",job.name);
    const messageId=await send({to:job.email,subject,text,idempotencyKey:job.id});
    await withTransaction(async db=>{
     await setLocalContext(db,{organizationId:org});
     await db.query("UPDATE crm_followups SET state='sent',sent_at=now(),provider_message_id=$3,lease_until=NULL,last_error=NULL WHERE organization_id=$1 AND id=$2",[org,job.id,messageId]);
     await db.query("INSERT INTO crm_communications(id,organization_id,inquiry_id,client_id,direction,subject,body,provider_message_id) VALUES($1,$2,$3,$4,'outbound',$5,$6,$7) ON CONFLICT DO NOTHING",[randomUUID(),org,job.inquiry_id,job.client_id,subject,text,messageId]);
    });sent++;
   }catch(error){failed++;await mark(org,job.id,job.attempts>=4?"failed":"pending",String(error).slice(0,500));}
  }
 }
 return {sent,failed};
}
async function mark(org:string,id:string,state:string,error:string|null){
 await withTransaction(async db=>{await setLocalContext(db,{organizationId:org});
 await db.query("UPDATE crm_followups SET state=$3,last_error=$4,lease_until=NULL,due_at=CASE WHEN $3='pending' THEN now()+interval '15 minutes' ELSE due_at END WHERE organization_id=$1 AND id=$2",[org,id,state,error]);});
}
