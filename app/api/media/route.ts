import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  mediaKindFromMime,
  validateMediaFile,
  type MediaKind,
} from "@/lib/media-attachments";
import { createMediaUploadSession } from "@/lib/media-upload-sessions";
import { MEDIA_UPLOAD_CHUNK_BYTES, createMediaObjectPlan } from "@/lib/s3-media";

function mediaKindFromQuery(value?: string | null): MediaKind | null {
  return value === "video" ? "video" : value === "image" ? "image" : null;
}

/**
 * Start a same-origin chunked upload session. Browser never talks to S3 directly
 * (avoids CORS / local fake-ip proxy ERR_FAILED on PUT to Amazon).
 */
export async function POST(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const body = (await request.json()) as {
      kind?: string;
      mimeType?: string;
      fileName?: string;
      size?: number;
    };
    const mimeType = String(body.mimeType || "").trim();
    const fileName = String(body.fileName || "").trim() || undefined;
    const size = typeof body.size === "number" ? body.size : 0;
    const kind = mediaKindFromQuery(body.kind) || mediaKindFromMime(mimeType);
    if (!kind) {
      return Response.json({ error: "Unsupported media type" }, { status: 400 });
    }
    const invalid = validateMediaFile({ type: mimeType, size, name: fileName }, kind);
    if (invalid) {
      return Response.json({ error: invalid }, { status: 400 });
    }
    const name = fileName || (kind === "video" ? "video.mp4" : "image.jpg");
    const plan = createMediaObjectPlan({ kind, mimeType, fileName: name });
    const session = createMediaUploadSession({
      plan,
      mimeType,
      name,
      size,
    });
    return Response.json({
      uploadId: session.id,
      id: session.id,
      kind: session.mediaType,
      name: session.name,
      mimeType: session.mimeType,
      size: session.size,
      url: session.mediaUrl,
      mediaUrl: session.mediaUrl,
      mediaType: session.mediaType,
      chunkSize: MEDIA_UPLOAD_CHUNK_BYTES,
      totalChunks: session.totalChunks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
