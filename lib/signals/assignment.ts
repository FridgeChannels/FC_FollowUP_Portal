import type { BrandViewer } from "../brand-access";

export const ADMIN_SIGNALS_ACCOUNT = "billy@fridgechannels.com";

type OwnerLookup = (email: string) => Promise<{ id: string } | null>;

/** Admin's Signals feed follows Billy's brand assignments. Read state stays with the signed-in viewer. */
export async function resolveSignalsAssignment(
  viewer: BrandViewer,
  lookupOwner?: OwnerLookup,
): Promise<Pick<BrandViewer, "ownerId" | "email">> {
  if (!viewer.isAdmin) return { ownerId: viewer.ownerId, email: viewer.email };
  const findOwner = lookupOwner || (await import("../notion/owners")).findOwnerByAccount;
  const owner = await findOwner(ADMIN_SIGNALS_ACCOUNT);
  return { ownerId: owner?.id || null, email: ADMIN_SIGNALS_ACCOUNT };
}
