import {
  applicableCpSelect,
  currentCpOption,
  parseApplicableCp,
  resolveApplicableCp,
} from "../brand-list";
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

function bombCpCode(properties: NotionPage["properties"]) {
  return parseApplicableCp(propertyText(properties?.CP) || propertyText(properties?.["Applicable CP"]));
}

function bombCpRef(code: string | null | undefined): BombCpRef | null {
  const parsed = parseApplicableCp(code);
  if (!parsed) return null;
  const option = currentCpOption(parsed);
  return { id: option.id, name: option.name, fullName: option.fullName };
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
): BombListItem {
  const properties = page.properties || {};
  const cp = bombCpCode(properties);
  const scenarioId = firstRelationId(properties.Scenario);

  return {
    id: page.id,
    name: titleFromProperties(properties) || "Untitled OmniReach",
    goal: propertyText(properties.Goal),
    status: bombStatus(properties),
    priority: propertyText(properties.Priority) || null,
    targetRole: propertyText(properties["Target Role"]) || null,
    cp,
    cpIds: cp ? [cp] : [],
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
  const [bombPages, templatePages, scenarioPages] = await Promise.all([
    queryDatabasePages(getFollowupBombDbId()),
    queryDatabasePages(getFollowupTemplateDbId()),
    queryDatabasePages(getFollowupScenarioDbId()),
  ]);
  const titles = titleMap(scenarioPages);
  const templates = new Map(templatePages.map((page) => [page.id, mapTemplate(page)]));

  return bombPages
    .map((page) => mapBombPage(page, titles, templatesForBomb(page, templates)))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const cps = [bombCpRef(bombCpCode(properties))].filter(
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

function templateProperties(bombId: string, bombName: string, input: BombTemplateInput, status: string) {
  const channel = input.channel.trim();
  if (!isBombChannel(channel)) throw new Error("Invalid template channel");
  const phone = channel === "Phone";
  const name = input.name?.trim() || `${bombName} · ${channel}`;
  return {
    "Template Name": { title: richText(name) },
    Channel: { select: { name: channel } },
    "Template Type": { select: { name: phone ? "Call Script" : "Message" } },
    "Subject Template": { rich_text: !phone && input.subject?.trim() ? richText(input.subject.trim()) : [] },
    "Content Template": { rich_text: input.content.trim() ? richText(input.content.trim()) : [] },
    "Template Status": { status: { name: status } },
    Bombs: { relation: [{ id: bombId }] },
  };
}

async function createBombTemplate(
  bombId: string,
  bombName: string,
  input: BombTemplateInput,
  status = "Draft",
) {
  return createPage(getFollowupTemplateDbId(), templateProperties(bombId, bombName, input, status));
}

export async function createFollowupBomb(input: CreateBombInput) {
  const name = input.name.trim();
  if (!name) throw new Error("OmniReach name is required");
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
  const cp = resolveApplicableCp(input.cpIds || []);
  const page = await createPage(getFollowupBombDbId(), {
    "OmniReach Name": { title: richText(name) },
    Goal: { rich_text: input.goal?.trim() ? richText(input.goal.trim()) : [] },
    Scenario: { relation: scenarioId ? [{ id: scenarioId }] : [] },
    ...(cp ? { CP: applicableCpSelect(cp) } : {}),
    ...(targetRole ? { "Target Role": { select: { name: targetRole } } } : {}),
    Priority: { select: { name: priority } },
    "OmniReach Status": { status: { name: "Draft" } },
    Notes: { rich_text: input.notes?.trim() ? richText(input.notes.trim()) : [] },
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
    const cp = resolveApplicableCp(input.cpIds);
    properties.CP = cp ? applicableCpSelect(cp) : { select: null };
  }
  if (input.targetRole !== undefined) {
    const targetRole = input.targetRole?.trim() || null;
    if (targetRole && !(BOMB_TARGET_ROLES as readonly string[]).includes(targetRole)) {
      throw new Error("Invalid Target Role");
    }
    properties["Target Role"] = targetRole ? { select: { name: targetRole } } : { select: null };
  }
  if (input.priority !== undefined) {
    const priority = input.priority?.trim() || null;
    if (priority && !(BOMB_PRIORITIES as readonly string[]).includes(priority)) {
      throw new Error("Invalid Priority");
    }
    properties.Priority = priority ? { select: { name: priority } } : { select: null };
  }
  if (input.notes !== undefined) {
    properties.Notes = { rich_text: input.notes?.trim() ? richText(input.notes.trim()) : [] };
  }
  if (input.status !== undefined) {
    const status = input.status?.trim() || "";
    if (!(BOMB_STATUSES as readonly string[]).includes(status)) {
      throw new Error("Invalid OmniReach Status");
    }
    properties["OmniReach Status"] = { status: { name: status } };
  }

  const templateStatus = (input.status || current.status) === "Active" ? "Active" : "Draft";
  if (input.templates) {
    const templateIds: string[] = [];
    for (const template of input.templates) {
      const payload = templateProperties(id, name, template, templateStatus);
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
