import { requireWorkspace, verifyMutationOrigin, errorResponse } from "../../../lib/auth";
import { operationsSnapshot, createClient, createLead, changeLeadStage, createBooking, changeBookingStage } from "@venueloom/database";
export const runtime="nodejs";
export async function GET(request:Request) {
  try { const {principal}=await requireWorkspace(request);return Response.json(await operationsSnapshot(principal)); }
  catch(e){return errorResponse(e);}
}
export async function POST(request:Request) {
  try {
    verifyMutationOrigin(request);const {principal}=await requireWorkspace(request);
    const body=await request.json();
    const result=body.kind==="client"?await createClient(principal,body):
      body.kind==="lead"?await createLead(principal,body):
      body.kind==="booking"?await createBooking(principal,body):null;
    if(!result)return Response.json({error:"Unknown record type."},{status:422});
    return Response.json(result,{status:201});
  }catch(e){return errorResponse(e);}
}
export async function PATCH(request:Request) {
  try {
    verifyMutationOrigin(request);const {principal}=await requireWorkspace(request);const body=await request.json();
    const result=body.kind==="lead"?await changeLeadStage(principal,body):
      body.kind==="booking"?await changeBookingStage(principal,body):null;
    if(!result)return Response.json({error:"Unknown record type."},{status:422});
    return Response.json(result);
  }catch(e){return errorResponse(e);}
}
