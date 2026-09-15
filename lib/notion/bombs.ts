import {
  currentCpOption,
  parseApplicableCp,
  type CurrentCpOption,
} from "../brand-list";
import { filterApplicableCheckpoints, listCheckpoints, resolveCheckpoint } from "./cps";
import {
  BOMB_TARGET_ROLES,
  isBombChannel,
  orderedBombChannels,
  type BombCpRef,
  type BombDetail,
  type BombListItem,
  type BombScenario,
  type BombTemplateItem,
  type BombTemplateInput,
  type CreateBombInput,
  type UpdateBombInput,
  BOMB_STATUSES,
} from "../bomb-list";
import {
  createPage,
  firstRelationId,
  propertyText,
  queryDatabasePages,
  relationIds,
  retrievePage,
  richText,
  titleFromProperties,
  updatePage,
  type NotionPage,
} from "./client";
import {
  getFollowupBombDbId,
  getFollowupScenarioDbId,
  getFollowupTemplateDbId,
} from "./config";

function titleMap(pages: NotionPage[]) {
  return new Map(
    pages.map((page) => [page.id, titleFromProperties(page.properties)]),
  );
}

function mapTemplate(page: NotionPage): BombTemplateItem {
  const properties = page.properties || {};
  return {
    id: page.id,
    name: titleFromProperties(properties),
    channel: propertyText(properties.Channel) || null,
    templateType: propertyText(properties.Type) || propertyText(properties["Template Type"]) || null,
    subject: propertyText(properties["Subject Template"]) || null,
    content: propertyText(properties["Content Template"]),
    status: propertyText(properties["Template Status"]) || null,
  };
}

function templatesForBomb(
  page: NotionPage,
  templates: Map<string, BombTemplateItem>,
) {
  return relationIds(page.properties?.Templates)
    .map((id) => templates.get(id))
    .filter((item): item is BombTemplateItem => !!item);
}

function bombCpCode(properties: NotionPage["properties"]) {
  return parseApplicableCp(propertyText(properties?.CP) || propertyText(properties?.["Applicable CP"]));
}

function bombCpWrite(checkpoint: CurrentCpOption | null) {
  return checkpoint ? { relation: [{ id: checkpoint.id }] } : { relation: [] };
}

async function resolveBombCheckpoint(cpIds: string[] = []) {
  for (const value of cpIds) {
    const checkpoint = await resolveCheckpoint(value);
    if (checkpoint && checkpoint.name !== "NONE") return checkpoint;
  }
  return null;
}

async function bombCpRefFromPage(properties: NotionPage["properties"]): Promise<BombCpRef | null> {
  const relationId = firstRelationId(properties?.CP) || firstRelationId(properties?.["Applicable CP"]);
  const code = bombCpCode(properties);
  const checkpoint = await resolveCheckpoint(relationId || code);
  if (!checkpoint || checkpoint.name === "NONE") {
    if (!code) return null;
    const option = currentCpOption(code);
    return { id: option.id, name: option.name, fullName: option.fullName };
  }
  return { id: checkpoint.id, name: checkpoint.name, fullName: checkpoint.fullName };
}

function bombStatus(properties: NotionPage["properties"]) {
  return (
    propertyText(properties?.["OmniReach Status"]) ||
    propertyText(properties?.["Bomb Status"]) ||
    "Draft"
  );
}

function mapBombPage(
  page: NotionPage,
  titles: Map<string, string>,
  templates: BombTemplateItem[],
  checkpoints: Map<string, CurrentCpOption> = new Map(),
): BombListItem {
  const properties = page.properties || {};
  const relationId = firstRelationId(properties.CP) || firstRelationId(properties["Applicable CP"]);
  const checkpoint = relationId ? checkpoints.get(relationId) : null;
  const cp = checkpoint?.name || bombCpCode(properties);
  const scenarioId = firstRelationId(properties.Scenario);

  return {
    id: page.id,
    name: titleFromProperties(properties) || "Untitled OmniReach",
    goal: propertyText(properties.Goal),
    status: bombStatus(properties),
    priority: propertyText(properties.Priority) || null,
    targetRole: propertyText(properties["Target Role"]) || null,
    cp,
    cpIds: relationId ? [relationId] : cp ? [cp] : [],
    scenarioId: scenarioId || null,
    scenarioName: (scenarioId && titles.get(scenarioId)) || null,
    channels: orderedBombChannels(
      templates.map((item) => item.channel).filter((item): item is string => !!item),
    ),
    templateCount: templates.length,
    lastEditedAt:
      page.last_edited_time || properties["Last Edited At"]?.last_edited_time || null,
  };
}

