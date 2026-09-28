import { NextResponse } from "next/server";
import { createOAuthState, getCalendarAdapter } from "@venueloom/integrations";
import { saveOAuthState, withTenantTransaction, requireRuntimeEnv } from "@venueloom/database";
import { getTenantSession } from "../../../../../../lib/auth";
import { calendarProviderCredentials, calendarProviderFromPath } from "../../../../../../lib/calendar-auth";

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const tenant = await getTenantSession();
  if (!tenant) return NextResponse.redirect(new URL("/login", requireRuntimeEnv("PUBLIC_APP_URL")));
  const { provider: providerPath } = await context.params;
  const provider = calendarProviderFromPath(providerPath);
  const adapter = getCalendarAdapter(provider);
  const oauth = createOAuthState();
  const baseUrl = requireRuntimeEnv("PUBLIC_APP_URL").replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/integrations/calendar/${providerPath}/callback`;

  await withTenantTransaction(tenant.identity, tenant.session.organizationId, (client, session) =>
    saveOAuthState(client, session, { provider, stateHash: oauth.stateHash, codeVerifier: oauth.codeVerifier, redirectUri })
  );

  const url = adapter.authorizationUrl({
    ...calendarProviderCredentials(provider),
    redirectUri,
    state: oauth.state,
    codeChallenge: oauth.codeChallenge
  });
  return NextResponse.redirect(url);
}
