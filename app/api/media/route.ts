import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  mediaKindFromMime,
  validateMediaFile,
  type MediaKind,
} from "@/lib/media-attachments";
import { newMediaId, putStoredMedia } from "@/lib/media-store";
import { env } from "cloudflare:workers";

function mediaKindFromQuery(value?: string | null): MediaKind | null {
  return value === "video" ? "video" : value === "image" ? "image" : null;
}

export async function POST(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }
    const kind = mediaKindFromQuery(String(form.get("kind") || "")) || mediaKindFromMime(file.type);
    if (!kind) {
      return Response.json({ error: "Unsupported media type" }, { status: 400 });
    }
    const invalid = validateMediaFile(file, kind);
    if (invalid) {
      return Response.json({ error: invalid }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await putStoredMedia(
      {
        id: newMediaId(),
        name: file.name || (kind === "video" ? "video.mp4" : "image.jpg"),
        mimeType: file.type,
        size: bytes.byteLength,
        bytes,
      },
      env.BUCKET,
    );
    const origin = new URL(request.url).origin;
    return Response.json({
      id: stored.id,
      kind,
      name: stored.name,
      mimeType: stored.mimeType,
      size: stored.size,
      url: `${origin}/api/media/${stored.id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
