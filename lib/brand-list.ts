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

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export type HandlingMode = (typeof HANDLING_MODES)[number];
export type CurrentCp = (typeof CURRENT_CPS)[number];

export type CurrentCpOption = {
  id: string;
  name: string;
  fullName?: string | null;
  definition?: string | null;
  criteria?: string | null;
};

export type BrandListItem = {
  id: string;
  name: string;
  initials: string;
  currentCp: string;
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
};

export type BrandActivity = {
  id: string;
  contactId: string | null;
  channel: string | null;
  direction: "Inbound" | "Outbound" | null;
  status: string | null;
  subject: string | null;
  content: string;
  sender: string | null;
  notes: string | null;
  callResult: string | null;
  sourceUrl: string | null;
  createdAt: string | null;
};

export type BrandDetail = BrandListItem & {
  priority: string | null;
  notes: string | null;
  createdAt: string | null;
  lastEditedAt: string | null;
  currentCpFullName: string | null;
  currentCpDefinition: string | null;
  contacts: BrandContact[];
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