export async function listFollowupBombsCatalog() {
  const [bombPages, templatePages, scenarioPages, checkpoints] = await Promise.all([
    queryDatabasePages(getFollowupBombDbId()),
    queryDatabasePages(getFollowupTemplateDbId()),
    queryDatabasePages(getFollowupScenarioDbId()),
    listCheckpoints(),
  ]);
  const titles = titleMap(scenarioPages);
  const templates = new Map(templatePages.map((page) => [page.id, mapTemplate(page)]));
  const checkpointById = new Map(checkpoints.map((item) => [item.id, item]));

  return {
    bombs: bombPages
      .map((page) => mapBombPage(page, titles, templatesForBomb(page, templates), checkpointById))
      .sort((a, b) => a.name.localeCompare(b.name)),
    scenarios: scenarioPages.map(mapScenario).sort((a, b) => a.name.localeCompare(b.name)),
    cps: filterApplicableCheckpoints(checkpoints),
  };
}

export async function listFollowupBombs() {
  return (await listFollowupBombsCatalog()).bombs;
}

export async function retrieveFollowupBomb(id: string): Promise<BombDetail> {
  const page = await retrievePage(id);
  const properties = page.properties || {};
  const scenarioId = firstRelationId(properties.Scenario);
  const templateIds = relationIds(properties.Templates);
  const [scenarioPage, templatePages] = await Promise.all([
    scenarioId ? retrievePage(scenarioId).catch(() => null) : Promise.resolve(null),
    Promise.all(templateIds.map((pageId) => retrievePage(pageId).catch(() => null))),
  ]);

  const titles = new Map<string, string>();
  const cps = [await bombCpRefFromPage(properties)].filter(
    (item): item is BombCpRef => !!item,
  );
  if (scenarioPage) {
    titles.set(scenarioPage.id, titleFromProperties(scenarioPage.properties));
  }
  const templates = new Map(
    templatePages
      .filter((item): item is NotionPage => !!item)
      .map((item) => [item.id, mapTemplate(item)]),
  );
  const orderedTemplates = templateIds
    .map((pageId) => templates.get(pageId))
    .filter((item): item is BombTemplateItem => !!item);

  const mapped = mapBombPage(page, titles, orderedTemplates);
  return {
    ...mapped,
    cp: cps[0]?.name || mapped.cp,
    cpIds: cps[0] ? [cps[0].id] : mapped.cpIds,
    notes: propertyText(properties.Notes) || null,
    createdAt: page.created_time || properties["Created At"]?.created_time || null,
    scenarioDescription: scenarioPage
      ? propertyText(scenarioPage.properties?.["Scenario Description"]) || null
      : null,
    cps,
    templates: orderedTemplates,
  };
}

function mapScenario(page: NotionPage): BombScenario {
  const properties = page.properties || {};
  return {
    id: page.id,
    name: titleFromProperties(properties) || "Untitled Scenario",
    description: propertyText(properties["Scenario Description"]),
  };
}

export async function listFollowupScenarios() {
  const pages = await queryDatabasePages(getFollowupScenarioDbId());
  return pages.map(mapScenario).sort((a, b) => a.name.localeCompare(b.name));
}

