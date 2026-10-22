import { createHmac, timingSafeEqual } from "node:crypto";

export const SLACK_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

/** Verify `X-Slack-Signature` per https://api.slack.com/authentication/verifying-requests-from-slack */
export function verifySlackSignature(input: {
  body: string;
  headers: Headers;
  signingSecret: string;
  now?: number;
}) {
  const secret = input.signingSecret.trim();
  const timestamp = input.headers.get("x-slack-request-timestamp") || "";
  const signature = input.headers.get("x-slack-signature") || "";
  if (!secret || !timestamp || !signature.startsWith("v0=")) return false;

  const ts = Number(timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SLACK_SIGNATURE_MAX_AGE_SECONDS) return false;

  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${input.body}`, "utf8").digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
