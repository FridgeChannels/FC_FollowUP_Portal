export const PORTAL_ROLES = ["Admin", "FC_Owner", "Caller"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export function parseOwnerRole(value?: string | null): PortalRole | null {
  const raw = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!raw) return null;
  if (raw === "admin" || raw === "管理员") return "Admin";
  if (raw === "caller" || raw === "call") return "Caller";
  if (
    raw === "owner" ||
    raw === "fc_owner" ||
    raw === "fcowner" ||
    raw === "fc_owners"
  ) {
    return "FC_Owner";
  }
  return null;
}

export function ownerRoleFromRecord(value?: string | null): PortalRole {
  return parseOwnerRole(value) || "FC_Owner";
}

export function isAdminRole(role?: PortalRole | null) {
  return role === "Admin";
}
