import type { BrandListItem, BrandTask } from "./brand-list";
import type { PortalRole } from "./notion/owner-role";

export type BrandViewer = {
  isAdmin: boolean;
  role: PortalRole;
  email: string | null;
  ownerId: string | null;
  name: string | null;
};

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

/** Explicit accounts that may see `Is Test` brands even when Admin. */
const TEST_DATA_VIEWER_EMAILS = new Set(["peter@fridgechannels.com"]);

/**
 * Callers restricted to `Is Test` Phone tasks only (no production brands/tasks).
 * Used for staging / dial-flow QA accounts such as Test-Caller.
 */
const TEST_ONLY_VIEWER_EMAILS = new Set(["testcaller@fridgechannels.com"]);

/** True when the viewer may only access Is Test brands and their tasks. */
export function isTestOnlyViewer(
  viewer: Pick<BrandViewer, "email">,
) {
  const email = normalizeEmail(viewer.email);
  return Boolean(email && TEST_ONLY_VIEWER_EMAILS.has(email));
}

/**
 * Admin / Caller hide test brands by default.
 * AccountManager see them (still owner-scoped).
 * Allowlisted accounts (e.g. peter) always see them.
 * Test-only accounts (e.g. TestCaller) see test brands, but only those.
 */
export function canAccessTestBrands(
  viewer: Pick<BrandViewer, "isAdmin" | "role" | "email" | "name">,
) {
  if (isTestOnlyViewer(viewer)) return true;
  const email = normalizeEmail(viewer.email);
  if (email && TEST_DATA_VIEWER_EMAILS.has(email)) return true;
  if (viewer.name?.trim().toLowerCase() === "peter") return true;
  if (viewer.role === "AccountManager") return true;
  return false;
}

export async function resolveBrandViewer(input: {
  email?: string | null;
  name?: string | null;
}): Promise<BrandViewer> {
  const [{ findOwnerByAccount }, { isAdminRole }] = await Promise.all([
    import("./notion/owners"),
    import("./notion/owner-role"),
  ]);
  const email = normalizeEmail(input.email);
  const owner = await findOwnerByAccount(email);

  if (!owner || owner.status !== "Active") {
    return {
      isAdmin: false,
      role: "AccountManager",
      email,
      ownerId: null,
      name: input.name || null,
    };
  }

  return {
    isAdmin: isAdminRole(owner.role),
    role: owner.role,
    email,
    ownerId: owner.id,
    name: owner.name || input.name || null,
  };
}

export function canViewBrand(viewer: BrandViewer, brand: BrandListItem, tasks?: BrandTask[]) {
  if (isTestOnlyViewer(viewer)) {
    if (!brand.isTest) return false;
  } else if (brand.isTest && !canAccessTestBrands(viewer)) {
    return false;
  }
  if (viewer.isAdmin) return true;
  if (viewer.ownerId && brand.ownerId === viewer.ownerId) return true;
  if (viewer.email && brand.ownerEmail?.toLowerCase() === viewer.email) return true;
  if (tasks?.some((task) => canViewTask(viewer, task))) return true;
  return false;
}

export function canWriteBrand(viewer: BrandViewer, brand: BrandListItem) {
  if (isTestOnlyViewer(viewer)) {
    if (!brand.isTest) return false;
  } else if (brand.isTest && !canAccessTestBrands(viewer)) {
    return false;
  }
  if (viewer.role === "Caller") return false;
  if (viewer.isAdmin) return true;
  if (viewer.ownerId && brand.ownerId === viewer.ownerId) return true;
  if (viewer.email && brand.ownerEmail?.toLowerCase() === viewer.email) return true;
  return false;
}

export function canAssignBrandOwner(viewer: BrandViewer) {
  return viewer.isAdmin;
}

export function canViewTask(viewer: BrandViewer, task: BrandTask) {
  if (isTestOnlyViewer(viewer)) {
    if (!task.brandIsTest) return false;
  } else if (task.brandIsTest && !canAccessTestBrands(viewer)) {
    return false;
  }
  if (viewer.isAdmin) return true;
  if (viewer.role === "Caller") {
    return task.channel === "Phone";
  }
  if (viewer.ownerId && task.ownerId === viewer.ownerId) return true;
  if (viewer.ownerId && task.brandOwnerId === viewer.ownerId) return true;
  return false;
}

export function canWriteTask(viewer: BrandViewer, task: BrandTask) {
  return canViewTask(viewer, task);
}
