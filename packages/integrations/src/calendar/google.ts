import type { CalendarProviderAdapter, ExternalCalendarEvent, OAuthTokenSet } from "./types";

const authBase = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const apiBase = "https://www.googleapis.com/calendar/v3";

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Google Calendar API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function tokenSet(value: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }, fallbackRefresh?: string): OAuthTokenSet {
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token ?? fallbackRefresh,
    expiresAt: new Date(Date.now() + (value.expires_in ?? 3600) * 1000).toISOString(),
    scope: value.scope,
    tokenType: value.token_type
  };
}

function auth(tokens: OAuthTokenSet) {
  return { Authorization: `Bearer ${tokens.accessToken}` };
}

function googleEvent(item: any): ExternalCalendarEvent {
  const allDay = Boolean(item.start?.date);
  const startsAt = allDay
    ? `${item.start.date}T00:00:00.000Z`
    : item.start?.dateTime ?? "1970-01-01T00:00:00.000Z";
  const endsAt = allDay
    ? `${item.end.date}T00:00:00.000Z`
    : item.end?.dateTime ?? "1970-01-01T00:00:01.000Z";
  return {
    id: item.id,
    version: item.etag,
    title: item.summary ?? "Busy",
    startsAt,
    endsAt,
    allDay,
    cancelled: item.status === "cancelled",
    updatedAt: item.updated,
    venueLoomEventId: item.extendedProperties?.private?.venueloomEventId
  };
}

export const googleCalendarAdapter: CalendarProviderAdapter = {
  provider: "google-calendar",
  authorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
    const url = new URL(authBase);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ].join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    }).toString();
    return url.toString();
  },
  async exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
    const body = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code"
    });
    if (clientSecret) body.set("client_secret", clientSecret);
    const result = await json<any>(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    return tokenSet(result);
  },
  async refreshToken({ clientId, clientSecret, refreshToken }) {
    const body = new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token" });
    if (clientSecret) body.set("client_secret", clientSecret);
    const result = await json<any>(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    return tokenSet(result, refreshToken);
  },
  async getAccount(tokens) {
    const account = await json<any>("https://www.googleapis.com/oauth2/v2/userinfo", { headers: auth(tokens) });
    return { id: account.id, name: account.name ?? account.email ?? "Google Calendar", email: account.email };
  },
  async listCalendars(tokens) {
    const data = await json<any>(`${apiBase}/users/me/calendarList?minAccessRole=reader&showHidden=false`, { headers: auth(tokens) });
    return (data.items ?? []).map((item: any) => ({
      id: item.id,
      name: item.summary ?? item.id,
      primary: Boolean(item.primary),
      writable: ["owner","writer"].includes(item.accessRole),
      timezone: item.timeZone
    }));
  },
  async pullChanges({ tokens, calendarId, cursor, windowStart, windowEnd }) {
    const events: ExternalCalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const url = new URL(`${apiBase}/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("showDeleted", "true");
      url.searchParams.set("maxResults", "2500");
      if (cursor) url.searchParams.set("syncToken", cursor);
      else {
        url.searchParams.set("timeMin", windowStart);
        url.searchParams.set("timeMax", windowEnd);
      }
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const data = await json<any>(url.toString(), { headers: auth(tokens) });
      events.push(...(data.items ?? []).filter((item: any) => item.id && ((item.start && item.end) || item.status === "cancelled")).map(googleEvent));
      pageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { events, nextCursor: nextSyncToken ?? cursor ?? null };
  },
  async upsertEvent({ tokens, calendarId, externalEventId, event }) {
    const body = {
      summary: event.title,
      start: { dateTime: event.startsAt, timeZone: event.timezone },
      end: { dateTime: event.endsAt, timeZone: event.timezone },
      extendedProperties: { private: { venueloomEventId: event.venueLoomEventId } }
    };
    const url = externalEventId
      ? `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`
      : `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events`;
    const result = await json<any>(url, {
      method: externalEventId ? "PUT" : "POST",
      headers: { ...auth(tokens), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { id: result.id, version: result.etag };
  },
  async createWatch({ tokens, calendarId, webhookUrl, verificationToken, channelId }) {
    const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const result = await json<any>(
      `${apiBase}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: "POST",
        headers: { ...auth(tokens), "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: verificationToken,
          expiration: String(expiration)
        })
      }
    );
    return {
      channelId: result.id ?? channelId,
      resourceId: result.resourceId,
      expiresAt: new Date(Number(result.expiration ?? expiration)).toISOString()
    };
  },
  async deleteEvent({ tokens, calendarId, externalEventId }) {
    const response = await fetch(`${apiBase}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`, {
      method: "DELETE", headers: auth(tokens)
    });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar delete failed: ${response.status}`);
  }
};
