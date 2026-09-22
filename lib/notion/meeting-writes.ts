import {
  aiMeetingLinksPropertyName,
  appendAiMeetingLink,
  encodeAiMeetingLinks,
  parseAiMeetingLinks,
  type AiMeetingLink,
} from "../ai-meeting-links";
import { getDisplayTimeZone } from "../display-time";
import {
  createChildPage,
  notionPageUrl,
  propertyText,
  retrievePage,
  richText,
  updatePage,
} from "./client";
import { getFollowupMeetingListPageId } from "./config";

function escapeMeetingNotesTitle(value: string) {
  return value.replace(/[\\*`\[\]<>{}|^]/g, " ").replace(/\s+/g, " ").trim();
}

function formatMeetingTitle(brandName: string, at = new Date()) {
  const zone = getDisplayTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const stamp = `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  const brand = brandName.trim() || "Brand";
  return `${brand} · ${stamp}`;
}

function meetingNotesMarkdown(title: string) {
  const safeTitle = escapeMeetingNotesTitle(title) || "Meeting";
  return `<meeting-notes>\n\t${safeTitle}\n\t<notes>\n\t</notes>\n</meeting-notes>`;
}

export async function createAiMeetingForFollowupClient(input: {
  followupClientId: string;
  brandName: string;
}) {
  const title = formatMeetingTitle(input.brandName);
  const parentPageId = getFollowupMeetingListPageId();

  let page;
  try {
    page = await createChildPage(parentPageId, {
      title,
      markdown: meetingNotesMarkdown(title),
    });
  } catch (error) {
    // Fallback: page shell without meeting-notes block (user can /meet in Notion).
    const message = error instanceof Error ? error.message : "";
    if (!/markdown|meeting.?notes|Notion-Version|400|validation/i.test(message)) {
      throw error;
    }
    page = await createChildPage(parentPageId, { title });
  }

  const link: AiMeetingLink = {
    id: page.id,
    title,
    url: notionPageUrl(page),
    createdAt: page.created_time || new Date().toISOString(),
  };

  const clientPage = await retrievePage(input.followupClientId);
  const propertyName = aiMeetingLinksPropertyName();
  const existing = parseAiMeetingLinks(propertyText(clientPage.properties?.[propertyName]));
  const next = appendAiMeetingLink(existing, link);
  await updatePage(input.followupClientId, {
    [propertyName]: { rich_text: richText(encodeAiMeetingLinks(next)) },
  });

  return { meeting: link, meetings: next };
}
