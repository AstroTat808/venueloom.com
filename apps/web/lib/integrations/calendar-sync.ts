import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  getExternalMapping,
  listCalendarLinksForOrganization,
  listRentalLinksForOrganization,
  listSyncTenantIds,
  listVenueLoomBlocksForOutbound,
  markMissingExternalBlocksCancelled,
  storeIntegrationSecretForOrganization,
  updateCalendarLinkState,
  updateRentalLinkSyncState,
  upsertCalendarBlockByExternalId,
  upsertExternalCalendarMapping
} from "@venueloom/database";
import {
  createMicrosoftCalendarSubscription,
  pullGoogleCalendarEvents,
  pullMicrosoftCalendarEvents,
  pushGoogleCalendarEvent,
  pushMicrosoftCalendarEvent,
  refreshGoogleCalendarToken,
  refreshMicrosoftCalendarToken,
  watchGoogleCalendar,
  parseRentalIcal,
  type OAuthTokenSet
} from "@venueloom/integrations";
import { decryptSecret, encryptSecret } from "../secrets";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function getUsableCalendarToken(
  organizationId: string,
  connectionId: string,
  providerCode: "google-calendar" | "outlook-calendar",
  encrypted: string | null
): Promise<OAuthTokenSet> {
  if (!encrypted) throw new Error("OAuth token is missing.");
  let token = decryptSecret<OAuthTokenSet>(encrypted);
  if (!token.expiresAt || token.expiresAt > Date.now() + 120_000) return token;
  if (!token.refreshToken) throw new Error("OAuth refresh token is missing.");

  token = providerCode === "google-calendar"
    ? await refreshGoogleCalendarToken({
        clientId: env("GOOGLE_CALENDAR_CLIENT_ID"),
        clientSecret: env("GOOGLE_CALENDAR_CLIENT_SECRET"),
        refreshToken: token.refreshToken
      })
    : await refreshMicrosoftCalendarToken({
        clientId: env("MICROSOFT_CALENDAR_CLIENT_ID"),
        clientSecret: env("MICROSOFT_CALENDAR_CLIENT_SECRET"),
        tenant: process.env.MICROSOFT_CALENDAR_TENANT || "common",
        refreshToken: token.refreshToken
      });

  await storeIntegrationSecretForOrganization({
    organizationId,
    connectionId,
    purpose: "oauth_tokens",
    encryptedValue: encryptSecret(token)
  });
  return token;
}

