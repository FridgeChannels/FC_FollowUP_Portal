import { getStoredMedia, isMediaId } from "@/lib/media-store";
import { env } from "cloudflare:workers";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isMediaId(id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const stored = await getStoredMedia(id, env.BUCKET);
  if (!stored) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const inline = new URL(request.url).searchParams.get("download") !== "1";
  return new Response(stored.bytes, {
    headers: {
      "Content-Type": stored.mimeType,
      "Content-Length": String(stored.bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(stored.name)}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
