import type { BrandListItem, BrandTask } from "./brand-list";
import { getAdminEmails } from "./notion/config";
import { findOwnerByAccount } from "./notion/owners";

export type BrandViewer = {
  isAdmin: boolean;
  email: string | null;
  ownerId: string | null;
  name: string | null;
};

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export async function resolveBrandViewer(input: {
  email?: string | null;
  name?: string | null;
}): Promise<BrandViewer> {
  const email = normalizeEmail(input.email);
  const owner = await findOwnerByAccount(email);
  const isAdmin =
    owner?.isAdmin === true || (!!email && getAdminEmails().has(email));

  if (!owner || owner.status !== "Active") {
    return {
      isAdmin: false,
      email,
      ownerId: null,
      name: input.name || null,
    };
  }

  return {
    isAdmin,
    email,
    ownerId: owner.id,
    name: owner.name || input.name || null,
  };
}

export function canViewBrand(viewer: BrandViewer, brand: BrandListItem) {
  if (viewer.isAdmin) return true;
  if (viewer.ownerId && brand.ownerId === viewer.ownerId) return true;
  if (viewer.email && brand.ownerEmail?.toLowerCase() === viewer.email) return true;
  return false;
}

export function canWriteBrand(viewer: BrandViewer, brand: BrandListItem) {
  return canViewBrand(viewer, brand);
}

export function canAssignBrandOwner(viewer: BrandViewer) {
  return viewer.isAdmin;
}

export function canViewTask(viewer: BrandViewer, task: BrandTask) {
  if (viewer.isAdmin) return true;
  if (viewer.ownerId && task.ownerId === viewer.ownerId) return true;
  if (viewer.ownerId && task.brandOwnerId === viewer.ownerId) return true;
  return false;
}

export function canWriteTask(viewer: BrandViewer, task: BrandTask) {
  return canViewTask(viewer, task);
}
