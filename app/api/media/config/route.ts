import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { emailAttachmentConfig } from "@/lib/email-attachments";

export async function GET(request: Request) {
  const viewer = await viewerFromRequest(request);
  if (!viewer.email) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  return Response.json({
    email: emailAttachmentConfig(),
  });
}
