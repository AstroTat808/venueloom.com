import {
  getCalendarAdapter,
  type CalendarProvider,
  type OAuthTokenSet
} from "@venueloom/integrations";
import {
  getRuntimeEnv,
  requireRuntimeEnv,
  getCalendarConnectionTokens,
  updateCalendarConnectionTokens,
  type TenantClient
} from "@venueloom/database";

export function calendarProviderFromPath(value: string): CalendarProvider {
  if (value === "google") return "google-calendar";
  if (value === "microsoft") return "outlook-calendar";
  throw new Error("Unsupported calendar provider");
}

export function calendarProviderCredentials(provider: CalendarProvider) {
  if (provider === "google-calendar") {
    return {
      clientId: requireRuntimeEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      clientSecret: getRuntimeEnv("GOOGLE_CALENDAR_CLIENT_SECRET")
    };
  }
  return {
    clientId: requireRuntimeEnv("MICROSOFT_CALENDAR_CLIENT_ID"),
    clientSecret: getRuntimeEnv("MICROSOFT_CALENDAR_CLIENT_SECRET")
  };
}

export async function getFreshCalendarTokens(
  client: TenantClient,
  organizationId: string,
  connectionId: string
): Promise<{ provider: CalendarProvider; tokens: OAuthTokenSet; connectionName: string }> {
  const connection = await getCalendarConnectionTokens(client, organizationId, connectionId);
  if (new Date(connection.tokens.expiresAt).getTime() > Date.now() + 5 * 60 * 1000) return connection;
  if (!connection.tokens.refreshToken) throw new Error("Calendar connection requires reauthorization");
  const adapter = getCalendarAdapter(connection.provider);
  const refreshed = await adapter.refreshToken({
    ...calendarProviderCredentials(connection.provider),
    refreshToken: connection.tokens.refreshToken
  });
  await updateCalendarConnectionTokens(client, organizationId, connectionId, refreshed);
  return { ...connection, tokens: refreshed };
}
