/** `undefined` = all owners, `null` = Owner is empty, string = specific Owner page. */
export function ownerRelationFilter(ownerPageId?: string | null) {
  if (ownerPageId === undefined) return undefined;
  if (!ownerPageId) {
    return { property: "Owner", relation: { is_empty: true } };
  }
  return { property: "Owner", relation: { contains: ownerPageId } };
}

export function ownerPageIdFromQueryParam(
  isAdmin: boolean,
  viewerOwnerId: string | null | undefined,
  ownerParam?: string | null,
) {
  if (!isAdmin) return viewerOwnerId || undefined;
  const value = ownerParam?.trim();
  if (!value || value === "all") return undefined;
  if (value === "unassigned") return null;
  return value;
}
