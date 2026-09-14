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
    definition: "No checkpoint has been completed yet.",
    criteria: "None of the checkpoints have met their full completion standard.",
    evidence: "None",
  },
  CP1: {
    id: "CP1",
    name: "CP1",
    fullName: "Post-Tap Brand Experience Delivered",
    definition: "The brand-customized post-tap experience is complete and has been delivered for the Connector or Owner to try.",
    criteria:
      "Brand Customized Post-tap is complete; the Connector or Owner has received the FC product; they can tap and access the brand experience.",
    evidence: "Experience link, test record, recipient, delivery date",
  },
  CP2: {
    id: "CP2",
    name: "CP2",
    fullName: "Sample Delivered to Owner",
    definition: "The correct Owner has been identified, received the sample, and has the contact details needed to move forward.",
    criteria: "Correct Owner identified; Owner received the sample; Owner Fire Cover Complete.",
    evidence: "Owner identity, contact details, intro record, receipt or confirmation",
  },
  CP3: {
    id: "CP3",
    name: "CP3",
    fullName: "Owner Input & Plan Review Completed",
    definition: "The Owner's business objective and required inputs have been collected, and a client-specific plan is ready for review.",
    criteria:
      "Business Objective confirmed; required workflows, facts, and constraints recorded; AI generated a client-specific plan; FC completed human review; the plan is complete enough to enter Review.",
    evidence: "Guided Input record, plan version, FC Review record",
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
  extendedParameters?: string | null;
  replyStatus: "Needs Reply" | "Replied" | null;
  cpId: string | null;
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
  productDescription: string | null;
  matchedCategory: string | null;
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
