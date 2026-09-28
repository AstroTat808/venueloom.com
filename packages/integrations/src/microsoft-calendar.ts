import type { ExternalCalendar, ExternalCalendarEvent, LocalCalendarBlock, OAuthTokenSet } from "./calendar-types";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Microsoft Graph request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

export function buildMicrosoftCalendarAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  tenant?: string;
}) {
  const tenant = input.tenant ?? "common";
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", "openid profile email offline_access User.Read Calendars.ReadWrite");
  return url.toString();
}

export async function exchangeMicrosoftCalendarCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  tenant?: string;
}): Promise<OAuthTokenSet> {
  const tenant = input.tenant ?? "common";
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    grant_type: "authorization_code",
    scope: "openid profile email offline_access User.Read Calendars.ReadWrite"
  });
  const token = await json<{ access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string }>(
    await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
    })
  );
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    tokenType: token.token_type ?? "Bearer",
    scope: token.scope ?? null
  };
}

export async function refreshMicrosoftCalendarToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tenant?: string;
}): Promise<OAuthTokenSet> {
  const tenant = input.tenant ?? "common";
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
    scope: "openid profile email offline_access User.Read Calendars.ReadWrite"
  });
  const token = await json<{ access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string }>(
    await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
    })
  );
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? input.refreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    tokenType: token.token_type ?? "Bearer",
    scope: token.scope ?? null
  };
}

export async function getMicrosoftAccount(accessToken: string) {
  return json<{ id: string; displayName?: string; mail?: string; userPrincipalName?: string }>(
    await fetch(`${GRAPH}/me?$select=id,displayName,mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  );
}

export async function listMicrosoftCalendars(accessToken: string): Promise<ExternalCalendar[]> {
  const response = await json<{ value?: Array<{ id: string; name: string; canEdit?: boolean; isDefaultCalendar?: boolean }> }>(
    await fetch(`${GRAPH}/me/calendars?$select=id,name,canEdit,isDefaultCalendar`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  );
  return (response.value ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    primary: item.isDefaultCalendar ?? false,
    canEdit: item.canEdit ?? false
  }));
}

export async function pullMicrosoftCalendarEvents(input: {
  accessToken: string;
  calendarId: string;
  deltaLink?: string | null;
}): Promise<{ events: ExternalCalendarEvent[]; deltaLink: string }> {
  const events: ExternalCalendarEvent[] = [];
  let url = input.deltaLink;
  if (!url) {
    const start = new Date(Date.now() - 90 * 86400000).toISOString();
    const end = new Date(Date.now() + 730 * 86400000).toISOString();
    url = `${GRAPH}/me/calendars/${encodeURIComponent(input.calendarId)}/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`;
  }
  let deltaLink = "";

  while (url) {
    const page = await json<{
      value?: Array<{
        id: string; subject?: string; isAllDay?: boolean; showAs?: string; isCancelled?: boolean;
        lastModifiedDateTime?: string; changeKey?: string; "@removed"?: unknown;
        start?: { dateTime: string; timeZone?: string }; end?: { dateTime: string; timeZone?: string };
      }>;
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(await fetch(url, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Prefer: 'outlook.timezone="UTC"'
      }
    }));

    for (const item of page.value ?? []) {
      const removed = Boolean(item["@removed"]);
      const start = item.start?.dateTime ? new Date(item.start.dateTime.endsWith("Z") ? item.start.dateTime : `${item.start.dateTime}Z`) : new Date();
      const end = item.end?.dateTime ? new Date(item.end.dateTime.endsWith("Z") ? item.end.dateTime : `${item.end.dateTime}Z`) : new Date(start.getTime() + 3600000);
      events.push({
        id: item.id,
        summary: item.subject ?? null,
        startsAt: start,
        endsAt: end,
        allDay: item.isAllDay ?? false,
        status: removed || item.isCancelled ? "cancelled" : item.showAs === "tentative" ? "tentative" : "busy",
        updatedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
        version: item.changeKey ?? null,
        payloadHashSource: item
      });
    }
    url = page["@odata.nextLink"] ?? "";
    deltaLink = page["@odata.deltaLink"] ?? deltaLink;
  }

  if (!deltaLink) throw new Error("Microsoft Graph did not return a delta link.");
  return { events, deltaLink };
}

export async function pushMicrosoftCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  block: LocalCalendarBlock;
  externalId?: string | null;
}) {
  const payload = {
    subject: input.block.summary ?? "VenueLoom booking",
    isAllDay: input.block.allDay,
    showAs: "busy",
    start: { dateTime: input.block.startsAt.toISOString(), timeZone: "UTC" },
    end: { dateTime: input.block.endsAt.toISOString(), timeZone: "UTC" }
  };
  const url = input.externalId
    ? `${GRAPH}/me/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.externalId)}`
    : `${GRAPH}/me/calendars/${encodeURIComponent(input.calendarId)}/events`;
  const response = await json<{ id: string; changeKey?: string }>(
    await fetch(url, {
      method: input.externalId ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );
  return { id: response.id, version: response.changeKey ?? null };
}

export async function createMicrosoftCalendarSubscription(input: {
  accessToken: string;
  callbackUrl: string;
  clientState: string;
}) {
  return json<{ id: string; expirationDateTime: string; resource?: string }>(
    await fetch(`${GRAPH}/subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        changeType: "created,updated,deleted",
        notificationUrl: input.callbackUrl,
        resource: "/me/events",
        expirationDateTime: new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString(),
        clientState: input.clientState
      })
    })
  );
}
