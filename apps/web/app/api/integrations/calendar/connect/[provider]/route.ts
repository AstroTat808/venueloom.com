import { randomBytes } from "node:crypto";
import { createOAuthState } from "@venueloom/database";
import {
  buildGoogleCalendarAuthUrl,
  buildMicrosoftCalendarAuthUrl
} from "@venueloom/integrations";
import { errorResponse, requireWorkspace } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params;
    if (!["google", "microsoft"].includes(provider)) {
      return Response.json({ error: "Unsupported calendar provider." }, { status: 404 });
    }

    const { principal } = await requireWorkspace(request);
    const origin = (process.env.VENUELOOM_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, "");
    const state = `${principal.organizationId}.${randomBytes(32).toString("base64url")}`;
    await createOAuthState(
      principal,
      provider === "google" ? "google-calendar" : "outlook-calendar",
      state,
      "/integrations"
    );

    const redirectUri = `${origin}/api/integrations/calendar/callback/${provider}`;
    const url = provider === "google"
      ? buildGoogleCalendarAuthUrl({
          clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
          redirectUri,
          state
        })
      : buildMicrosoftCalendarAuthUrl({
          clientId: process.env.MICROSOFT_CALENDAR_CLIENT_ID || "",
          redirectUri,
          state,
          tenant: process.env.MICROSOFT_CALENDAR_TENANT || "common"
        });

    if (
      (provider === "google" && !process.env.GOOGLE_CALENDAR_CLIENT_ID) ||
      (provider === "microsoft" && !process.env.MICROSOFT_CALENDAR_CLIENT_ID)
    ) {
      return Response.json({ error: `${provider} calendar OAuth is not configured.` }, { status: 503 });
    }

    return Response.redirect(url, 302);
  } catch (error) {
    return errorResponse(error);
  }
}
