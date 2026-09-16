import { CHANNELS, type Channel } from "../scheduling-engine/types";
import { propertyNumber, propertyText, queryDatabasePages } from "./client";
import { getFollowupCapacityDbId } from "./config";

export type ChannelCapacityConfig = {
  dailyMax: Partial<Record<Channel, number>>;
  timeInterval: Partial<Record<Channel, number>>;
};

let capacityCache: { at: number; value: ChannelCapacityConfig } | null = null;
const CAPACITY_CACHE_MS = 60_000;

export async function listChannelCapacityConfig(): Promise<ChannelCapacityConfig> {
  if (capacityCache && Date.now() - capacityCache.at < CAPACITY_CACHE_MS) {
    return {
      dailyMax: { ...capacityCache.value.dailyMax },
      timeInterval: { ...capacityCache.value.timeInterval },
    };
  }
  const pages = await queryDatabasePages(getFollowupCapacityDbId());
  const dailyMax: Partial<Record<Channel, number>> = {};
  const timeInterval: Partial<Record<Channel, number>> = {};
  for (const page of pages) {
    const channel = propertyText(page.properties?.Channel);
    if (!CHANNELS.includes(channel as Channel)) continue;
    const max = propertyNumber(page.properties?.["Daily Max"]);
    if (max != null) dailyMax[channel as Channel] = max;
    const interval = propertyNumber(page.properties?.["Time interval"]);
    if (interval != null) timeInterval[channel as Channel] = interval;
  }
  capacityCache = { at: Date.now(), value: { dailyMax, timeInterval } };
  return {
    dailyMax: { ...dailyMax },
    timeInterval: { ...timeInterval },
  };
}

export async function listChannelDailyMax(): Promise<Partial<Record<Channel, number>>> {
  const config = await listChannelCapacityConfig();
  return config.dailyMax;
}
