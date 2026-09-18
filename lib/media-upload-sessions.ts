import type { MediaKind } from "./media-attachments";
import { MEDIA_UPLOAD_CHUNK_BYTES, putObjectToS3, type MediaObjectPlan } from "./s3-media";

export type MediaUploadSession = MediaObjectPlan & {
  mimeType: string;
  name: string;
  size: number;
  totalChunks: number;
  chunks: Array<Uint8Array | null>;
  received: number;
  createdAt: number;
};

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, MediaUploadSession>();

function sweepExpired(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

export function createMediaUploadSession(input: {
  plan: MediaObjectPlan;
  mimeType: string;
  name: string;
  size: number;
}) {
  sweepExpired();
  const totalChunks = Math.max(1, Math.ceil(input.size / MEDIA_UPLOAD_CHUNK_BYTES));
  const session: MediaUploadSession = {
    ...input.plan,
    mimeType: input.mimeType,
    name: input.name,
    size: input.size,
    totalChunks,
    chunks: Array.from({ length: totalChunks }, () => null),
    received: 0,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getMediaUploadSession(id: string) {
  sweepExpired();
  return sessions.get(id) || null;
}

export async function receiveMediaUploadChunk(input: {
  uploadId: string;
  index: number;
  total: number;
  bytes: Uint8Array;
}) {
  const session = getMediaUploadSession(input.uploadId);
  if (!session) throw new Error("Upload session not found or expired");
  if (input.total !== session.totalChunks) throw new Error("Chunk total mismatch");
  if (input.index < 0 || input.index >= session.totalChunks) throw new Error("Invalid chunk index");
  if (input.bytes.byteLength <= 0) throw new Error("Empty chunk");
  if (input.bytes.byteLength > MEDIA_UPLOAD_CHUNK_BYTES + 1024) {
    throw new Error("Chunk too large");
  }
  if (!session.chunks[input.index]) {
    session.chunks[input.index] = input.bytes;
    session.received += 1;
  }

  if (session.received < session.totalChunks) {
    return { done: false as const, received: session.received, totalChunks: session.totalChunks };
  }

  const missing = session.chunks.findIndex((chunk) => !chunk);
  if (missing >= 0) throw new Error(`Missing chunk ${missing}`);

  const parts = session.chunks as Uint8Array[];
  const totalSize = parts.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const assembled = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of parts) {
    assembled.set(chunk, offset);
    offset += chunk.byteLength;
  }

  await putObjectToS3({ key: session.key, mimeType: session.mimeType, bytes: assembled });
  sessions.delete(session.id);
  return {
    done: true as const,
    id: session.id,
    kind: session.mediaType,
    name: session.name,
    mimeType: session.mimeType,
    size: totalSize,
    url: session.mediaUrl,
    mediaUrl: session.mediaUrl,
    mediaType: session.mediaType,
  };
}
