import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { receiveMediaUploadChunk } from "@/lib/media-upload-sessions";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const url = new URL(request.url);
    const index = Number(url.searchParams.get("index"));
    const total = Number(url.searchParams.get("total"));
    if (!Number.isInteger(index) || !Number.isInteger(total)) {
      return Response.json({ error: "index and total are required" }, { status: 400 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await receiveMediaUploadChunk({
      uploadId: id,
      index,
      total,
      bytes,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload chunk failed";
    const status = /not found|expired|mismatch|Invalid|Empty|too large/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
