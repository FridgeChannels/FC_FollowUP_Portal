import { readSessionFromRequest } from "./auth-session";
import { resolveBrandViewer } from "./brand-access";

export async function viewerFromRequest(request: Request) {
  const session = readSessionFromRequest(request);
  return resolveBrandViewer({ email: session?.email });
}