function templateProperties(bombId: string, bombName: string, input: BombTemplateInput) {
  const channel = input.channel.trim();
  if (!isBombChannel(channel)) throw new Error("Invalid template channel");
  const phone = channel === "Phone";
  const name = input.name?.trim() || `${bombName} · ${channel}`;
  return {
    Name: { title: richText(name) },
    Channel: { select: { name: channel } },
    Type: { select: { name: phone ? "Call Script" : "Message" } },
    "Subject Template": { rich_text: !phone && input.subject?.trim() ? richText(input.subject.trim()) : [] },
    "Content Template": { rich_text: input.content.trim() ? richText(input.content.trim()) : [] },
    OmniReach: { relation: [{ id: bombId }] },
  };
}

async function createBombTemplate(
  bombId: string,
  bombName: string,
  input: BombTemplateInput,
) {
  return createPage(getFollowupTemplateDbId(), templateProperties(bombId, bombName, input));
}

export async function createFollowupBomb(input: CreateBombInput) {
  const name = input.name.trim();
  if (!name) throw new Error("OmniReach name is required");
  const targetRole = input.targetRole?.trim() || null;
  if (targetRole && !(BOMB_TARGET_ROLES as readonly string[]).includes(targetRole)) {
    throw new Error("Invalid Target Role");
  }
  const scenarioId = input.scenarioId?.trim() || null;
  if (scenarioId) {
    await retrievePage(scenarioId);
  }
  const checkpoint = await resolveBombCheckpoint(input.cpIds || []);
  const page = await createPage(getFollowupBombDbId(), {
    "OmniReach Name": { title: richText(name) },
    Goal: { rich_text: input.goal?.trim() ? richText(input.goal.trim()) : [] },
    Scenario: { relation: scenarioId ? [{ id: scenarioId }] : [] },
    ...(checkpoint ? { CP: bombCpWrite(checkpoint) } : {}),
    ...(targetRole ? { "Target Role": { select: { name: targetRole } } } : {}),
    "OmniReach Status": { status: { name: "Draft" } },
  });

  if (input.template?.content?.trim()) {
    await createBombTemplate(page.id, name, input.template);
  }

  return retrieveFollowupBomb(page.id);
}

export async function updateFollowupBomb(id: string, input: UpdateBombInput) {
  const current = await retrieveFollowupBomb(id);
  const name = input.name?.trim() || current.name;
  if (!name) throw new Error("OmniReach name is required");
  const properties: Record<string, unknown> = {};

  if (input.name !== undefined) properties["OmniReach Name"] = { title: richText(name) };
  if (input.goal !== undefined) {
    properties.Goal = { rich_text: input.goal?.trim() ? richText(input.goal.trim()) : [] };
  }
  if (input.scenarioId !== undefined) {
    if (input.scenarioId) await retrievePage(input.scenarioId);
    properties.Scenario = { relation: input.scenarioId ? [{ id: input.scenarioId }] : [] };
  }
  if (input.cpIds !== undefined) {
    const checkpoint = await resolveBombCheckpoint(input.cpIds);
    properties.CP = bombCpWrite(checkpoint);
  }
  if (input.targetRole !== undefined) {
    const targetRole = input.targetRole?.trim() || null;
    if (targetRole && !(BOMB_TARGET_ROLES as readonly string[]).includes(targetRole)) {
      throw new Error("Invalid Target Role");
    }
    properties["Target Role"] = targetRole ? { select: { name: targetRole } } : { select: null };
  }
  if (input.status !== undefined) {
    const status = input.status?.trim() || "";
    if (!(BOMB_STATUSES as readonly string[]).includes(status)) {
      throw new Error("Invalid OmniReach Status");
    }
    properties["OmniReach Status"] = { status: { name: status } };
  }

  if (input.templates) {
    const templateIds: string[] = [];
    for (const template of input.templates) {
      const payload = templateProperties(id, name, template);
      if (template.id) {
        await updatePage(template.id, payload);
        templateIds.push(template.id);
      } else {
        const created = await createPage(getFollowupTemplateDbId(), payload);
        templateIds.push(created.id);
      }
    }
    properties.Templates = { relation: templateIds.map((item) => ({ id: item })) };
  }

  if (!Object.keys(properties).length) throw new Error("No OmniReach fields to update");
  await updatePage(id, properties);
  return retrieveFollowupBomb(id);
}