async function reconcileInbound(
  link: Awaited<ReturnType<typeof listCalendarLinksForOrganization>>[number],
  token: OAuthTokenSet
) {
  if (link.providerCode === "google-calendar") {
    let pulled;
    try {
      pulled = await pullGoogleCalendarEvents({
        accessToken: token.accessToken,
        calendarId: link.externalCalendarId,
        syncToken: link.syncCursor
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "GOOGLE_SYNC_TOKEN_EXPIRED") {
        pulled = await pullGoogleCalendarEvents({
          accessToken: token.accessToken,
          calendarId: link.externalCalendarId,
          syncToken: null
        });
      } else {
        throw error;
      }
    }

    for (const event of pulled.events) {
      await upsertCalendarBlockByExternalId({
        organizationId: link.organizationId,
        venueCalendarId: link.venueCalendarId,
        connectionId: link.connectionId,
        sourceType: "google",
        externalId: event.id,
        summary: event.summary,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        status: event.status,
        payloadHash: hash(event.payloadHashSource),
        sourceUpdatedAt: event.updatedAt
      });
    }
    await updateCalendarLinkState(link.organizationId, link.id, {
      syncCursor: pulled.nextSyncToken,
      syncedNow: true,
      lastError: null
    });
    return;
  }

  let pulled;
  try {
    pulled = await pullMicrosoftCalendarEvents({
      accessToken: token.accessToken,
      calendarId: link.externalCalendarId,
      deltaLink: link.syncCursor
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("(410)") || message.includes("(404)")) {
      pulled = await pullMicrosoftCalendarEvents({
        accessToken: token.accessToken,
        calendarId: link.externalCalendarId,
        deltaLink: null
      });
    } else {
      throw error;
    }
  }

  for (const event of pulled.events) {
    await upsertCalendarBlockByExternalId({
      organizationId: link.organizationId,
      venueCalendarId: link.venueCalendarId,
      connectionId: link.connectionId,
      sourceType: "microsoft",
      externalId: event.id,
      summary: event.summary,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      status: event.status,
      payloadHash: hash(event.payloadHashSource),
      sourceUpdatedAt: event.updatedAt
    });
  }
  await updateCalendarLinkState(link.organizationId, link.id, {
    syncCursor: pulled.deltaLink,
    syncedNow: true,
    lastError: null
  });
}

async function reconcileOutbound(
  link: Awaited<ReturnType<typeof listCalendarLinksForOrganization>>[number],
  token: OAuthTokenSet
) {
  const blocks = await listVenueLoomBlocksForOutbound(link.organizationId, link.venueCalendarId);
  for (const block of blocks) {
    const blockHash = hash({
      summary: block.summary,
      startsAt: block.starts_at.toISOString(),
      endsAt: block.ends_at.toISOString(),
      allDay: block.all_day
    });
    const mapping = await getExternalMapping(link.organizationId, link.connectionId, block.id);
    if (mapping?.last_seen_hash === blockHash) continue;

    const result = link.providerCode === "google-calendar"
      ? await pushGoogleCalendarEvent({
          accessToken: token.accessToken,
          calendarId: link.externalCalendarId,
          block: {
            id: block.id,
            summary: block.summary,
            startsAt: block.starts_at,
            endsAt: block.ends_at,
            allDay: block.all_day
          },
          externalId: mapping?.external_id
        })
      : await pushMicrosoftCalendarEvent({
          accessToken: token.accessToken,
          calendarId: link.externalCalendarId,
          block: {
            id: block.id,
            summary: block.summary,
            startsAt: block.starts_at,
            endsAt: block.ends_at,
            allDay: block.all_day
          },
          externalId: mapping?.external_id
        });

    await upsertExternalCalendarMapping({
      organizationId: link.organizationId,
      connectionId: link.connectionId,
      internalId: block.id,
      externalId: result.id,
      externalVersion: result.version,
      hash: blockHash
    });
  }
}

async function ensureWatch(
  link: Awaited<ReturnType<typeof listCalendarLinksForOrganization>>[number],
  token: OAuthTokenSet
) {
  if (link.syncMode === "outbound") return;
  if (link.webhookExpiresAt && link.webhookExpiresAt.getTime() > Date.now() + 6 * 60 * 60 * 1000) return;

  const publicUrl = env("VENUELOOM_PUBLIC_URL").replace(/\/$/, "");
  const clientState = randomBytes(24).toString("base64url");

  if (link.providerCode === "google-calendar") {
    const channelId = randomUUID();
    const watched = await watchGoogleCalendar({
      accessToken: token.accessToken,
      calendarId: link.externalCalendarId,
      channelId,
      channelToken: clientState,
      callbackUrl: `${publicUrl}/api/integrations/calendar/webhook/google/${link.organizationId}/${link.id}`
    });
    await updateCalendarLinkState(link.organizationId, link.id, {
      webhookChannelId: watched.id,
      webhookResourceId: watched.resourceId,
      webhookClientState: clientState,
      webhookExpiresAt: watched.expiration ? new Date(Number(watched.expiration)) : new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    return;
  }

  const watched = await createMicrosoftCalendarSubscription({
    accessToken: token.accessToken,
    clientState,
    callbackUrl: `${publicUrl}/api/integrations/calendar/webhook/microsoft/${link.organizationId}/${link.id}`
  });
  await updateCalendarLinkState(link.organizationId, link.id, {
    webhookChannelId: watched.id,
    webhookClientState: clientState,
    webhookExpiresAt: new Date(watched.expirationDateTime)
  });
}

export async function reconcileCalendarLink(
  organizationId: string,
  linkId?: string
) {
  const links = await listCalendarLinksForOrganization(organizationId);
  const selected = linkId ? links.filter((link) => link.id === linkId) : links;

  for (const link of selected) {
    try {
      const token = await getUsableCalendarToken(link.organizationId, link.connectionId, link.providerCode, link.encryptedToken);
      if (link.syncMode === "inbound" || link.syncMode === "two_way") {
        await reconcileInbound(link, token);
      }
      if (link.syncMode === "outbound" || link.syncMode === "two_way") {
        await reconcileOutbound(link, token);
      }
      await ensureWatch(link, token);
      await updateCalendarLinkState(link.organizationId, link.id, { lastError: null, syncedNow: true });
    } catch (error) {
      await updateCalendarLinkState(link.organizationId, link.id, {
        lastError: error instanceof Error ? error.message.slice(0, 1000) : "Calendar sync failed."
      });
    }
  }
}

function allowedRentalFeed(provider: "airbnb" | "vrbo", raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Rental calendar URL must use HTTPS.");
  const host = url.hostname.toLowerCase();
  const allowed = provider === "airbnb"
    ? host === "airbnb.com" || host.endsWith(".airbnb.com")
    : host === "vrbo.com" || host.endsWith(".vrbo.com") || host === "homeaway.com" || host.endsWith(".homeaway.com");
  if (!allowed) throw new Error(`The calendar URL is not hosted by ${provider === "airbnb" ? "Airbnb" : "Vrbo"}.`);
  return url;
}

export async function reconcileRentalCalendars(organizationId: string) {
  const links = await listRentalLinksForOrganization(organizationId);
  for (const link of links) {
    try {
      if (!link.encryptedInboundUrl) throw new Error("Rental calendar feed URL is missing.");
      const rawUrl = decryptSecret<string>(link.encryptedInboundUrl);
      const url = allowedRentalFeed(link.providerCode, rawUrl);
      const headers: Record<string, string> = { Accept: "text/calendar" };
      if (link.lastEtag) headers["If-None-Match"] = link.lastEtag;
      if (link.lastModified) headers["If-Modified-Since"] = link.lastModified;

      const response = await fetch(url, { headers, redirect: "error" });
      if (response.status === 304) {
        await updateRentalLinkSyncState(organizationId, link.id, { error: null });
        continue;
      }
      if (!response.ok) throw new Error(`Rental calendar fetch failed (${response.status}).`);
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > 5 * 1024 * 1024) throw new Error("Rental calendar feed exceeds 5 MB.");
      const body = await response.text();
      if (body.length > 5 * 1024 * 1024) throw new Error("Rental calendar feed exceeds 5 MB.");

      const events = parseRentalIcal(body);
      const seen: string[] = [];
      for (const event of events) {
        seen.push(event.id);
        await upsertCalendarBlockByExternalId({
          organizationId,
          venueCalendarId: link.venueCalendarId,
          connectionId: link.connectionId,
          sourceType: link.providerCode,
          externalId: event.id,
          summary: event.summary ?? (link.providerCode === "airbnb" ? "Airbnb reservation" : "Vrbo reservation"),
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          status: event.status,
          payloadHash: hash(event.payloadHashSource),
          sourceUpdatedAt: event.updatedAt
        });
      }
      if (seen.length) {
        await markMissingExternalBlocksCancelled(organizationId, link.connectionId, seen);
      }
      await updateRentalLinkSyncState(organizationId, link.id, {
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        error: null
      });
    } catch (error) {
      await updateRentalLinkSyncState(organizationId, link.id, {
        error: error instanceof Error ? error.message.slice(0, 1000) : "Rental calendar sync failed."
      });
    }
  }
}

export async function reconcileAllIntegrations() {
  const organizations = await listSyncTenantIds();
  for (const organizationId of organizations) {
    await reconcileCalendarLink(organizationId);
    await reconcileRentalCalendars(organizationId);
  }
}

export { allowedRentalFeed };
