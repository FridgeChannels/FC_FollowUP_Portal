import { createHmac, createHash } from "node:crypto";
import type { MediaKind } from "./media-attachments.ts";

/** Keep each proxied chunk under vinext's ~1MB request body limit. */
export const MEDIA_UPLOAD_CHUNK_BYTES = 512 * 1024;

export type MediaObjectPlan = {
  id: string;
  key: string;
  mediaUrl: string;
  mediaType: MediaKind;
};

function envValue(name: string) {
  return (typeof process !== "undefined" ? process.env[name] : undefined)?.trim() || "";
}

export function s3Config() {
  const accessKeyId = envValue("AWS_ACCESS_KEY_ID");
  const secretAccessKey = envValue("AWS_SECRET_ACCESS_KEY");
  const region = envValue("AWS_DEFAULT_REGION") || "us-east-1";
  const bucket = envValue("S3_BUCKET");
  const imagePrefix = (envValue("S3_KEY_PREFIX") || "images").replace(/^\/+|\/+$/g, "");
  const videoPrefix = (envValue("S3_VIDEO_PREFIX") || "videos").replace(/^\/+|\/+$/g, "");
  const filePrefix = (envValue("S3_FILE_PREFIX") || "files").replace(/^\/+|\/+$/g, "");
  return { accessKeyId, secretAccessKey, region, bucket, imagePrefix, videoPrefix, filePrefix };
}

export function assertS3Configured() {
  const cfg = s3Config();
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new Error("S3 is not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET)");
  }
  return cfg;
}

function extensionFor(kind: MediaKind, mimeType: string, fileName?: string) {
  const fromName = fileName?.split(".").pop()?.trim().toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const mime = mimeType.toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/3gpp") return "3gp";
  if (mime === "application/pdf") return "pdf";
  if (kind === "video") return "mp4";
  if (kind === "file") return "bin";
  return "jpg";
}

export function publicS3ObjectUrl(bucket: string, region: string, key: string) {
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export function isAllowedS3MediaUrl(url: string) {
  const cfg = s3Config();
  if (!cfg.bucket) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const virtualHosted = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
    const virtualHostedNoRegion = `${cfg.bucket}.s3.amazonaws.com`;
    const pathStyle = `s3.${cfg.region}.amazonaws.com`;
    const pathStyleLegacy = "s3.amazonaws.com";
    if (parsed.hostname === virtualHosted || parsed.hostname === virtualHostedNoRegion) {
      return parsed.pathname.length > 1;
    }
    if (parsed.hostname === pathStyle || parsed.hostname === pathStyleLegacy) {
      return parsed.pathname === `/${cfg.bucket}` || parsed.pathname.startsWith(`/${cfg.bucket}/`);
    }
    return false;
  } catch {
    return false;
  }
}

function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function amzDateParts(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

export function createMediaObjectPlan(input: {
  kind: MediaKind;
  mimeType: string;
  fileName?: string;
}): MediaObjectPlan {
  const cfg = assertS3Configured();
  const prefix =
    input.kind === "video"
      ? cfg.videoPrefix
      : input.kind === "file"
        ? cfg.filePrefix
        : cfg.imagePrefix;
  const id = crypto.randomUUID().replace(/-/g, "");
  const ext = extensionFor(input.kind, input.mimeType, input.fileName);
  const key = `${prefix}/${id}.${ext}`;
  return {
    id,
    key,
    mediaUrl: publicS3ObjectUrl(cfg.bucket, cfg.region, key),
    mediaType: input.kind,
  };
}

/** Server-side PutObject (browser never talks to S3 — avoids CORS / fake-ip proxy failures). */
export async function putObjectToS3(input: {
  key: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const cfg = assertS3Configured();
  const host = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const canonicalUri = `/${input.key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
  const { amzDate, dateStamp } = amzDateParts();
  const payloadHash = sha256Hex(input.bytes);
  const contentLength = String(input.bytes.byteLength);
  const signedHeaders = "content-length;content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders =
    `content-length:${contentLength}\n` +
    `content-type:${input.mimeType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), cfg.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "Content-Type": input.mimeType,
      "Content-Length": contentLength,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
    body: input.bytes,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(detail || `S3 PutObject failed (${response.status})`);
  }
  return {
    mediaUrl: publicS3ObjectUrl(cfg.bucket, cfg.region, input.key),
  };
}
