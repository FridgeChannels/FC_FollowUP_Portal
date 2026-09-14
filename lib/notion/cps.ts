import { parseCurrentCp, type CurrentCpOption } from "../brand-list";
import {
  propertyText,
  queryDatabasePages,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getFollowupCheckpointDbId } from "./config";

export {
  applicableCpSelect,
  currentCpOption,
  currentCpSelect,
  listApplicableCps,
  listCurrentCps,
  parseApplicableCp,
  parseCurrentCp,
  resolveApplicableCp,
} from "../brand-list";

export function checkpointShortName(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const parsed = parseCurrentCp(raw);
  if (parsed) return parsed;
  const match = raw.toUpperCase().match(/^CP(\d+)/);
  if (match) return `CP${match[1]}`;
  if (/^nurture$/i.test(raw)) return "Nurture";
  return raw;
}

export function mapCheckpointPage(page: NotionPage): CurrentCpOption {
  const title = titleFromProperties(page.properties);
  const name = checkpointShortName(title) || "NONE";
  const fullName = title.includes("-")
    ? title.split("-").slice(1).join("-").trim()
    : title;
  return {
    id: page.id,
    name,
    fullName: fullName || title,
    definition:
      propertyText(page.properties?.["External Stage (Client Safe Wording)"]) || "",
    criteria: propertyText(page.properties?.["Completion Criteria"]) || "",
    evidence: propertyText(page.properties?.["Evidence"]) || "",
  };
}

function checkpointSortKey(item: CurrentCpOption) {
  if (item.name === "NONE") return "0";
  const match = item.name.match(/^CP(\d+)$/);
  if (match) return `1-${match[1].padStart(2, "0")}`;
  return `2-${item.name}`;
}

export async function listCheckpoints(): Promise<CurrentCpOption[]> {
  const pages = await queryDatabasePages(getFollowupCheckpointDbId());
  return pages.map(mapCheckpointPage).sort((left, right) => {
    return checkpointSortKey(left).localeCompare(checkpointSortKey(right));
  });
}

export async function resolveCheckpoint(value?: string | null) {
  const query = value?.trim();
  if (!query) return null;
  const items = await listCheckpoints();
  const short = checkpointShortName(query);
  return (
    items.find((item) => item.id === query) ||
    items.find((item) => item.name === query || item.name === short) ||
    items.find((item) => item.fullName === query) ||
    null
  );
}
