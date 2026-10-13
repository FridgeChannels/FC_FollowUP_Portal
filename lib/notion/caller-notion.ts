import { CallerNotionError, registerCallerReport, reportCaption, reportsFromBookmarks, type ReportBookmark } from "../caller-notion";
import { notionFetch, retrievePage, richText, titleFromProperties } from "./client";
import { queryOwnerPages, type FollowupOwner } from "./owners";
import { isTestOnlyViewer } from "../brand-access";

async function bookmarks(callerId: string) {
  const blocks: ReportBookmark[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const result = await notionFetch<{ results: ReportBookmark[]; has_more?: boolean; next_cursor?: string }>(`/blocks/${callerId}/children?${query}`);
    blocks.push(...result.results);
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

export async function listCallerNotionReports(callerId: string) {
  return reportsFromBookmarks(await bookmarks(callerId), callerId);
}

/** No database or schema changes: registrations live in the existing Caller page body. */
export async function saveCallerNotionReport(input: { callerId: string; callerName: string; date: string; url: string }) {
  return registerCallerReport(input, {
    readPage: async (pageId) => {
      try {
        const page = await retrievePage(pageId);
        const flags = page as { archived?: boolean; in_trash?: boolean };
        return { title: titleFromProperties(page.properties || {}), archived: flags.archived || flags.in_trash };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/Notion (403|404):/.test(message)) {
          throw new CallerNotionError("SFU cannot read this Notion page. Share the daily report with the existing SFU Notion connection, then try again.", 422);
        }
        throw error;
      }
    },
    append: async (callerId, report) => {
      // Append-only avoids lost updates across worker instances. The reader projects
      // one latest link per day, preserving old links and unrelated page content.
      await notionFetch(`/blocks/${callerId}/children`, {
        method: "PATCH",
        body: JSON.stringify({ children: [{ object: "block", type: "bookmark", bookmark: { url: report.url, caption: richText(reportCaption(report)) } }] }),
      });
    },
  });
}

export function singleCaller(owners: FollowupOwner[], testBrand: boolean) {
  const active = owners.filter((owner) => owner.role === "Caller" && owner.status === "Active");
  const testCallers = active.filter((owner) => isTestOnlyViewer({ email: owner.account }));
  const callers = testBrand && testCallers.length ? testCallers : active.filter((owner) => !isTestOnlyViewer({ email: owner.account }));
  if (callers.length !== 1) throw new CallerNotionError("A single active Caller could not be identified. Daily report matching is unavailable.", 409);
  return callers[0];
}

export async function brandCallerNotionReports(testBrand: boolean) {
  const caller = singleCaller(await queryOwnerPages(), testBrand);
  return { caller: { id: caller.id, name: caller.name }, reports: await listCallerNotionReports(caller.id) };
}
