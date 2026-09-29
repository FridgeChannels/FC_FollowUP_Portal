import {
  getPosthogHost,
  getPosthogPersonalApiKey,
  getPosthogProjectId,
  isPosthogConfigured,
} from "./config.ts";

export type PosthogPageview = {
  uuid: string;
  timestamp: string;
  distinctId: string | null;
  deviceId: string | null;
  pathname: string | null;
  url: string | null;
  geoCity: string | null;
  geoCountry: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
};

type HogQLResponse = {
  results?: unknown[][];
  columns?: string[];
  error?: string;
};

function escapeLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function cell(row: unknown[], index: number) {
  const value = row[index];
  if (value == null) return null;
  return String(value);
}

export async function queryPageviewsForPath(input: {
  pathname: string;
  sinceIso?: string | null;
  limit: number;
}): Promise<PosthogPageview[]> {
  if (!isPosthogConfigured()) {
    throw new Error("POSTHOG_PERSONAL_API_KEY is not configured");
  }

  const pathname = escapeLiteral(input.pathname);
  const sinceClause = input.sinceIso
    ? `AND timestamp > toDateTime('${escapeLiteral(input.sinceIso)}')`
    : "";
  const limit = Math.max(1, Math.min(input.limit, 5000));

  const hogql = `
SELECT
  toString(uuid) AS uuid,
  toString(timestamp) AS timestamp,
  distinct_id,
  properties.$device_id,
  properties.$pathname,
  properties.$current_url,
  properties.$geoip_city_name,
  properties.$geoip_country_name,
  properties.$browser,
  properties.$os,
  properties.$referrer
FROM events
WHERE event = '$pageview'
  AND properties.$pathname = '${pathname}'
  ${sinceClause}
ORDER BY timestamp ASC
LIMIT ${limit}
`.trim();

  const response = await fetch(
    `${getPosthogHost()}/api/projects/${encodeURIComponent(getPosthogProjectId())}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getPosthogPersonalApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: hogql,
        },
      }),
    },
  );

  const body = (await response.json()) as HogQLResponse;
  if (!response.ok) {
    throw new Error(body.error || `PostHog query failed (${response.status})`);
  }

  return (body.results || [])
    .map((row) => ({
      uuid: cell(row, 0) || "",
      timestamp: cell(row, 1) || "",
      distinctId: cell(row, 2),
      deviceId: cell(row, 3),
      pathname: cell(row, 4),
      url: cell(row, 5),
      geoCity: cell(row, 6),
      geoCountry: cell(row, 7),
      browser: cell(row, 8),
      os: cell(row, 9),
      referrer: cell(row, 10),
    }))
    .filter((item) => item.uuid && item.timestamp);
}
