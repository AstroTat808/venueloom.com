import { enqueueCalendarWebhook } from "@venueloom/jobs";

export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const token = request.headers.get("x-goog-channel-token");
  if (!channelId) return new Response("Missing channel", { status: 400 });
  const accepted = await enqueueCalendarWebhook({ provider: "google", channelId, verificationToken: token });
  return new Response(null, { status: accepted ? 204 : 404 });
}
