import { resolveSyncConflict } from "@venueloom/database";
import { errorResponse, requireWorkspace, verifyMutationOrigin } from "@/lib/auth";
import { reconcileCalendarLink } from "@/lib/integrations/calendar-sync";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ conflictId: string }> }) {
  try {
    verifyMutationOrigin(request);
    const { conflictId } = await context.params;
    const { principal } = await requireWorkspace(request);
    const body = await request.json() as {
      resolution?: "venueloom" | "external" | "merged";
      mergedCandidate?: {
        summary?: string | null;
        startsAt?: string;
        endsAt?: string;
        allDay?: boolean;
        status?: "busy" | "tentative" | "cancelled";
      };
    };
    if (!body.resolution || !["venueloom","external","merged"].includes(body.resolution)) {
      return Response.json({ error: "Choose a valid conflict resolution." }, { status: 422 });
    }
    const resolved = await resolveSyncConflict({
      organizationId: principal.organizationId,
      conflictId,
      membershipId: principal.membershipId,
      resolution: body.resolution,
      mergedCandidate: body.mergedCandidate
    });
    if (!resolved) return Response.json({ error: "Conflict is no longer open." }, { status: 409 });

    await reconcileCalendarLink(principal.organizationId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
