export type AiMeetingLink = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
};

const PROPERTY_NAME = "AI Meeting Links";

export function aiMeetingLinksPropertyName() {
  return PROPERTY_NAME;
}

function asAiMeetingLink(value: unknown): AiMeetingLink | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const createdAt = typeof row.createdAt === "string" ? row.createdAt.trim() : "";
  if (!id || !url) return null;
  return {
    id,
    title: title || "Meeting",
    url,
    createdAt: createdAt || "",
  };
}

export function parseAiMeetingLinks(value?: string | null): AiMeetingLink[] {
  const text = value?.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const link = asAiMeetingLink(item);
      return link ? [link] : [];
    });
  } catch {
    return [];
  }
}

export function encodeAiMeetingLinks(links: AiMeetingLink[]) {
  return JSON.stringify(
    links.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      createdAt: item.createdAt,
    })),
  );
}

export function sortAiMeetingLinks(links: AiMeetingLink[]) {
  return [...links].sort((a, b) => {
    const byTime = (b.createdAt || "").localeCompare(a.createdAt || "");
    if (byTime) return byTime;
    return a.title.localeCompare(b.title);
  });
}

export function appendAiMeetingLink(existing: AiMeetingLink[], next: AiMeetingLink) {
  const withoutDup = existing.filter((item) => item.id !== next.id && item.url !== next.url);
  return sortAiMeetingLinks([next, ...withoutDup]);
}
