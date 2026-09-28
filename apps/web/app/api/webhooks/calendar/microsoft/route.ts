import { enqueueCalendarWebhook } from "@venueloom/jobs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const body = await request.json().catch(() => ({ value: [] }));
  let accepted = false;
  for (const notification of body.value ?? []) {
    if (!notification.subscriptionId) continue;
    accepted = (await enqueueCalendarWebhook({
      provider: "microsoft",
      channelId: String(notification.subscriptionId),
      verificationToken: notification.clientState ? String(notification.clientState) : null
    })) || accepted;
  }
  return new Response(null, { status: accepted ? 202 : 404 });
}
