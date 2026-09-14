import { CHANNELS, type Channel } from "../scheduling-engine/types";
import { propertyNumber, propertyText, queryDatabasePages } from "./client";
import { getFollowupCapacityDbId } from "./config";

export async function listChannelDailyMax(): Promise<Partial<Record<Channel, number>>> {
  const pages = await queryDatabasePages(getFollowupCapacityDbId());
  const dailyMax: Partial<Record<Channel, number>> = {};
  for (const page of pages) {
    const channel = propertyText(page.properties?.Channel);
    const value = propertyNumber(page.properties?.["Daily Max"]);
    if (CHANNELS.includes(channel as Channel) && value != null) {
      dailyMax[channel as Channel] = value;
    }
  }
  return dailyMax;
}
