import type { QuoCallData } from "./quo/types";

export const FOLLOW_UP_STATUSES = [
  "Unassigned",
  "Ready",
  "In Progress",
  "Paused",
  "Completed",
  "Terminated",
] as const;

export const HANDLING_MODES = ["Automated", "Human"] as const;

export const CURRENT_CPS = ["NONE", "CP1", "CP2", "CP3"] as const;
export const APPLICABLE_CPS = ["CP1", "CP2", "CP3"] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export type HandlingMode = (typeof HANDLING_MODES)[number];
export type CurrentCp = (typeof CURRENT_CPS)[number];
export type ApplicableCp = (typeof APPLICABLE_CPS)[number];

export type CurrentCpOption = {
  id: string;
  name: string;
  fullName: string;
  definition: string;
  criteria: string;
  evidence: string;
};

export const CURRENT_CP_DICTIONARY: Record<CurrentCp, CurrentCpOption> = {
  NONE: {
    id: "NONE",
    name: "NONE",
    fullName: "No CP Completed",
    definition: "尚未完成任何 CP。",
    criteria: "没有任何一个 CP 达到完整完成标准。",
    evidence: "无",
  },
  CP1: {
    id: "CP1",
    name: "CP1",
    fullName: "Post-Tap Brand Experience Delivered",
    definition: "品牌定制的 Post-tap 体验已经完成，并已交付给 Connector 或 Owner 实际体验。",
    criteria:
      "Brand Customized Post-tap 已完成；Connector 或 Owner 已收到 FC 产品；对方可以实际 Tap 并访问该品牌体验。",
    evidence: "体验链接、测试记录、交付对象、交付日期",
  },
  CP2: {
    id: "CP2",
    name: "CP2",
    fullName: "Sample Delivered to Owner",
    definition: "正确 Owner 已经识别并收到 Sample，同时已具备后续直接推进所需的必要联系方式。",
    criteria: "正确 Owner 已识别；Owner 已收到 Sample；Owner Fire Cover Complete。",
    evidence: "Owner 身份记录、联系人信息、引荐记录、签收或确认记录",
  },
  CP3: {
    id: "CP3",
    name: "CP3",
    fullName: "Owner Input & Plan Review Completed",
    definition: "Owner 的业务目标及必要输入已经收集完成，并形成可进入 Review 的客户专属 Plan。",
    criteria:
      "Business Objective 已确认；必要业务流程、事实和限制已记录；AI 已生成客户专属 Plan；FC 已完成人工审核；Plan 已达到可进入 Review 的完整度。",
    evidence: "Guided Input 记录、Plan 版本、FC Review 记录",
  },
};

export function listCurrentCps(): CurrentCpOption[] {
  return CURRENT_CPS.map((name) => CURRENT_CP_DICTIONARY[name]);
}

export function listApplicableCps(): CurrentCpOption[] {
  return APPLICABLE_CPS.map((name) => CURRENT_CP_DICTIONARY[name]);
}

export function isCurrentCp(value?: string | null): value is CurrentCp {
  return !!value && (CURRENT_CPS as readonly string[]).includes(value);
}

export function isApplicableCp(value?: string | null): value is ApplicableCp {
  return !!value && (APPLICABLE_CPS as readonly string[]).includes(value);
}

export function parseCurrentCp(value?: string | null): CurrentCp | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (isCurrentCp(upper)) return upper;
  const normalized = raw.toLowerCase();
  if (
    normalized === "none" ||
    normalized === "not started" ||
    normalized.includes("no cp completed")
  ) {
    return "NONE";
  }
  const short = upper.match(/^CP([123])\b/);
  if (short) return `CP${short[1]}` as CurrentCp;
  if (normalized.includes("post-tap") || normalized.includes("post tap")) return "CP1";
  if (normalized.includes("sample delivered")) return "CP2";
  if (
    normalized.includes("owner input") ||
    normalized.includes("plan review") ||
    normalized.includes("plan meeting")
  ) {
    return "CP3";
  }
  return null;
}

export function currentCpOption(value?: string | null): CurrentCpOption {
  return CURRENT_CP_DICTIONARY[parseCurrentCp(value) || "NONE"];
}

export function parseApplicableCp(value?: string | null): ApplicableCp | null {
  const parsed = parseCurrentCp(value);
  return parsed && parsed !== "NONE" ? parsed : null;
}

export function resolveApplicableCp(values: string[]): ApplicableCp | null {
  for (const value of values) {
    const parsed = parseApplicableCp(value);
    if (parsed) return parsed;
  }
  return null;
}

export function currentCpSelect(value?: string | null) {
  const name = parseCurrentCp(value);
  if (!name) throw new Error("Unknown Current CP");
  return { select: { name } };
}

export function applicableCpSelect(value?: string | null) {
  const name = parseApplicableCp(value);
  if (!name) throw new Error("Unknown Applicable CP");
  return { select: { name } };
}

export type BrandListItem = {
  id: string;
  name: string;
  initials: string;
  currentCp: string;
  currentCpId?: string | null;
  status: string;
  handlingMode: HandlingMode | null;
  lastInteractionAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
};

export type BrandContact = {
  id: string;
  name: string;
  role: "Connector" | "Owner" | "Other";
  title: string | null;
  contactRole: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  emailValid: boolean;
  phoneValid: boolean;
  followupStatus: string | null;
  followupMode: string | null;
  contactOrder: string | null;
  notes: string | null;
  lastInteractionAt: string | null;
};

export type BrandTask = {
  id: string;
  title: string;
  contactId: string | null;
  contactName: string | null;
  brandId: string | null;
  brandName: string | null;
  brandOwnerId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  channel: string | null;
  status: string | null;
  priority: string | null;
  creationMethod: string | null;
  scheduledAt: string | null;
  endedAt: string | null;
  notes: string | null;
  conversationIds: string[];
  templateId: string | null;
  sourceBombId: string | null;
  sourceBombName?: string | null;
  sourceBombCp?: string | null;
  contactPhone?: string | null;
  inboxStatus?: "Needs Reply" | null;
  preview?: string | null;
  lastInboundAt?: string | null;
};

export type BrandActivity = {
  id: string;
  contactId: string | null;
  taskId: string | null;
  channel: string | null;
  direction: "Inbound" | "Outbound" | null;
  status: string | null;
  subject: string | null;
  content: string;
  sender: string | null;
  notes: string | null;
  callResult: string | null;
  sourceUrl: string | null;
  threadId: string | null;
  messageId: string | null;
  replyStatus: "Needs Reply" | "Replied" | null;
  cpAtInteraction: "CP1" | "CP2" | "CP3" | null;
  createdAt: string | null;
  recordedAt?: string | null;
  quo?: QuoCallData | null;
};

export type BrandDetail = BrandListItem & {
  priority: string | null;
  notes: string | null;
  createdAt: string | null;
  lastEditedAt: string | null;
  currentCpFullName: string | null;
  currentCpDefinition: string | null;
  contacts: BrandContact[];
  tasks: BrandTask[];
  activities: BrandActivity[];
};

export function brandInitials(name: string) {
  const letters = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return letters || "BR";
}
