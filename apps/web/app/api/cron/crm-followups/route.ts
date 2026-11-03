import {timingSafeEqual} from "node:crypto";
import {runCrmFollowups} from "@venueloom/database";
export const runtime="nodejs";
export async function POST(request:Request){
 const secret=process.env.VENUELOOM_CRON_SECRET;
 const token=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 if(!secret||Buffer.byteLength(token)!==Buffer.byteLength(secret)||!timingSafeEqual(Buffer.from(token),Buffer.from(secret)))return new Response("Unauthorized",{status:401});
 const key=process.env.RESEND_API_KEY,from=process.env.VENUELOOM_EMAIL_FROM;
 if(!key||!from)return Response.json({error:"Email delivery is not configured"},{status:503});
 const result=await runCrmFollowups(async ({to,subject,text,idempotencyKey})=>{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:JSON.stringify({from,to:[to],subject,text})});
  const payload=await response.json() as {id?:string;message?:string};
  if(!response.ok||!payload.id)throw new Error(payload.message||"Delivery rejected");
  return payload.id;
 });
 return Response.json(result);
}
