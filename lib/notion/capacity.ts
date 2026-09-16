import { CHANNELS, type Channel } from "../scheduling-engine/types";
import { propertyNumber, propertyText, queryDatabasePages } from "./client";
import { getFollowupCapacityDbId } from "./config";

let dailyMaxCache: { at: number; value: Partial<Record<Channel, number>> } | null = null;
const DAILY_MAX_CACHE_MS = 60_000;

export async function listChannelDailyMax(): Promise<Partial<Record<Channel, number>>> {
  if (dailyMaxCache && Date.now() - dailyMaxCache.at < DAILY_MAX_CACHE_MS) {
    return { ...dailyMaxCache.value };
  }
  const pages = await queryDatabasePages(getFollowupCapacityDbId());
  const dailyMax: Partial<Record<Channel, number>> = {};
  for (const page of pages) {
    const channel = propertyText(page.properties?.Channel);
    const value = propertyNumber(page.properties?.["Daily Max"]);
    if (CHANNELS.includes(channel as Channel) && value != null) {
      dailyMax[channel as Channel] = value;
    }
  }
  dailyMaxCache = { at: Date.now(), value: dailyMax };
  return { ...dailyMax };
}
