import { reportToday, type CallerNotionReport } from "./caller-notion";
import { getDisplayTimeZone } from "./display-time";

export const MOCK_CALLER_ID = "mock-test-caller";
export const MOCK_CALLER_NAME = "Test-Caller";
export const MOCK_CALLER_EMAIL = "testcaller@fridgechannels.com";
export const MOCK_PETER_BRAND_ID = "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87";

type MockStore = { reports: CallerNotionReport[] };
type MockGlobal = typeof globalThis & { __fcMockCallerNotion?: MockStore };

function titleDate(date: string) {
  return `${date.slice(5, 7)}-${date.slice(8)}-${date.slice(0, 4)}`;
}

function createStore(): MockStore {
  const date = reportToday(getDisplayTimeZone());
  return {
    reports: [{
      callerId: MOCK_CALLER_ID,
      callerName: MOCK_CALLER_NAME,
      date,
      pageId: "mock-test-caller-daily-report",
      url: "https://www.notion.so/mock-test-caller-daily-report",
      title: `${MOCK_CALLER_NAME} ${titleDate(date)}`,
      updatedAt: new Date().toISOString(),
    }],
  };
}

function store() {
  const root = globalThis as MockGlobal;
  root.__fcMockCallerNotion ??= createStore();
  return root.__fcMockCallerNotion;
}

/** Opt-in memory store. Local and production both persist to Supabase unless this is set. */
export function mockCallerNotionEnabled() {
  return process.env.MOCK_CALLER_NOTION === "1";
}

export function mockCallerNotionReports() {
  return [...store().reports].sort((left, right) => right.date.localeCompare(left.date));
}

export function saveMockCallerNotionReport(input: { date: string; url: string }) {
  const report: CallerNotionReport = {
    callerId: MOCK_CALLER_ID,
    callerName: MOCK_CALLER_NAME,
    date: input.date,
    pageId: `mock-${input.date}`,
    url: input.url,
    title: `${MOCK_CALLER_NAME} ${titleDate(input.date)}`,
    updatedAt: new Date().toISOString(),
  };
  const current = store();
  current.reports = [...current.reports.filter((item) => item.date !== input.date), report];
  return report;
}
