import {createHmac,timingSafeEqual} from "node:crypto";
import {recordCrmReply} from "@venueloom/database";
export const runtime="nodejs";
function verified(payload:string,request:Request,secret:string){
 const id=request.headers.get("svix-id"),timestamp=request.headers.get("svix-timestamp"),signature=request.headers.get("svix-signature");
 if(!id||!timestamp||!signature||!/^\d+$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
 const key=Buffer.from(secret.replace(/^whsec_/,""),"base64");
 const expected=createHmac("sha256",key).update(id+"."+timestamp+"."+payload).digest();
 return signature.split(" ").some(part=>{if(!part.startsWith("v1,"))return false;const actual=Buffer.from(part.slice(3),"base64");return actual.length===expected.length&&timingSafeEqual(actual,expected);});
}
export async function POST(request:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET,key=process.env.RESEND_API_KEY,domain=process.env.VENUELOOM_REPLY_DOMAIN;
 if(!secret||!key||!domain)return new Response("Not configured",{status:503});
 const payload=await request.text();
 if(payload.length>100000||!verified(payload,request,secret))return new Response("Invalid signature",{status:401});
 const event=JSON.parse(payload) as {type:string;data?:{email_id?:string}};
 if(event.type!=="email.received"||!event.data?.email_id)return new Response("OK");
 const response=await fetch("https://api.resend.com/emails/receiving/"+encodeURIComponent(event.data.email_id),{headers:{Authorization:"Bearer "+key}});
 if(!response.ok)return new Response("Retry later",{status:503});
 const json=await response.json() as {data?:{from?:string;to?:string[];subject?:string;text?:string};from?:string;to?:string[];subject?:string;text?:string};
 const email=json.data||json;
 const to=(email.to||[]).map(x=>x.toLowerCase());
 const pattern=new RegExp("^reply\\+([0-9a-f-]{36})@"+domain.replace(/[.*+?^\x24{}()|[\]\\]/g,"\\$&")+"$","i");
 const match=to.map(x=>x.match(pattern)).find(Boolean);
 if(!match||!email.from)return new Response("OK");
 const from=email.from.match(/<([^>]+)>/)?.[1]||email.from;
 await recordCrmReply({followupId:match[1],emailId:event.data.email_id,from,subject:email.subject||"",body:email.text||""});
 return new Response("OK");
}
