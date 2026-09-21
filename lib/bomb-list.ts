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

export function compactNotionId(id: string) {
  return id.replace(/-/g, "").toLowerCase();
}

export function sameNotionId(left?: string | null, right?: string | null) {
  return !!left && !!right && compactNotionId(left) === compactNotionId(right);
}

export function findByNotionId<T extends { id: string }>(items: T[], id?: string | null) {
  if (!id) return undefined;
  return items.find((item) => sameNotionId(item.id, id));
}

export function titleForNotionId(titles: Map<string, string>, id?: string | null) {
  if (!id) return null;
  return titles.get(id) || titles.get(compactNotionId(id)) || null;
}

export function setTitleForNotionId(titles: Map<string, string>, id: string, title: string) {
  titles.set(id, title);
  titles.set(compactNotionId(id), title);
}

export function attachBombScenario(bomb: BombDetail, scenarios: BombScenario[]): BombDetail {
  const match = findByNotionId(scenarios, bomb.scenarioId);
  if (!match) return bomb;
  return {
    ...bomb,
    scenarioId: match.id,
    scenarioName: bomb.scenarioName || match.name,
    scenarioDescription: bomb.scenarioDescription || match.description || null,
  };
}

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
