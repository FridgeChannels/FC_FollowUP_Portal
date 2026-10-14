import { CallerNotionError, registerCallerReport } from "../caller-notion";
import { listCallerDailyNotionReports, saveCallerDailyNotionReport } from "../caller-notion-data";
import { retrievePage, titleFromProperties } from "./client";
import { queryOwnerPages, type FollowupOwner } from "./owners";
import { isTestOnlyViewer } from "../brand-access";

export async function listCallerNotionReports(callerId: string) {
  return listCallerDailyNotionReports(callerId);
}

/** Validate the Notion page title, then upsert the link in Supabase (one row per caller × day). */
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
    save: (report) => saveCallerDailyNotionReport(report),
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
