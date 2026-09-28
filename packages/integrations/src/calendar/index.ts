export * from "./types";
export * from "./pkce";
export { googleCalendarAdapter } from "./google";
export { microsoftCalendarAdapter } from "./microsoft";

import { googleCalendarAdapter } from "./google";
import { microsoftCalendarAdapter } from "./microsoft";
import type { CalendarProvider } from "./types";

export function getCalendarAdapter(provider: CalendarProvider) {
  return provider === "google-calendar" ? googleCalendarAdapter : microsoftCalendarAdapter;
}
