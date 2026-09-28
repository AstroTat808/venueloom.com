export type CalendarProvider = "google-calendar" | "outlook-calendar";
export type CalendarSyncDirection = "inbound" | "outbound" | "two_way";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  tokenType?: string;
}

export interface ExternalCalendar {
  id: string;
  name: string;
  primary?: boolean;
  writable?: boolean;
  timezone?: string;
}

export interface ExternalCalendarEvent {
  id: string;
  version?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  cancelled: boolean;
  updatedAt?: string;
  venueLoomEventId?: string;
}

export interface PullResult {
  events: ExternalCalendarEvent[];
  nextCursor: string | null;
}

export interface CalendarWatch {
  channelId: string;
  resourceId?: string;
  tokenHash: string;
  expiresAt: string;
}

export interface CalendarProviderAdapter {
  provider: CalendarProvider;
  authorizationUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  exchangeCode(input: {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<OAuthTokenSet>;
  refreshToken(input: {
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
  }): Promise<OAuthTokenSet>;
  getAccount(tokens: OAuthTokenSet): Promise<{ id: string; name: string; email?: string }>;
  listCalendars(tokens: OAuthTokenSet): Promise<ExternalCalendar[]>;
  pullChanges(input: {
    tokens: OAuthTokenSet;
    calendarId: string;
    cursor?: string | null;
    windowStart: string;
    windowEnd: string;
  }): Promise<PullResult>;
  upsertEvent(input: {
    tokens: OAuthTokenSet;
    calendarId: string;
    externalEventId?: string;
    event: {
      title: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
      venueLoomEventId: string;
    };
  }): Promise<{ id: string; version?: string }>;
  createWatch(input: {
    tokens: OAuthTokenSet;
    calendarId: string;
    webhookUrl: string;
    verificationToken: string;
    channelId: string;
  }): Promise<{ channelId: string; resourceId?: string; expiresAt: string }>;
  deleteEvent(input: {
    tokens: OAuthTokenSet;
    calendarId: string;
    externalEventId: string;
  }): Promise<void>;
}
