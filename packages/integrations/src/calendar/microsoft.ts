import type { CalendarProviderAdapter, ExternalCalendarEvent, OAuthTokenSet } from "./types";

const tenant = "common";
const authBase = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
const tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const graph = "https://graph.microsoft.com/v1.0";

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Microsoft Graph ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function tokenSet(value: any, fallbackRefresh?: string): OAuthTokenSet {
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token ?? fallbackRefresh,
    expiresAt: new Date(Date.now() + (value.expires_in ?? 3600) * 1000).toISOString(),
    scope: value.scope,
    tokenType: value.token_type
  };
}
function auth(tokens: OAuthTokenSet) { return { Authorization: `Bearer ${tokens.accessToken}` }; }

function graphEvent(item: any): ExternalCalendarEvent {
  const start = item.start?.dateTime ? new Date(`${item.start.dateTime}${/[zZ]|[+-]\d\d:\d\d$/.test(item.start.dateTime) ? "" : "Z"}`) : null;
  const end = item.end?.dateTime ? new Date(`${item.end.dateTime}${/[zZ]|[+-]\d\d:\d\d$/.test(item.end.dateTime) ? "" : "Z"}`) : null;
  return {
    id: item.id,
    version: item.changeKey,
    title: item.subject ?? "Busy",
    startsAt: start?.toISOString() ?? new Date().toISOString(),
    endsAt: end?.toISOString() ?? new Date(Date.now()+3600000).toISOString(),
    allDay: Boolean(item.isAllDay),
    cancelled: Boolean(item.isCancelled) || item["@removed"] != null,
    updatedAt: item.lastModifiedDateTime,
    venueLoomEventId: item.singleValueExtendedProperties?.find((p: any) => p.id?.includes("VenueLoomEventId"))?.value
  };
}

export const microsoftCalendarAdapter: CalendarProviderAdapter = {
  provider: "outlook-calendar",
  authorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
    const url = new URL(authBase);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: "openid email profile offline_access User.Read Calendars.ReadWrite",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    }).toString();
    return url.toString();
  },
  async exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
    const body = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, code, code_verifier: codeVerifier,
      grant_type: "authorization_code", scope: "openid email profile offline_access User.Read Calendars.ReadWrite"
    });
    if (clientSecret) body.set("client_secret", clientSecret);
    return tokenSet(await json<any>(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }));
  },
  async refreshToken({ clientId, clientSecret, refreshToken }) {
    const body = new URLSearchParams({
      client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token",
      scope: "openid email profile offline_access User.Read Calendars.ReadWrite"
    });
    if (clientSecret) body.set("client_secret", clientSecret);
    return tokenSet(await json<any>(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }), refreshToken);
  },
  async getAccount(tokens) {
    const me = await json<any>(`${graph}/me?$select=id,displayName,mail,userPrincipalName`, { headers: auth(tokens) });
    return { id: me.id, name: me.displayName ?? me.userPrincipalName, email: me.mail ?? me.userPrincipalName };
  },
  async listCalendars(tokens) {
    const data = await json<any>(`${graph}/me/calendars?$select=id,name,canEdit,isDefaultCalendar`, { headers: auth(tokens) });
    return (data.value ?? []).map((item: any) => ({ id: item.id, name: item.name, primary: item.isDefaultCalendar, writable: item.canEdit }));
  },
  async pullChanges({ tokens, calendarId, cursor, windowStart, windowEnd }) {
    const events: ExternalCalendarEvent[] = [];
    let next = cursor || `${graph}/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta?startDateTime=${encodeURIComponent(windowStart)}&endDateTime=${encodeURIComponent(windowEnd)}`;
    let delta: string | null = cursor ?? null;
    while (next) {
      const data = await json<any>(next, { headers: { ...auth(tokens), Prefer: 'outlook.timezone="UTC"' } });
      events.push(...(data.value ?? []).filter((item: any) => item.start && item.end || item["@removed"]).map(graphEvent));
      next = data["@odata.nextLink"] ?? "";
      delta = data["@odata.deltaLink"] ?? delta;
    }
    return { events, nextCursor: delta };
  },
  async upsertEvent({ tokens, calendarId, externalEventId, event }) {
    const extendedId = "String {a9b2d166-8f4f-4bb8-a6aa-c93b4ad73977} Name VenueLoomEventId";
    const body = {
      subject: event.title,
      start: { dateTime: event.startsAt, timeZone: "UTC" },
      end: { dateTime: event.endsAt, timeZone: "UTC" },
      singleValueExtendedProperties: [{ id: extendedId, value: event.venueLoomEventId }]
    };
    const url = externalEventId
      ? `${graph}/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`
      : `${graph}/me/calendars/${encodeURIComponent(calendarId)}/events`;
    const result = await json<any>(url, {
      method: externalEventId ? "PATCH" : "POST",
      headers: { ...auth(tokens), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { id: result.id, version: result.changeKey };
  },
  async createWatch({ tokens, calendarId, webhookUrl, verificationToken, channelId }) {
    const expiresAt = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString();
    const result = await json<any>(`${graph}/subscriptions`, {
      method: "POST",
      headers: { ...auth(tokens), "Content-Type": "application/json" },
      body: JSON.stringify({
        changeType: "created,updated,deleted",
        notificationUrl: webhookUrl,
        resource: `me/calendars/${calendarId}/events`,
        expirationDateTime: expiresAt,
        clientState: verificationToken
      })
    });
    return {
      channelId: result.id ?? channelId,
      resourceId: result.resource,
      expiresAt: result.expirationDateTime ?? expiresAt
    };
  },
  async deleteEvent({ tokens, calendarId, externalEventId }) {
    const response = await fetch(`${graph}/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`, {
      method: "DELETE", headers: auth(tokens)
    });
    if (!response.ok && response.status !== 404) throw new Error(`Microsoft Calendar delete failed: ${response.status}`);
  }
};
