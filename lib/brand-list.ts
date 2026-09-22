import type { QuoCallData } from "./quo/types";
import type { CallReviewRound } from "./call-review-history";

export const FOLLOW_UP_STATUSES = [
  "Unassigned",
  "Ready",
  "In Progress",
  "Paused",
  "Completed",
  "Terminated",
] as const;

export const HANDLING_MODES = ["Automated", "Human"] as const;

export const CURRENT_CPS = ["NONE", "CP1", "CP2", "CP3", "CP4", "CP5", "CP6", "Nurture"] as const;
export const APPLICABLE_CPS = ["CP1", "CP2", "CP3", "CP4", "CP5", "CP6"] as const;

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
    fullName: "Not Started",
    definition: "No checkpoint has been completed yet.",
    criteria: "No checkpoint has been completed yet.",
    evidence: "None",
  },
  CP1: {
    id: "CP1",
    name: "CP1",
    fullName: "Post-Tap Brand Experience Delivered",
    definition: "The brand-customized post-tap experience is complete and has been delivered for the Connector or Owner to try.",
    criteria:
      "The customized post-tap brand experience has been completed and is ready for the client to tap and experience at any time.\nThe brand's internal team has received the physical FC product.",
    evidence: "Experience link, test record, recipient, delivery date",
  },
  CP2: {
    id: "CP2",
    name: "CP2",
    fullName: "Sample Delivered to Owner",
    definition: "The correct Owner has been identified, received the sample, and has the contact details needed to move forward.",
    criteria:
      "The correct Owner has been identified.\nThe Owner has personally confirmed receipt of the sample.\nThe Owner's contact information across all five OmniReach channels has been collected as completely as possible.",
    evidence: "Owner identity, contact details, intro record, receipt or confirmation",
  },
  CP3: {
    id: "CP3",
    name: "CP3",
    fullName: "Owner Input & Plan Review Completed",
    definition: "The Owner's business objective and required inputs have been collected, and a client-specific plan is ready for review.",
    criteria:
      "The Owner has submitted the required information through the form, and the FC Activation Plan Review Meeting has been scheduled.\nThe FC Activation Plan has been completed.\nThe FC Activation Plan Review Meeting has been completed in full with the Owner.",
    evidence: "Guided Input record, plan version, FC Review record",
  },
  CP4: {
    id: "CP4", name: "CP4", fullName: "Plan Confirmed & Paid",
    definition: "The current plan has been confirmed and payment is complete.",
    criteria: "The current plan has been confirmed.\nPayment has been received or successfully confirmed by the finance team.",
    evidence: "Confirmed plan, payment receipt, or finance confirmation",
  },
  CP5: {
    id: "CP5", name: "CP5", fullName: "Fulfillment Delivered",
    definition: "The approved product has been completed, tested, and delivered.",
    criteria: "The physical product design has been completed.\nThe client has approved the final design.\nProduction has been completed.\nThe technical setup has been completed and successfully tested.\nDistribution preparations have been completed.\nThe product has been delivered.",
    evidence: "Approved design, production record, test result, and delivery confirmation",
  },
  CP6: {
    id: "CP6", name: "CP6", fullName: "Scale",
    definition: "Performance has been reviewed and the expanded scope is active.",
    criteria: "Measurement and performance review have been completed.\nThe expanded scope has been confirmed.\nPayment for the expanded scope has been completed.",
    evidence: "Performance review, confirmed expanded scope, and payment confirmation",
  },
  Nurture: {
    id: "Nurture", name: "Nurture", fullName: "Nurture",
    definition: "The partnership is on hold while remaining a potential future fit.",
    criteria: "The brand has been internally assessed and confirmed by FC as a fit for the FC3.0 ICP.\nThe partnership is temporarily on hold due to insufficient budget, a lack of strategic alignment, timing constraints, low internal priority, or similar reasons.\nThe reason for pausing has been documented.\nThe date of the next follow-up has been recorded.",
    evidence: "ICP assessment, pause reason, and next follow-up date",
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
  const short = upper.match(/^CP([1-6])\b/);
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
  if (normalized.includes("plan confirmed") || normalized.includes("paid")) return "CP4";
  if (normalized.includes("fulfillment") || normalized.includes("delivered")) return "CP5";
  if (normalized.includes("scale") || normalized.includes("expanded scope")) return "CP6";
  if (normalized.includes("nurture")) return "Nurture";
  return null;
}

