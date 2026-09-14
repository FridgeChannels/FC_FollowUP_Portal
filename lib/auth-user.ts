import { resolveBrandViewer } from "./brand-access";
import type { SessionUser } from "./auth-session";

export async function resolveSessionUser(email?: string | null): Promise<SessionUser | null> {
  const viewer = await resolveBrandViewer({ email });
  if (!viewer.email || !viewer.ownerId) return null;
  return {
    email: viewer.email,
    name: viewer.name,
    role: viewer.role,
  };
}
