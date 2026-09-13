import { resolveBrandViewer } from "./brand-access";
import type { SessionUser } from "./auth-session";

export async function resolveSessionUser(email?: string | null): Promise<SessionUser | null> {
  const viewer = await resolveBrandViewer({ email });
  if (!viewer.email) return null;
  if (!viewer.ownerId) return null;
  return {
    email: viewer.email,
    name: viewer.name,
    role: viewer.isAdmin ? "Admin" : "FC_Owner",
  };
}
