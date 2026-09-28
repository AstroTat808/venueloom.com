import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCalendarAdapter } from "@venueloom/integrations";
import {
  consumeOAuthState,
  upsertCalendarConnection,
  withTenantTransaction,
  requireRuntimeEnv
} from "@venueloom/database";
import { getIntegrationAdminSession } from "../../../../../../lib/auth";
import { calendarProviderCredentials, calendarProviderFromPath } from "../../../../../../lib/calendar-auth";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const tenant = await getIntegrationAdminSession();
  const baseUrl = requireRuntimeEnv("PUBLIC_APP_URL").replace(/\/$/, "");
  if (!tenant) return NextResponse.redirect(`${baseUrl}/forbidden`);

  const { provider: providerPath } = await context.params;
  const provider = calendarProviderFromPath(providerPath);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  if (providerError || !code || !state) {
    return NextResponse.redirect(`${baseUrl}/integrations?calendarError=${encodeURIComponent(providerError ?? "Missing OAuth response")}`);
  }

  try {
    await withTenantTransaction(tenant.identity, tenant.session.organizationId, async (client, session) => {
      const stored = await consumeOAuthState(
        client,
        session,
        provider,
        createHash("sha256").update(state).digest("hex")
      );
      const adapter = getCalendarAdapter(provider);
      const tokens = await adapter.exchangeCode({
        ...calendarProviderCredentials(provider),
        redirectUri: stored.redirectUri,
        code,
        codeVerifier: stored.codeVerifier
      });
      const account = await adapter.getAccount(tokens);
      await upsertCalendarConnection(client, session, {
        provider,
        accountId: account.id,
        accountName: account.email ?? account.name,
        scopes: tokens.scope?.split(" ").filter(Boolean) ?? [],
        tokens
      });
    });
    return NextResponse.redirect(`${baseUrl}/integrations?connected=${providerPath}`);
  } catch (error) {
    return NextResponse.redirect(`${baseUrl}/integrations?calendarError=${encodeURIComponent(error instanceof Error ? error.message : "OAuth failed")}`);
  }
}
