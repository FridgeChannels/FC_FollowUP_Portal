import { viewerFromRequest } from "../brand-viewer-request";

/** Internal-device allowlisting is a shared self-service action for signed-in users. */
export async function requireInternalDeviceUser(request: Request) {
  const viewer = await viewerFromRequest(request);
  if (!viewer.email) {
    return {
      error: Response.json({ error: "Sign in required" }, { status: 401 }),
    };
  }
  return { viewer };
}
