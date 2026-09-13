import {
  BOMB_PRIORITIES,
  BOMB_TARGET_ROLES,
  isBombChannel,
  orderedBombChannels,
  type BombCpRef,
  type BombDetail,
  type BombListItem,
  type BombScenario,
  type BombTemplateItem,
  type CreateBombInput,
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
  type NotionPage,
} from "./client";
import {
  getFollowupBombDbId,
  getFollowupCpDbId,
  getFollowupScenarioDbId,
  getFollowupTemplateDbId,
} from "./config";
import { listCurrentCps } from "./cps";

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
    templateType: propertyText(properties["Template Type"]) || null,
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

function mapBombPage(
  page: NotionPage,
  titles: Map<string, string>,
  templates: BombTemplateItem[],
): BombListItem {
  const properties = page.properties || {};
  const cpIds = relationIds(properties["Applicable CP"]);
  const scenarioId = firstRelationId(properties.Scenario);

  return {
    id: page.id,
    name: titleFromProperties(properties) || "Untitled Bomb",
    goal: propertyText(properties.Goal),
    status: propertyText(properties["Bomb Status"]) || "Draft",
    priority: propertyText(properties.Priority) || null,
    targetRole: propertyText(properties["Target Role"]) || null,
    cp: cpIds.map((id) => titles.get(id) || "").filter(Boolean).join(", ") || null,
    cpIds,
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

export async function listFollowupBombs() {
  const [bombPages, templatePages, scenarioPages, cpPages] = await Promise.all([
    queryDatabasePages(getFollowupBombDbId()),
    queryDatabasePages(getFollowupTemplateDbId()),
    queryDatabasePages(getFollowupScenarioDbId()),
    queryDatabasePages(getFollowupCpDbId()),
  ]);
  const titles = new Map([
    ...titleMap(scenarioPages),
    ...titleMap(cpPages),
  ]);
  const templates = new Map(templatePages.map((page) => [page.id, mapTemplate(page)]));

  return bombPages
    .map((page) => mapBombPage(page, titles, templatesForBomb(page, templates)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapCpRef(page: NotionPage): BombCpRef {
  const properties = page.properties || {};
  return {
    id: page.id,
    name: titleFromProperties(properties),
    fullName: propertyText(properties["Full Name"]) || null,
  };
}

export async function retrieveFollowupBomb(id: string): Promise<BombDetail> {
  const page = await retrievePage(id);
  const properties = page.properties || {};
  const cpIds = relationIds(properties["Applicable CP"]);
  const scenarioId = firstRelationId(properties.Scenario);
  const templateIds = relationIds(properties.Templates);
  const [cpPages, scenarioPage, templatePages] = await Promise.all([
    Promise.all(cpIds.map((pageId) => retrievePage(pageId).catch(() => null))),
    scenarioId ? retrievePage(scenarioId).catch(() => null) : Promise.resolve(null),
    Promise.all(templateIds.map((pageId) => retrievePage(pageId).catch(() => null))),
  ]);

  const titles = new Map<string, string>();
  const cps = cpPages
    .filter((item): item is NotionPage => !!item)
    .map((item) => {
      const cp = mapCpRef(item);
      titles.set(cp.id, cp.name);
      return cp;
    });
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

  return {
    ...mapBombPage(page, titles, orderedTemplates),
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

async function createBombTemplate(bombId: string, bombName: string, input: NonNullable<CreateBombInput["template"]>) {
  const channel = input.channel.trim();
  if (!isBombChannel(channel)) throw new Error("Invalid template channel");
  const content = input.content.trim();
  if (!content) throw new Error("Template content is required");
  const name = input.name?.trim() || `${bombName} · ${channel}`;
  const phone = channel === "Phone";
  return createPage(getFollowupTemplateDbId(), {
    "Template Name": { title: richText(name) },
    Channel: { select: { name: channel } },
    "Template Type": { select: { name: phone ? "Call Script" : "Message" } },
    "Subject Template": { rich_text: !phone && input.subject?.trim() ? richText(input.subject.trim()) : [] },
    "Content Template": { rich_text: richText(content) },
    "Template Status": { status: { name: "Draft" } },
    Bombs: { relation: [{ id: bombId }] },
  });
}

export async function createFollowupBomb(input: CreateBombInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Bomb name is required");
  const targetRole = input.targetRole?.trim() || null;
  if (targetRole && !(BOMB_TARGET_ROLES as readonly string[]).includes(targetRole)) {
    throw new Error("Invalid Target Role");
  }
  const priority = input.priority?.trim() || "P1";
  if (!(BOMB_PRIORITIES as readonly string[]).includes(priority)) {
    throw new Error("Invalid Priority");
  }
  const scenarioId = input.scenarioId?.trim() || null;
  if (scenarioId) {
    await retrievePage(scenarioId);
  }
  const cpIds = [...new Set((input.cpIds || []).map((id) => id.trim()).filter(Boolean))];
  if (cpIds.length) {
    const cps = await listCurrentCps();
    if (cpIds.some((id) => !cps.some((item) => item.id === id))) {
      throw new Error("Unknown Applicable CP");
    }
  }
  const page = await createPage(getFollowupBombDbId(), {
    Bomb: { title: richText(name) },
    Goal: { rich_text: input.goal?.trim() ? richText(input.goal.trim()) : [] },
    Scenario: { relation: scenarioId ? [{ id: scenarioId }] : [] },
    "Applicable CP": { relation: cpIds.map((id) => ({ id })) },
    ...(targetRole ? { "Target Role": { select: { name: targetRole } } } : {}),
    Priority: { select: { name: priority } },
    "Bomb Status": { status: { name: "Draft" } },
    Notes: { rich_text: input.notes?.trim() ? richText(input.notes.trim()) : [] },
  });

  if (input.template?.content?.trim()) {
    await createBombTemplate(page.id, name, input.template);
  }

  return retrieveFollowupBomb(page.id);
}
