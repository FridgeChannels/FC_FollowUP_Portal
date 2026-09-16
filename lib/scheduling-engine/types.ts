export const CHANNELS = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"] as const;
export type Channel = (typeof CHANNELS)[number];

export type Priority = "P0" | "P1" | "P2";
export type CreationMethod = "Automated" | "Manual";
export type FollowUpMode = "Automated" | "Manual";

export type ClientFollowUpStatus =
  | "Unassigned"
  | "Not Started"
  | "In Progress"
  | "Completed"
  | "Terminated";

export type ContactFollowUpStatus =
  | "Not Contacted"
  | "In Progress"
  | "Completed"
  | "Terminated";

export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Failed" | "Cancelled";

export type ReviewCode =
  | "NO_CONTACTS_SELECTED"
  | "NO_CHANNELS_SELECTED"
  | "CLIENT_STATUS_BLOCKED"
  | "MISSING_OWNER"
  | "CONTACT_STATUS_BLOCKED"
  | "CONTACT_MODE_BLOCKS_AUTOMATED"
  | "CHANNEL_UNREACHABLE"
  | "DO_NOT_CONTACT";

export type UnscheduledCode = "CHANNEL_PAUSED" | "NO_SLOT_IN_WINDOW";

export type ChannelSelection = {
  channel: Channel;
  reachable: boolean;
  doNotContact?: boolean;
  templateId?: string;
};

export type ContactSelection = {
  contactId: string;
  followUpStatus: ContactFollowUpStatus;
  followUpMode?: FollowUpMode;
  channels: ChannelSelection[];
};

export type ClientSelection = {
  clientId: string;
  ownerId: string;
  clientPriority?: Priority;
  followUpStatus?: ClientFollowUpStatus;
  contacts: ContactSelection[];
};

export type ScheduleRequest = {
  preferredStartDate: string;
  latestDate?: string;
  maxHorizonDays?: number;
  /** Clock used for same-day alignment; defaults to real now. */
  now?: string | Date;
  /**
   * Test mode: schedule from now every 5 minutes on the same ET day,
   * ignoring work window, holidays, Daily Max, and client-per-day limits.
   */
  testMode?: boolean;
  creationMethod: CreationMethod;
  clients: ClientSelection[];
};

export type ExistingTask = {
  clientId: string;
  contactId?: string;
  channel: Channel;
  scheduledAt: string;
  status: TaskStatus;
};

export type ScheduleSnapshot = {
  dailyMax: Partial<Record<Channel, number>>;
  /** Minutes between same-channel sends; missing/invalid → 5. */
  timeInterval?: Partial<Record<Channel, number>>;
  existingTasks: ExistingTask[];
};

export type ScheduleInput = {
  request: ScheduleRequest;
  snapshot: ScheduleSnapshot;
};

export type ScheduledTask = {
  clientId: string;
  contactId: string;
  channel: Channel;
  ownerId: string;
  scheduledAt: string;
  priority: Priority;
  creationMethod: CreationMethod;
  templateId?: string;
  taskStatus: "Pending";
  notes?: string;
};

export type NeedsReviewItem = {
  scope: "client" | "contact";
  clientId: string;
  contactId?: string;
  channels?: Channel[];
  code: ReviewCode;
  reason: string;
};

export type UnscheduledItem = {
  clientId: string;
  contactId: string;
  channel: Channel;
  ownerId: string;
  priority: Priority;
  creationMethod: CreationMethod;
  templateId?: string;
  code: UnscheduledCode;
  reason: string;
};

export type CapacityUsage = {
  date: string;
  channel: Channel;
  dailyMax: number;
  allocated: number;
  available: number;
};

export type SchedulePlan = {
  scheduled: ScheduledTask[];
  needsReview: NeedsReviewItem[];
  unscheduled: UnscheduledItem[];
  usage: CapacityUsage[];
};

export type TaskWrite = {
  followUpContactId: string;
  ownerId: string;
  creationMethod: CreationMethod;
  templateId?: string;
  scheduledAt: string;
  priority: Priority;
  channel: Channel;
  taskStatus: "Pending";
  notes?: string;
};

export type CommitResult = SchedulePlan & {
  writes: TaskWrite[];
};

export type Candidate = {
  sourceIndex: number;
  clientId: string;
  contactId: string;
  channel: Channel;
  ownerId: string;
  clientPriority: Priority;
  priority: Priority;
  creationMethod: CreationMethod;
  templateId?: string;
};
