import { NextResponse } from "next/server";
import { getCalendarAdapter } from "@venueloom/integrations";
import { withTenantTransaction } from "@venueloom/database";
import { getTenantSession } from "../../../../../../lib/auth";
import { getFreshCalendarTokens } from "../../../../../../lib/calendar-auth";

export async function GET(_request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const tenant = await getTenantSession();
  if (!tenant) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { connectionId } = await context.params;
  try {
    const calendars = await withTenantTransaction(tenant.identity, tenant.session.organizationId, async (client, session) => {
      const connection = await getFreshCalendarTokens(client, session.organizationId, connectionId);
      return getCalendarAdapter(connection.provider).listCalendars(connection.tokens);
    });
    return NextResponse.json({ calendars });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list calendars" }, { status: 400 });
  }
}
