export const LINKEDIN_ACCOUNT_NAMES = ["Paula LIU", "Billy HAO", "Ella ZHANG"] as const;

export type LinkedInAccountName = (typeof LINKEDIN_ACCOUNT_NAMES)[number];

export type LinkedInAccountStatus = "Active" | "Standby" | "Exhausted" | "Paused";

export type LinkedInOutreachKind = "cold" | "followup_after_reply";

export type LinkedInAccount = {
  id: string;
  name: LinkedInAccountName | string;
  monthlyQuota: number;
  monthlyUsedCold: number;
  status: LinkedInAccountStatus;
  sortOrder: number;
  quotaMonth: string;
  notes: string | null;
};

export type LinkedInGateMeta = {
  outreachKind: LinkedInOutreachKind;
  senderAccount: string;
  countsAgainstQuota: boolean;
};

export type LinkedInCreateDecision = LinkedInGateMeta & {
  countsAgainstBandwidth: boolean;
  noteLine: string;
};
