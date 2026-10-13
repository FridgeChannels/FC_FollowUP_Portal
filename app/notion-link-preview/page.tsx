"use client";
import { useEffect, useState } from "react";
import { TodaysNotion } from "../todays-notion";
import { PhoneTaskBoard } from "../phone-task-board";
import { reportToday, registerCallerReport, type CallerNotionReport } from "@/lib/caller-notion";
import type { Interaction } from "@/lib/outreach-domain";

export default function Preview() {
  const [ready, setReady] = useState(false);
  const [brand, setBrand] = useState("fixture-brand-a");
  const [submitted, setSubmitted] = useState("");
  const today = reportToday("America/New_York");
  const titleDate = `${today.slice(5, 7)}-${today.slice(8)}-${today.slice(0, 4)}`;
  useEffect(() => {
    const original = window.fetch;
    let reports: CallerNotionReport[] = [];
    window.fetch = async (resource, init) => {
      const url = String(resource);
      if (url === "/api/caller-notion") {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          try {
            const report = await registerCallerReport({ ...body, callerId: "fixture-caller", callerName: "Julio Rodriguez" }, {
              readPage: async (id) => ({ title: id.startsWith("f") ? "Someone Else 10-06-2026" : `Julio Rodriguez ${titleDate}` }),
              append: async (_caller, report) => { reports = [...reports.filter((item) => item.date !== report.date), report]; },
            });
            return Response.json({ report });
          } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
        }
        return Response.json({ reports, today, timeZone: "America/New_York", callerName: "Julio Rodriguez" });
      }
      if (/^\/api\/brands\/fixture-brand-[ab]\/caller-notion$/.test(url)) return Response.json({ reports, caller: { id: "fixture-caller", name: "Julio Rodriguez" } });
      return original(resource, init);
    };
    queueMicrotask(() => setReady(true));
    return () => { window.fetch = original; };
  }, [today, titleDate]);
  const call = (id: string, taskId: string | undefined, date: string, result = "Connected"): Interaction => ({
    id, taskId, customerId: brand, channel: "Phone", type: "Phone", title: "Call", content: "", createdAt: "2026-10-20T12:00:00Z", direction: "Outbound", callResult: result,
    quo: { callId: `ACsim-${id}`, call: { createdAt: date, status: "completed", duration: 90, from: "+12025550101", to: "+12025550102" }, summary: { status: "completed", summary: ["Discussed the sample delivery."], nextSteps: ["Follow up next week."] }, transcript: { status: "completed", dialogue: [{ content: "Hello, thank you for calling.", identifier: "customer" }] } },
  });
  if (!ready) return null;
  return <main className="mx-auto max-w-4xl p-5"><p className="mb-4 text-sm text-amber-700">UI test fixture — simulated Notion; no external writes</p><TodaysNotion />
    <p className="mb-3 text-xs text-slate-500">Test URL: https://www.notion.so/0123456789abcdef0123456789abcdef</p>
    <button className="mb-3 rounded-lg border p-2" onClick={() => setBrand((value) => value.endsWith("a") ? "fixture-brand-b" : "fixture-brand-a")}>Switch brand · {brand}</button>
    {submitted ? <p role="status">Submitted {submitted}</p> : null}
    <PhoneTaskBoard key={brand} brandId={brand} phoneTasks={[{ id: "task-a", title: "Sample follow-up", status: "In Progress", dueAt: `${today}T15:00:00Z` }, { id: "task-b", title: "Owner introduction", status: "Completed", callReviewStatus: "Qualified", dueAt: `${today}T14:00:00Z` }]} contacts={[]} timeline={[call("today-a", "task-a", `${today}T15:00:00Z`), call("today-b", "task-b", `${today}T14:00:00Z`), call("yesterday", "task-a", "2026-10-06T14:00:00Z"), call("missed", "task-a", `${today}T16:00:00Z`, "No Answer"), call("unlinked", undefined, "2026-10-05T13:00:00Z")]} callerReviewTaskId="task-a" callerReviewCanSubmit callerReviewHasConnectedCall onSubmitCallerReview={(id) => setSubmitted(id)} showDial={false} />
  </main>;
}
