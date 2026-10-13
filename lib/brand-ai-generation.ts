import { env } from "cloudflare:workers";
import type { BrandActivity, BrandDetail, BrandTask } from "./brand-list";
import type { BrandAiSummaryScope } from "./brand-ai-summary";
import { signalFollowUps, signalFollowUpTime } from "./brand-ai-signal-followups";
import type { SignalEvent } from "./signals/model";
import { encounterKeyContext } from "./followup-history";

type AmScope = {
  id: string;
  name: string | null;
  startAt: string | null;
  endAt: string | null;
};

/**
 * Default production prompt. `AI_BRAND_SUMMARY_PROMPT` may override this for
 * controlled experiments, but the feature is usable without prompt setup.
 */
export const DEFAULT_BRAND_AI_SUMMARY_PROMPT = `你是 Follow-up Portal 内部的 AI Sales Progress Analyst。

你的任务是基于系统提供的真实数据，生成简明、客观、面向负责人的品牌推进总结。

当 Summary view 为 Overall Progress 时，按以下四个标题输出：
- Current Progress：品牌从初次接触到当前的整体推进情况，用 2–3 句话概括。
- Key Progress：已经实现的关键进展，只保留重要结果。
- Current Blocker：当前影响推进的主要阻碍；没有明确阻碍时不得编造。
- Next Step：基于当前真实状态，指出最重要的下一步行动及责任人。

当 Summary view 为 AM Progress 时，使用以下结构：

4. AM Progress｜AM 工作与推进总结
针对当前选中的 AM，结合其负责该品牌期间的全部历史记录生成总结。

仅按以下三个标题输出，不要添加其他标题：
- Activity Summary｜操作统计与总结
  重点统计 Omnireach 与 Send Message 两类系统操作。说明各自累计执行次数；归纳每次的主要动作、涉及渠道、实际执行状态和结果。对于 Send Message，说明主要内容及其属于首次联系、后续跟进还是回复客户；仅在系统存在客户回复记录时说明客户是否回应。对于系统提供的 Sample Tap、Email Open、LinkedIn 三类关键 Signal，概括该 AM 是否有可验证的后续操作；没有记录时明确说明未记录到后续动作，不能将仅仅时间相邻的操作写成由 Signal 触发。用简洁总结归纳，不要逐条复述 Timeline。
- Engagement & Outcomes｜客户响应及推进成果
  基于全部沟通记录，总结客户在哪些渠道产生有效回复、表达的需求、兴趣或异议，以及 AM 推动的实际进展。只有客户同意且会议时间已确认时，才可以说明促成已确认 Meeting。
- Current Status｜当前状态
  用 1–2 句话说明该 AM 当前的沟通进度、正在等待的反馈及存在的主要问题。

具体操作记录与执行时间由系统界面单独提供展开查看，不要在总结中逐条列出。

如果存在 AM 交接，需要区分前任和现任 AM 的贡献，不得将其他 AM 的工作归属给当前 AM。

生成原则：
1. 只能引用系统内可验证的信息，不得编造客户意向、沟通结果、会议状态或任务完成情况。
2. 区分已完成、计划执行和等待反馈。
3. Sample Tap 和 Email Open 只能说明发生了互动，不能直接推断客户具有合作意向。
4. Meeting 只有客户同意且会议时间得到确认时，才能视为已确认。
5. 不要逐条复述 Timeline，重点突出推进成果、阻碍和下一步。
6. 没有足够信息时明确说明信息不足。
7. 语言简洁、客观、结果导向，避免空洞评价。`;

function readEnv(name: string) {
  const workerValue = (env as Record<string, unknown>)[name];
  if (typeof workerValue === "string" && workerValue.trim()) return workerValue.trim();
  return typeof process !== "undefined" ? process.env[name]?.trim() : undefined;
}

function summaryPrompt() {
  return readEnv("AI_BRAND_SUMMARY_PROMPT") || DEFAULT_BRAND_AI_SUMMARY_PROMPT;
}

