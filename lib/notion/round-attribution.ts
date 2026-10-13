import { communicationRoundId, notionWriteText, stampCommunicationRound, stampTaskRound, taskRoundId } from "../followup-history";
import { followupHistory, seedFollowupHistory } from "../followup-data";
import { isSupabaseConfigured } from "../supabase/config";
import { firstRelationId, propertyText, retrievePage, richText, type NotionProperty } from "./client";
import { getFollowupConversationDbId, getFollowupTaskDbId } from "./config";

/** Stamp new communications at creation, inheriting the originating task's
 * Round even if its delivery/review arrives after a later Round has started.
 * Existing rows are never backfilled by guessing from timestamps. */
export async function withRoundAttribution(databaseId: string, properties: Record<string, unknown>) {
  if (!isSupabaseConfigured()) return properties;
  const normalize = (id: string) => id.replace(/-/g, "").toLowerCase();
  const isConversation = normalize(databaseId) === normalize(getFollowupConversationDbId());
  const isTask = normalize(databaseId) === normalize(getFollowupTaskDbId());
  if (!isConversation && !isTask) return properties;
  const brandId = firstRelationId(properties["Follow-up Client"] as NotionProperty);
  if (!brandId) return properties;
  const params = notionWriteText(properties["Extended Parameters"]);
  let roundId = communicationRoundId(params);
  const taskId = isConversation ? firstRelationId(properties["Follow-up Task"] as NotionProperty) : null;
  if (taskId) {
    const task = await retrievePage(taskId);
    // A legacy task with no attribution remains unknown. It must not silently
    // acquire the newer current Round when its delayed result arrives.
    roundId = taskRoundId(propertyText(task.properties?.Notes));
  } else if (!roundId) {
    const page = await retrievePage(brandId);
    const history = await seedFollowupHistory(page);
    roundId = history.rounds.find(r => r.status === "Active" || r.status === "Paused")?.id || null;
  }
  if (!roundId) return properties;
  const history = await followupHistory(brandId);
  if (!history.rounds.some(r => r.id === roundId)) throw new Error("Communication Round does not belong to this Brand");
  return isConversation
    ? { ...properties, "Extended Parameters": { rich_text: richText(stampCommunicationRound(params, roundId)) } }
    : { ...properties, Notes: { rich_text: richText(stampTaskRound(notionWriteText(properties.Notes), roundId)) } };
}
