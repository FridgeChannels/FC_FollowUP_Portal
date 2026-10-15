import { CallerNotionError, registerCallerReport } from "../caller-notion";
import { listCallerDailyNotionReports, saveCallerDailyNotionReport } from "../caller-notion-data";
import { queryOwnerPages, type FollowupOwner } from "./owners";
import { isTestOnlyViewer } from "../brand-access";

export async function listCallerNotionReports(callerId: string) {
  return listCallerDailyNotionReports(callerId);
}

/** Save the selected date and Notion URL in Supabase without reading the linked document. */
export async function saveCallerNotionReport(input: { callerId: string; callerName: string; date: string; url: string }) {
  return registerCallerReport(input, {
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
