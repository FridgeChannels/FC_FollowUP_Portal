import { resolveBrandViewer } from "./brand-access";
import type { SessionUser } from "./auth-session";
import { getCallerEmails } from "./notion/config";

export async function resolveSessionUser(email?: string | null): Promise<SessionUser | null> {
  const viewer = await resolveBrandViewer({ email });
  if (!viewer.email) return null;
  const listedCaller = getCallerEmails().has(viewer.email);
  if (!viewer.ownerId && !listedCaller) return null;
  return {
    email: viewer.email,
    name: viewer.name,
    role: viewer.isAdmin ? "Admin" : listedCaller ? "Caller" : viewer.role,
  };
}
