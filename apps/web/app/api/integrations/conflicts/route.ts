import { listOpenSyncConflicts } from "@venueloom/database";
import { errorResponse, requireWorkspace } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { principal } = await requireWorkspace(request);
    const conflicts = await listOpenSyncConflicts(principal.organizationId);
    return Response.json({
      conflicts: conflicts.map((conflict) => ({
        id: conflict.id,
        connectionId: conflict.connection_id,
        providerCode: conflict.provider_code,
        connectionName: conflict.connection_name,
        venueCalendarId: conflict.venue_calendar_id,
        internalId: conflict.internal_id,
        externalId: conflict.external_id,
        local: conflict.local_candidate,
        external: conflict.external_candidate,
        fields: conflict.field_summary,
        createdAt: conflict.created_at
      }))
    });
  } catch (error) {
    return errorResponse(error);
  }
}
