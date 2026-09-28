export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  tokenType?: string | null;
  scope?: string | null;
}

export interface ExternalCalendar {
  id: string;
  name: string;
  primary?: boolean;
  canEdit?: boolean;
  timezone?: string | null;
}

export interface ExternalCalendarEvent {
  id: string;
  summary?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  status: "busy" | "tentative" | "cancelled";
  updatedAt?: Date | null;
  version?: string | null;
  payloadHashSource?: unknown;
}

export interface LocalCalendarBlock {
  id: string;
  summary?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
}