export function brandAiSummaryConfiguration() {
  return {
    configured: Boolean(readEnv("OPENAI_API_KEY")),
    promptConfigured: true,
  };
}

function at(item: Pick<BrandActivity, "recordedAt" | "createdAt" | "scheduledAt">) {
  return item.recordedAt || item.createdAt || item.scheduledAt || null;
}

function clean(value?: string | null, limit = 500) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function describeActivity(item: BrandActivity) {
  return [
    at(item) || "Unknown time",
    item.direction || "Activity",
    item.channel || "Unknown channel",
    item.sender || "",
    clean(item.subject || item.content, 360),
    item.replyStatus ? `Reply: ${item.replyStatus}` : "",
    item.replyDueAt ? `Reply due: ${item.replyDueAt}` : "",
  ].filter(Boolean).join(" · ");
}

function describeTask(item: BrandTask) {
  return [
    item.scheduledAt || item.createdAt || "Unknown time",
    item.channel || "Task",
    item.status || "Unknown status",
    item.ownerName || "Unassigned",
    clean(item.title || item.notes || item.preview, 240),
  ].filter(Boolean).join(" · ");
}

function describeSignalFollowUp(item: ReturnType<typeof signalFollowUps>[number]) {
  const signal = item.signal;
  const type = signal.type === "sample" ? "Sample Tap" : signal.type === "email" ? "Email Open" : "LinkedIn";
  if (!item.action) {
    return `${type} · ${signal.occurredAt}: No recorded AM follow-up within 7 days.`;
  }
  return `${type} · ${signal.occurredAt}: First recorded AM follow-up within 7 days — ${describeActivity(item.action)}.`;
}

export function amScopeForBrand(brand: BrandDetail, amId: string): AmScope | null {
  const history = [...(brand.assignmentHistory || [])]
    .filter((item) => item.ownerId)
    .sort((left, right) => left.assignedAt.localeCompare(right.assignedAt));
  const index = history.map((item) => item.ownerId).lastIndexOf(amId);
  if (index >= 0) {
    const assignment = history[index];
    return {
      id: amId,
      name: assignment.ownerName,
      startAt: assignment.assignedAt,
      endAt: history[index + 1]?.assignedAt || null,
    };
  }
  if (brand.ownerId === amId) {
    return {
      id: amId,
      name: brand.ownerName,
      startAt: brand.ownerAssignedAt || brand.createdAt,
      endAt: null,
    };
  }
  return null;
}

function inAmWindow(item: BrandActivity, scope: AmScope | null) {
  if (!scope) return false;
  const timestamp = at(item);
  if (!timestamp) return false;
  if (scope.startAt && timestamp < scope.startAt) return false;
  return !scope.endAt || timestamp < scope.endAt;
}

export function validAmScopes(brand: BrandDetail) {
  const ids = new Set<string>();
  if (brand.ownerId) ids.add(brand.ownerId);
  brand.assignmentHistory?.forEach((item) => ids.add(item.ownerId));
  return [...ids]
    .map((id) => amScopeForBrand(brand, id))
    .filter((item): item is AmScope => !!item)
    .sort((left, right) => (right.startAt || "").localeCompare(left.startAt || ""));
}

