import { bootstrapFirstOrganization } from "@venueloom/database";
import { errorResponse, requireIdentity, verifyMutationOrigin } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    verifyMutationOrigin(request);
    const identity = await requireIdentity();
    const body = await request.json() as {
      organizationName?: string;
      venueName?: string;
      timezone?: string;
      currency?: string;
    };

    if (!body.organizationName?.trim() || !body.venueName?.trim() || !body.timezone?.trim()) {
      return Response.json({ error: "Organization name, venue name, and timezone are required." }, { status: 422 });
    }

    const principal = await bootstrapFirstOrganization(identity, {
      organizationName: body.organizationName.trim(),
      venueName: body.venueName.trim(),
      timezone: body.timezone.trim(),
      currency: body.currency?.trim().toUpperCase() || "USD"
    });

    return Response.json({
      organizationId: principal.organizationId,
      organizationName: principal.organizationName,
      venues: principal.venues
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
