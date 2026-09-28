import type { Config } from "@netlify/functions";
import { reconcileAllIntegrations } from "../../apps/web/lib/integrations/calendar-sync";

function exposeRuntimeEnv() {
  const names = [
    "DATABASE_URL",
    "VENUELOOM_SECRET_ENCRYPTION_KEY",
    "VENUELOOM_PUBLIC_URL",
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "MICROSOFT_CALENDAR_CLIENT_ID",
    "MICROSOFT_CALENDAR_CLIENT_SECRET",
    "MICROSOFT_CALENDAR_TENANT"
  ];
  for (const name of names) {
    const value = Netlify.env.get(name);
    if (value) process.env[name] = value;
  }
}

export default async () => {
  exposeRuntimeEnv();
  await reconcileAllIntegrations();
};

export const config: Config = {
  schedule: "*/15 * * * *"
};
