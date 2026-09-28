import type { ExternalCalendar, ExternalCalendarEvent, LocalCalendarBlock, OAuthTokenSet } from "./calendar-types";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

export function buildGoogleCalendarAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(AUTH);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar"
  ].join(" "));
  return url.toString();
}

export async function exchangeGoogleCalendarCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<OAuthTokenSet> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    grant_type: "authorization_code"
  });
  const token = await json<{
    access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string;
  }>(await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }));
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    tokenType: token.token_type ?? "Bearer",
    scope: token.scope ?? null
  };
}

export async function refreshGoogleCalendarToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OAuthTokenSet> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token"
  });
  const token = await json<{
    access_token: string; expires_in?: number; token_type?: string; scope?: string;
  }>(await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }));
  return {
    accessToken: token.access_token,
    refreshToken: input.refreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    tokenType: token.token_type ?? "Bearer",
    scope: token.scope ?? null
  };
}

export async function getGoogleAccount(accessToken: string) {
  return json<{ sub: string; email?: string; name?: string }>(
    await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  );
}

export async function listGoogleCalendars(accessToken: string): Promise<ExternalCalendar[]> {
  const response = await json<{ items?: Array<{ id: string; summary?: string; primary?: boolean; accessRole?: string; timeZone?: string }> }>(
    await fetch(`${API}/users/me/calendarList?minAccessRole=reader`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  );
  return (response.items ?? []).map((item) => ({
    id: item.id,
    name: item.summary ?? item.id,
    primary: item.primary ?? false,
    canEdit: item.accessRole === "owner" || item.accessRole === "writer",
    timezone: item.timeZone ?? null
  }));
}

function googleEventTime(value: { date?: string; dateTime?: string } | undefined, fallback: Date) {
  if (value?.dateTime) return { date: new Date(value.dateTime), allDay: false };
  if (value?.date) return { date: new Date(`${value.date}T00:00:00Z`), allDay: true };
  return { date: fallback, allDay: false };
}

export async function pullGoogleCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
}): Promise<{ events: ExternalCalendarEvent[]; nextSyncToken: string }> {
  const events: ExternalCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken = "";

  do {
    const url = new URL(`${API}/calendars/${encodeURIComponent(input.calendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "2500");
    if (input.syncToken) {
      url.searchParams.set("syncToken", input.syncToken);
    } else {
      url.searchParams.set("timeMin", new Date(Date.now() - 90 * 86400000).toISOString());
      url.searchParams.set("timeMax", new Date(Date.now() + 730 * 86400000).toISOString());
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${input.accessToken}` } });
    if (response.status === 410) {
      const error = new Error("GOOGLE_SYNC_TOKEN_EXPIRED");
      Object.assign(error, { code: "GOOGLE_SYNC_TOKEN_EXPIRED" });
      throw error;
    }
    const page = await json<{
      items?: Array<{
        id: string; summary?: string; status?: string; transparency?: string; etag?: string; updated?: string;
        start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
      }>;
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(response);

    for (const item of page.items ?? []) {
      const start = googleEventTime(item.start, new Date());
      const end = googleEventTime(item.end, new Date(start.date.getTime() + 3600000));
      events.push({
        id: item.id,
        summary: item.summary ?? null,
        startsAt: start.date,
        endsAt: end.date,
        allDay: start.allDay || end.allDay,
        status: item.status === "cancelled" ? "cancelled" : item.transparency === "transparent" ? "tentative" : "busy",
        updatedAt: item.updated ? new Date(item.updated) : null,
        version: item.etag ?? null,
        payloadHashSource: item
      });
    }
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  if (!nextSyncToken) throw new Error("Google Calendar did not return a sync token.");
  return { events, nextSyncToken };
}

export async function pushGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  block: LocalCalendarBlock;
  externalId?: string | null;
}) {
  const payload = input.block.allDay
    ? {
        summary: input.block.summary ?? "VenueLoom booking",
        start: { date: input.block.startsAt.toISOString().slice(0, 10) },
        end: { date: input.block.endsAt.toISOString().slice(0, 10) }
      }
    : {
        summary: input.block.summary ?? "VenueLoom booking",
        start: { dateTime: input.block.startsAt.toISOString() },
        end: { dateTime: input.block.endsAt.toISOString() }
      };

  const url = input.externalId
    ? `${API}/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.externalId)}`
    : `${API}/calendars/${encodeURIComponent(input.calendarId)}/events`;
  const response = await json<{ id: string; etag?: string }>(
    await fetch(url, {
      method: input.externalId ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );
  return { id: response.id, version: response.etag ?? null };
}

export async function watchGoogleCalendar(input: {
  accessToken: string;
  calendarId: string;
  channelId: string;
  callbackUrl: string;
  channelToken: string;
}) {
  return json<{ id: string; resourceId: string; expiration?: string }>(
    await fetch(`${API}/calendars/${encodeURIComponent(input.calendarId)}/events/watch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.channelId,
        type: "web_hook",
        address: input.callbackUrl,
        token: input.channelToken
      })
    })
  );
}
