import {
  consumeOAuthState,
  resolveWorkspace,
  storeIntegrationSecret,
  upsertIntegrationConnection
} from "@venueloom/database";
import {
  exchangeGoogleCalendarCode,
  exchangeMicrosoftCalendarCode,
  getGoogleAccount,
  getMicrosoftAccount
} from "@venueloom/integrations";
import { errorResponse, requireIdentity } from "@/lib/auth";
import { encryptSecret } from "@/lib/secrets";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error");

    if (providerError) {
      return Response.redirect(new URL(`/integrations?calendar_error=${encodeURIComponent(providerError)}`, url.origin), 302);
    }
    if (!code || !state || !["google", "microsoft"].includes(provider)) {
      return Response.json({ error: "Invalid OAuth callback." }, { status: 400 });
    }

    const providerCode = provider === "google" ? "google-calendar" : "outlook-calendar";
    const stateRecord = await consumeOAuthState(providerCode, state);
    if (!stateRecord) {
      return Response.json({ error: "OAuth state is invalid or expired." }, { status: 400 });
    }

    const identity = await requireIdentity();
    const principal = await resolveWorkspace(identity, stateRecord.organizationId);
    if (!principal || principal.membershipId !== stateRecord.membershipId) {
      return Response.json({ error: "OAuth workspace does not match the signed-in membership." }, { status: 403 });
    }

    const origin = (process.env.VENUELOOM_PUBLIC_URL || url.origin).replace(/\/$/, "");
    const redirectUri = `${origin}/api/integrations/calendar/callback/${provider}`;

    if (provider === "google") {
      const tokens = await exchangeGoogleCalendarCode({
        clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "",
        redirectUri,
        code
      });
      const account = await getGoogleAccount(tokens.accessToken);
      const connectionId = await upsertIntegrationConnection(principal, {
        providerCode,
        name: account.email ? `Google Calendar · ${account.email}` : "Google Calendar",
        authType: "oauth",
        externalAccountId: account.sub
      });
      await storeIntegrationSecret(principal, {
        connectionId,
        purpose: "oauth_tokens",
        encryptedValue: encryptSecret(tokens)
      });
      return Response.redirect(new URL(`/integrations/calendars/${connectionId}`, origin), 302);
    }

    const tokens = await exchangeMicrosoftCalendarCode({
      clientId: process.env.MICROSOFT_CALENDAR_CLIENT_ID || "",
      clientSecret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET || "",
      redirectUri,
      code,
      tenant: process.env.MICROSOFT_CALENDAR_TENANT || "common"
    });
    const account = await getMicrosoftAccount(tokens.accessToken);
    const accountEmail = account.mail || account.userPrincipalName;
    const connectionId = await upsertIntegrationConnection(principal, {
      providerCode,
      name: accountEmail ? `Outlook Calendar · ${accountEmail}` : "Outlook Calendar",
      authType: "oauth",
      externalAccountId: account.id
    });
    await storeIntegrationSecret(principal, {
      connectionId,
      purpose: "oauth_tokens",
      encryptedValue: encryptSecret(tokens)
    });
    return Response.redirect(new URL(`/integrations/calendars/${connectionId}`, origin), 302);
  } catch (error) {
    return errorResponse(error);
  }
}