export function brandAiSummaryContext(input: {
  brand: BrandDetail;
  scope: BrandAiSummaryScope;
  amId?: string | null;
  signals?: SignalEvent[];
}) {
  const { brand, scope, amId, signals = [] } = input;
  const amScope = scope === "am" && amId ? amScopeForBrand(brand, amId) : null;
  const scopedActivities = scope === "am"
    ? brand.activities.filter((item) => inAmWindow(item, amScope))
    : brand.activities;
  const activities = scopedActivities
    .slice()
    .sort((left, right) => (at(right) || "").localeCompare(at(left) || ""))
    .slice(0, 20);
  const followUps = scope === "am" ? signalFollowUps({
    signals,
    outboundActivities: scopedActivities.filter((item) => item.direction === "Outbound"),
    startAt: amScope?.startAt,
    endAt: amScope?.endAt,
  }) : [];
  const tasks = (scope === "am" && amId
    ? brand.tasks.filter((item) => item.ownerId === amId)
    : brand.tasks
  )
    .slice()
    .sort((left, right) => (right.scheduledAt || right.createdAt || "").localeCompare(left.scheduledAt || left.createdAt || ""))
    .slice(0, 15);
  const timestamps = [brand.lastEditedAt, brand.lastInteractionAt, ...activities.map(at), ...tasks.map((item) => item.scheduledAt || item.createdAt), ...followUps.map((item) => item.signal.occurredAt), ...followUps.map((item) => item.action ? signalFollowUpTime(item.action) : null)]
    .filter((value): value is string => !!value)
    .sort();
  const dataAsOf = timestamps.at(-1) || new Date().toISOString();

  return {
    dataAsOf,
    text: [
      `Summary view: ${scope === "overall" ? "overall brand progress" : "AM progress"}.`,
      scope === "am" ? `AM: ${amScope?.name || "Unknown"} (${amScope?.id || amId || "unknown"}); responsibility period: ${amScope?.startAt || "unknown"} to ${amScope?.endAt || "present"}.` : "",
      `Brand: ${brand.name}`,
      `Previously confirmed long-term relationship context: ${brand.relationshipSummary || "None saved"}`,
      `Previously saved Overall Progress (retain confirmed, still-valid information): ${brand.aiSummaries?.overall?.content || "None saved"}`,
      "Cross-Round information remains valid until explicitly superseded. Keep conflicting facts with sources; do not silently remove prior facts or contact restrictions.",
      `Exhibition Key Changes with original sources:\n${encounterKeyContext(brand.followupHistory) || "None recorded"}`,
      `Current CP: ${brand.currentCp}${brand.currentCpFullName ? ` — ${brand.currentCpFullName}` : ""}`,
      `Follow-up status: ${brand.status || "Unknown"}; handling mode: ${brand.handlingMode || "Unknown"}; current AM: ${brand.ownerName || "Unassigned"}.`,
      brand.priority ? `Priority: ${brand.priority}.` : "",
      brand.lastInteractionAt ? `Last interaction: ${brand.lastInteractionAt}.` : "",
      brand.lastReplyAt ? `Last customer reply: ${brand.lastReplyAt}.` : "",
      brand.humanNotes ? `Human notes: ${clean(brand.humanNotes, 700)}` : "",
      `Contacts: ${brand.contacts.map((item) => `${item.name} (${item.role})`).join(", ") || "None"}.`,
      `Open reply items: ${brand.activities.filter((item) => item.direction === "Inbound" && item.replyStatus === "Needs Reply").length}.`,
      "Recent activities:",
      ...(activities.length ? activities.map((item) => `- ${describeActivity(item)}`) : ["- None in this scope."]),
      ...(scope === "am" ? [
        "Key signals and recorded AM follow-up:",
        ...(followUps.length ? followUps.map((item) => `- ${describeSignalFollowUp(item)}`) : ["- No key Signal recorded for this AM period."]),
      ] : []),
      "Tasks:",
      ...(tasks.length ? tasks.map((item) => `- ${describeTask(item)}`) : ["- None in this scope."]),
    ].filter(Boolean).join("\n"),
  };
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };
  if (typeof data.output_text === "string") return data.output_text.trim();
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => typeof item.text === "string" ? item.text : "")
    .join("\n")
    .trim();
}

export async function generateBrandAiSummary(context: string, promptOverride?: string) {
  const key = readEnv("OPENAI_API_KEY");
  const prompt = promptOverride || summaryPrompt();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: readEnv("AI_BRAND_SUMMARY_MODEL") || "gpt-5-mini",
      input: `${prompt}\n\n---\nBrand data\n${context}`,
      max_output_tokens: 900,
    }),
  });
  if (!response.ok) {
    throw new Error(`AI summary generation failed (${response.status})`);
  }
  const content = responseText(await response.json());
  if (!content) throw new Error("AI summary generation returned no content");
  return content;
}
