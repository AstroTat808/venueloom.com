import { requireWorkspace,verifyMutationOrigin,errorResponse } from "../../../lib/auth";
import { createEmailTemplate,scheduleCrmFollowup,listCrmActivity } from "@venueloom/database";
export const runtime="nodejs";
export async function GET(request:Request){
 try{const {principal}=await requireWorkspace(request);const id=new URL(request.url).searchParams.get("clientId");if(!id)return Response.json({error:"clientId required"},{status:422});return Response.json({activity:await listCrmActivity(principal,id)});}catch(e){return errorResponse(e);}
}
export async function POST(request:Request){
 try{verifyMutationOrigin(request);const {principal}=await requireWorkspace(request);const body=await request.json();const result=body.kind==="template"?await createEmailTemplate(principal,body):body.kind==="followup"?await scheduleCrmFollowup(principal,body):null;return result?Response.json(result,{status:201}):Response.json({error:"Invalid action"},{status:422});}catch(e){return errorResponse(e);}
}
