import type { Metadata } from "next";
import { isCpVisible } from "./cp-visibility.ts";
import { createSeedState } from "./outreach-domain";

export const APP_NAME = "Super FollowUP";
export const APP_DESCRIPTION =
  "CP-driven multi-channel outreach operations workspace.";

export type PageMeta = {
  title: string;
  description: string;
};

export type BrandListFilters = {
  q?: string;
  cp?: string;
  status?: string;
  owner?: string;
  ownerName?: string;
  empty?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  Unassigned: "Unassigned",
  Ready: "Ready",
  "In Progress": "In Progress",
  Paused: "Paused",
  Completed: "Completed",
  Terminated: "Terminated",
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function documentTitle(pageTitle: string) {
  return pageTitle.includes(APP_NAME)
    ? pageTitle
    : `${pageTitle} · ${APP_NAME}`;
}

export function toMetadata(page: PageMeta): Metadata {
  const title = documentTitle(page.title);
  return {
    title: page.title,
    description: page.description,
    openGraph: {
      title,
      description: page.description,
    },
  };
}

export function brandListMetadata(filters: BrandListFilters = {}): PageMeta {
  const crumbs = ["Brands"];
  const details: string[] = [];
  const query = filters.q?.trim();

  if (query) {
    crumbs.push(`“${query}”`);
    details.push(`search “${query}”`);
  }
  if (filters.cp && filters.cp !== "all" && isCpVisible(filters.cp)) {
    crumbs.push(filters.cp);
    details.push(filters.cp);
  }
  if (filters.status && filters.status !== "all") {
    const label = STATUS_LABELS[filters.status] || filters.status;
    crumbs.push(label);
    details.push(label.toLowerCase());
  }
  if (filters.owner === "unassigned") {
    crumbs.push("Unassigned");
    details.push("unassigned AccountManager");
  } else if (filters.owner && filters.owner !== "all") {
    const name = filters.ownerName || "Owner";
    crumbs.push(name);
    details.push(`AccountManager ${name}`);
  }
  if (filters.empty) crumbs.push("No matches");

  return {
    title: crumbs.join(" · "),
    description: filters.empty
      ? `No brands match the current filters${details.length ? ` (${details.join(", ")})` : ""}.`
      : details.length
        ? `Browse brands filtered by ${details.join(", ")}.`
        : "Browse every brand, CP stage, outreach status, and owner in Super FollowUP.",
  };
}

export function brandDetailMetadata(
  brand?: {
    name: string;
    cp: string;
    status: string;
    source?: string;
  } | null,
): PageMeta {
  if (!brand) {
    return {
      title: "Brand not found",
      description:
        "This brand is missing or you do not have access. Return to the Brands list.",
    };
  }
  return {
    title: [brand.name, isCpVisible(brand.cp) ? brand.cp : null, brand.status].filter(Boolean).join(" · "),
    description: `${brand.name}${isCpVisible(brand.cp) ? ` is in ${brand.cp} with status` : " has status"} ${brand.status}${brand.source ? `. Source: ${brand.source}` : ""}.`,
  };
}

export function workspaceMetadata(
  path: string[],
  query: Record<string, string | string[] | undefined> = {},
): Metadata {
  const [section, id] = path;
  if (section === "performance") {
    return toMetadata({ title: "Exhibition Performance", description: "Current exhibition and Account Manager performance from existing SFU records." });
  }
  if (section === "customers" && id && path[2]?.toLowerCase() === "sample") {
    return toMetadata({ title: "Sample", description: "Manage sample details and review tap activity." });
  }
  if (section === "customers" && id) {
    const seed = createSeedState();
    const brand = seed.customers.find((item) => item.id === id);
    return toMetadata(
      brandDetailMetadata(
        brand
          ? {
              name: brand.name,
              cp: brand.cp,
              status: brand.status,
              source: brand.source,
            }
          : null,
      ),
    );
  }
  if (section === "customers") {
    const owner = first(query.owner);
    const seed = createSeedState();
    return toMetadata(
      brandListMetadata({
        q: first(query.q),
        cp: first(query.cp),
        status: first(query.status),
        owner,
        ownerName:
          owner && owner !== "all" && owner !== "unassigned"
            ? seed.users.find((user) => user.id === owner)?.name
            : undefined,
      }),
    );
  }
  return toMetadata({ title: APP_NAME, description: APP_DESCRIPTION });
}
