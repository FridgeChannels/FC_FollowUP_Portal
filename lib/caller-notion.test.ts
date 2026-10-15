import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notionReportPageId, readReportBookmark, registerCallerReport, reportCaption, reportsFromBookmarks, reportToday, validReportDate, type CallerNotionReport, type ReportBookmark } from "./caller-notion.ts";

const id = "0123456789abcdef0123456789abcdef";
const input = { callerId: "caller-1", callerName: "Julio Rodriguez", date: "2026-10-06", url: `https://team.notion.site/Julio-${id}?source=copy_link` };
const report: CallerNotionReport = { ...input, pageId: id, title: "Julio Rodriguez 10-06-2026", url: `https://www.notion.so/${id}`, updatedAt: "2026-10-06T20:00:00Z" };
function block(value: CallerNotionReport): ReportBookmark { return { id: value.updatedAt, type: "bookmark", bookmark: { url: value.url, caption: [{ plain_text: reportCaption(value) }] } }; }

describe("Daily Notion matching", () => {
  it("checks calendar validity, including leap years", () => {
    for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-10-6", ""]) assert.equal(validReportDate(date), false);
    assert.equal(validReportDate("2028-02-29"), true);
  });
  it("uses the call display timezone for Today at midnight and DST boundaries", () => {
    assert.equal(reportToday("America/New_York", new Date("2026-10-07T03:59:59Z")), "2026-10-06");
    assert.equal(reportToday("America/New_York", new Date("2026-10-07T04:00:00Z")), "2026-10-07");
    assert.equal(reportToday("America/New_York", new Date("2026-11-01T05:30:00Z")), "2026-11-01");
  });
  it("accepts copied Notion links and canonicalizes the page ID", () => {
    assert.equal(notionReportPageId(input.url), id);
    assert.equal(notionReportPageId(`https://app.notion.com/p/Julio-${id}`), id);
    assert.equal(notionReportPageId("https://www.notion.so/01234567-89ab-cdef-0123-456789abcdef#block"), id);
  });
  it("rejects arbitrary hosts, protocols, credentials, and database view links without a page ID", () => {
    for (const url of [`http://www.notion.so/${id}`, `https://notion.so.attacker.com/${id}`, `https://notion.so@attacker.com/${id}`, `https://user@notion.so/${id}`, `https://notion.so:8080/${id}`, "javascript:alert(1)", `https://notion.so/?p=${id}`, "https://www.notion.so/slug"]) assert.throws(() => notionReportPageId(url));
  });
  it("reads only SFU bookmarks for the intended Caller, ignoring unrelated or damaged blocks", () => {
    assert.deepEqual(readReportBookmark(block(report), input.callerId), report);
    assert.equal(readReportBookmark(block(report), "another-caller"), null);
    assert.equal(readReportBookmark({ ...block(report), archived: true }, input.callerId), null);
    assert.equal(readReportBookmark({ id: "notes", type: "paragraph" }, input.callerId), null);
    assert.equal(readReportBookmark({ id: "bad", type: "bookmark", bookmark: { caption: [{ plain_text: "SFU daily report · {" }] } }, input.callerId), null);
    assert.equal(readReportBookmark(block({ ...report, url: "javascript:alert(1)" }), input.callerId), null);
  });
  it("keeps one latest link per day, retaining other dates despite concurrent writes", () => {
    const newer = { ...report, pageId: "f".repeat(32), url: `https://www.notion.so/${"f".repeat(32)}`, updatedAt: "2026-10-08T21:00:00Z" };
    const previousDay = { ...report, date: "2026-10-05" };
    assert.deepEqual(reportsFromBookmarks([block(newer), block(report), block(previousDay)], input.callerId), [newer, previousDay]);
  });
  it("registers the Notion URL under the selected date without reading the linked page", async () => {
    const stored: CallerNotionReport[] = [];
    const result = await registerCallerReport(input, {
      save: async (value) => { assert.equal(value.callerId, input.callerId); stored.push(value); },
      now: () => new Date(report.updatedAt),
    });
    assert.equal(stored.length, 1);
    assert.equal(result.date, input.date);
    assert.equal(result.title, "Daily report · 10-06-2026");
    assert.equal(result.pageId, id);
    assert.deepEqual(stored[0], result);
    assert.equal(stored.find((item) => item.date === "2026-10-07"), undefined);
  });
  it("rejects invalid selected dates and URLs without consulting Notion page content", async () => {
    let writes = 0;
    const store = { save: async () => { writes++; } };
    await assert.rejects(registerCallerReport({ ...input, date: "2026-13-01" }, store));
    await assert.rejects(registerCallerReport({ ...input, url: "https://example.com/notion-page" }, store));
    assert.equal(writes, 0);
  });
  it("does not claim success if persistence fails", async () => {
    await assert.rejects(registerCallerReport(input, { save: async () => { throw new Error("storage unavailable"); } }), /unavailable/);
  });
});
