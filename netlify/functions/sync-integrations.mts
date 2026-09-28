import type { Config } from "@netlify/functions";
import {
  processIntegrationQueue,
  queueDueCalendarBindings,
  queueDueLodgingFeeds
} from "@venueloom/jobs";

export default async () => {
  await queueDueCalendarBindings();
  await queueDueLodgingFeeds();
  const result = await processIntegrationQueue(25);
  console.log(JSON.stringify({ event: "venueloom.integration.sync", ...result }));
};

export const config: Config = {
  schedule: "* * * * *"
};
