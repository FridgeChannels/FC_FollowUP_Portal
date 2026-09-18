import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type StoredMedia = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
};

type MediaMeta = {
  name: string;
  mimeType: string;
  size: number;
};

const memory = new Map<string, StoredMedia>();

function mediaDir() {
  const fromEnv = typeof process !== "undefined" ? process.env.MEDIA_STORE_DIR : "";
  return fromEnv?.trim() || join(process.cwd(), ".data", "media");
}

function metaPath(id: string) {
  return join(mediaDir(), `${id}.json`);
}

function binPath(id: string) {
  return join(mediaDir(), id);
}

export function newMediaId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function isMediaId(value?: string | null) {
  return /^[a-zA-Z0-9]{16,64}$/.test(value || "");
}

export async function putStoredMedia(file: Omit<StoredMedia, "id"> & { id?: string }, bucket?: R2Bucket) {
  const id = file.id || newMediaId();
  const stored: StoredMedia = {
    id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    bytes: file.bytes,
  };
  memory.set(id, stored);
  if (bucket) {
    await bucket.put(id, stored.bytes, {
      httpMetadata: { contentType: stored.mimeType },
      customMetadata: { name: stored.name, mimeType: stored.mimeType, size: String(stored.size) },
    });
    return stored;
  }
  try {
    await mkdir(mediaDir(), { recursive: true });
    await writeFile(binPath(id), stored.bytes);
    await writeFile(metaPath(id), `${JSON.stringify({
      name: stored.name,
      mimeType: stored.mimeType,
      size: stored.size,
    } satisfies MediaMeta)}\n`);
  } catch (error) {
    console.error("Unable to persist media to disk; using in-process memory.", error);
  }
  return stored;
}

export async function getStoredMedia(id: string, bucket?: R2Bucket): Promise<StoredMedia | null> {
  if (!isMediaId(id)) return null;
  const cached = memory.get(id);
  if (cached) return cached;
  if (bucket) {
    const object = await bucket.get(id);
    if (!object) return null;
    const bytes = new Uint8Array(await object.arrayBuffer());
    const mimeType = object.httpMetadata?.contentType || object.customMetadata?.mimeType || "application/octet-stream";
    const name = object.customMetadata?.name || id;
    const size = Number(object.customMetadata?.size || bytes.byteLength);
    const stored = { id, name, mimeType, size, bytes };
    memory.set(id, stored);
    return stored;
  }
  try {
    const [bytes, metaRaw] = await Promise.all([
      readFile(binPath(id)),
      readFile(metaPath(id), "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as MediaMeta;
    const stored: StoredMedia = {
      id,
      name: meta.name || id,
      mimeType: meta.mimeType || "application/octet-stream",
      size: meta.size || bytes.byteLength,
      bytes,
    };
    memory.set(id, stored);
    return stored;
  } catch {
    return null;
  }
}
