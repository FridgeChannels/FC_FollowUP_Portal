export const BOMB_STATUSES = ["Active", "Draft", "Archived"] as const;
export const BOMB_CHANNELS = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"] as const;
export const BOMB_TARGET_ROLES = [
  "Connector",
  "Owner",
  "Decision Maker",
  "Influencer",
  "Operator",
  "Other",
] as const;
export const BOMB_PRIORITIES = ["P0", "P1", "P2"] as const;

export type BombStatus = (typeof BOMB_STATUSES)[number];
export type BombChannel = (typeof BOMB_CHANNELS)[number];

export type BombTemplateItem = {
  id: string;
  name: string;
  channel: string | null;
  templateType: string | null;
  subject: string | null;
  content: string;
  status: string | null;
};

export type BombCpRef = {
  id: string;
  name: string;
  fullName: string | null;
};

export type BombScenario = {
  id: string;
  name: string;
  description: string;
};

export type BombTemplateInput = {
  id?: string;
  channel: string;
  name?: string | null;
  subject?: string | null;
  content: string;
};

export type CreateBombInput = {
  name: string;
  goal?: string | null;
  scenarioId?: string | null;
  cpIds?: string[];
  targetRole?: string | null;
  priority?: string | null;
  notes?: string | null;
  template?: BombTemplateInput | null;
};

export type UpdateBombInput = {
  name?: string;
  goal?: string | null;
  scenarioId?: string | null;
  cpIds?: string[];
  targetRole?: string | null;
  priority?: string | null;
  notes?: string | null;
  status?: string | null;
  templates?: BombTemplateInput[];
};

export type BombListItem = {
  id: string;
  name: string;
  goal: string;
  status: string;
  priority: string | null;
  targetRole: string | null;
  cp: string | null;
  cpIds: string[];
  scenarioId: string | null;
  scenarioName: string | null;
  channels: string[];
  templateCount: number;
  lastEditedAt: string | null;
};

export type BombDetail = BombListItem & {
  notes: string | null;
  createdAt: string | null;
  scenarioDescription: string | null;
  cps: BombCpRef[];
  templates: BombTemplateItem[];
};

export function isBombChannel(value: string | null | undefined): value is BombChannel {
  return !!value && (BOMB_CHANNELS as readonly string[]).includes(value);
}

export function orderedBombChannels(channels: string[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const channel of BOMB_CHANNELS) {
    if (channels.includes(channel)) {
      ordered.push(channel);
      seen.add(channel);
    }
  }
  for (const channel of channels) {
    if (channel && !seen.has(channel)) {
      ordered.push(channel);
      seen.add(channel);
    }
  }
  return ordered;
}
