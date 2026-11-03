import { timingSafeEqual } from "node:crypto";
export const runtime="nodejs";
export async function POST(request:Request){
 const secret=process.env.VENUELOOM_CRON_SECRET;
 const token=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 if(!secret||Buffer.byteLength(token)!==Buffer.byteLength(secret)||!timingSafeEqual(Buffer.from(token),Buffer.from(secret)))return new Response("Unauthorized",{status:401});
 return Response.json({status:"not_configured",message:"Follow-up delivery disabled until durable queue worker and Resend credentials are configured."},{status:503});
}