export function currentCpOption(value?: string | null): CurrentCpOption {
  return CURRENT_CP_DICTIONARY[parseCurrentCp(value) || "NONE"];
}

export function parseApplicableCp(value?: string | null): ApplicableCp | null {
  const parsed = parseCurrentCp(value);
  return parsed && parsed !== "NONE" && parsed !== "Nurture" ? parsed : null;
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
  lastInteractionChannel: string | null;
  lastInteractionDirection: "Inbound" | "Outbound" | null;
  lastInteractionStatus: string | null;
  lastInteractionCallResult: string | null;
  lastReplyAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  /** Follow-up Client `Is Test` — Portal ACL hides these from all roles. */
  isTest?: boolean;
  needsReply?: boolean;
  /** A completed Phone task is waiting for an AccountManager qualification decision. */
  needsQualification?: boolean;
  qualificationTaskCount?: number;
  replyPreview?: string | null;
  /** @deprecated Prefer replyDueAt — kept as alias for list cache merges. */
  replyUpdatedAt?: string | null;
  /** Latest time this Needs Reply inbound should be answered (Reply Due At). */
  replyDueAt?: string | null;
};

export type BrandContact = {
  id: string;
  name: string;
  role: "Connector" | "Owner" | "Other";
  title: string | null;
  contactRole: string | null;
  email: string | null;
  phone: string | null;
  directPhone: string | null;
  officePhone: string | null;
  whatsapp?: string | null;
  linkedin: string | null;
  /** KeyPersonDB page id, when this contact is linked to Notion. */
  keyPersonId?: string | null;
  emailValid: boolean;
  phoneValid: boolean;
  followupStatus: string | null;
  followupMode: string | null;
  contactOrder: string | null;
  notes: string | null;
  lastInteractionAt: string | null;
};

/** Open this person's page in FC3.0-KeyPersonDB (app.notion.com/p/…). */
export function keyPersonNotionUrl(pageId: string) {
  return `https://app.notion.com/p/${pageId.replace(/-/g, "")}`;
}

export type BrandTask = {
  id: string;
  title: string;
  contactId: string | null;
  contactName: string | null;
  brandId: string | null;
  brandName: string | null;
  brandOwnerId: string | null;
  /** True when the related Follow-up Client has `Is Test` checked. */
  brandIsTest?: boolean;
  ownerId: string | null;
  ownerName: string | null;
  channel: string | null;
  status: string | null;
  priority: string | null;
  creationMethod: string | null;
  scheduledAt: string | null;
  endedAt: string | null;
  /** Notion task page created_time; used as OmniReach launch/creation time. */
  createdAt?: string | null;
  notes: string | null;
  conversationIds: string[];
  templateId: string | null;
  sourceBombId: string | null;
  omniReachRunId?: string | null;
  sourceBombName?: string | null;
  sourceBombCp?: string | null;
  callReviewStatus?: "Awaiting Review" | "Qualified" | "Unqualified" | null;
  /** Latest Unqualified reason (Notion `Call Review Reason`). */
  callReviewReason?: string | null;
  /** Set only when Qualified; cleared on Unqualified (Notion `Call Qualified At`). */
  callQualifiedAt?: string | null;
  /** Raw Notion `Call Review History` column (JSON); preferred over Notes embedding. */
  callReviewHistoryText?: string | null;
  callReviewHistory?: CallReviewRound[];
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
  cpAtInteraction: "CP1" | "CP2" | "CP3" | "CP4" | "CP5" | "CP6" | null;
  createdAt: string | null;
  recordedAt?: string | null;
  /** Plan send time (Outbound from scheduling / portal); Inbound usually empty. */
  scheduledAt?: string | null;
  replyDueAt?: string | null;
  quo?: QuoCallData | null;
  attachments?: import("./media-attachments").MediaAttachment[];
};

export function lastReplyAtFromActivities(
  items: Array<Pick<BrandActivity, "direction" | "createdAt" | "recordedAt" | "scheduledAt">>,
) {
  return items
    .filter((item) => item.direction === "Inbound")
    .map((item) => item.recordedAt || item.createdAt)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1) || null;
}

export type BrandMeetingNote = {
  id: string;
  title: string;
  url: string;
};

/** Portal-created Notion AI Meeting Notes links (Follow-up Client `AI Meeting Links` JSON). */
export type BrandAiMeetingLink = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
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
  followupExhibition: string | null;
  meetingNotes: BrandMeetingNote[];
  aiMeetingLinks: BrandAiMeetingLink[];
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
