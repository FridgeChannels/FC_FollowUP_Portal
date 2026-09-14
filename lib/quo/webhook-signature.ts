import { createHmac, timingSafeEqual } from "node:crypto";

export const QUO_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;

function header(headers: Headers, name: string) {
  return headers.get(name);
}

function timingEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function normalizeBase64(value: string) {
  const padded = value.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  const remainder = padded.length % 4;
  return remainder ? `${padded}${"=".repeat(4 - remainder)}` : padded;
}

function secretMaterial(secret: string) {
  return secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
}

function hmacBase64(key: Buffer, message: string) {
  return createHmac("sha256", key).update(message, "utf8").digest("base64");
}

function signatureMatches(provided: string, expected: string) {
  return timingEqual(normalizeBase64(provided), normalizeBase64(expected));
}

function legacyKeys(secret: string) {
  const material = secretMaterial(secret);
  const decoded = Buffer.from(material, "base64");
  return [
    decoded,
    Buffer.from(decoded.toString("binary"), "utf8"),
    Buffer.from(material, "utf8"),
    Buffer.from(secret, "utf8"),
  ];
}

function legacyMessages(timestamp: string, body: string) {
  const messages = [`${timestamp}.${body}`, `${timestamp}.${body.replace(/\s/g, "")}`];
  try {
    const serialized = JSON.stringify(JSON.parse(body));
    messages.push(`${timestamp}.${serialized}`);
    messages.push(`${timestamp}.${serialized.replace(/\s/g, "")}`);
  } catch {
    // Keep the raw-body variants when the payload is not JSON.
  }
  return [...new Set(messages)];
}

function parseOpenPhoneSignature(value: string | null) {
  if (!value) return null;
  const fields = value.split(";").map((field) => field.trim());
  const scheme = (fields[0] || "").toLowerCase();
  const version = fields[1] || "";
  const timestamp = fields[2] || "";
  const signature = fields.slice(3).join(";").replace(/\s/g, "");
  if (scheme !== "hmac" || version !== "1" || !timestamp || !signature) {
    return {
      ok: false as const,
      fieldCount: fields.length,
      scheme,
      version,
      hasTimestamp: !!timestamp,
      signatureChars: signature.length,
    };
  }
  return {
    ok: true as const,
    fieldCount: fields.length,
    scheme,
    version,
    timestamp,
    signature,
    signatureChars: signature.length,
  };
}

function standardSignatures(headerValue: string) {
  return headerValue
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const separator = entry.indexOf(",");
      if (separator <= 0) return [];
      const version = entry.slice(0, separator);
      const signature = entry.slice(separator + 1);
      return version === "v1" && signature ? [signature] : [];
    });
}

function verifyStandardWebhook(
  body: string,
  headers: Headers,
  secrets: string[],
  now: number,
) {
  const webhookId = header(headers, "webhook-id");
  const webhookTimestamp = header(headers, "webhook-timestamp");
  const webhookSignature = header(headers, "webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;
  const timestamp = Number(webhookTimestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > QUO_WEBHOOK_MAX_AGE_SECONDS) {
    return false;
  }
  const provided = standardSignatures(webhookSignature);
  if (!provided.length) return false;
  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
  return secrets.some((secret) => {
    const expected = hmacBase64(Buffer.from(secretMaterial(secret), "base64"), signedContent);
    return provided.some((signature) => signatureMatches(signature, expected));
  });
}

function verifyLegacyOpenPhone(body: string, headers: Headers, secrets: string[]) {
  const parsed = parseOpenPhoneSignature(
    header(headers, "openphone-signature") || header(headers, "OpenPhone-Signature"),
  );
  if (!parsed?.ok) return false;
  const messages = legacyMessages(parsed.timestamp, body);
  return secrets.some((secret) =>
    legacyKeys(secret).some((key) =>
      messages.some((message) => signatureMatches(parsed.signature, hmacBase64(key, message))),
    ),
  );
}

export async function verifyQuoWebhookSignature(input: {
  body: string;
  headers: Headers;
  secrets: string[];
  now?: number;
  allowUnsigned?: boolean;
}) {
  const { body, headers, secrets } = input;
  if (!secrets.length) return input.allowUnsigned === true;
  if (verifyStandardWebhook(body, headers, secrets, input.now ?? Math.floor(Date.now() / 1000))) {
    return true;
  }
  return verifyLegacyOpenPhone(body, headers, secrets);
}

export function quoWebhookSignatureDebug(headers: Headers) {
  const openPhone = parseOpenPhoneSignature(
    header(headers, "openphone-signature") || header(headers, "OpenPhone-Signature"),
  );
  return {
    hasWebhookId: !!header(headers, "webhook-id"),
    hasWebhookTimestamp: !!header(headers, "webhook-timestamp"),
    hasWebhookSignature: !!header(headers, "webhook-signature"),
    hasOpenPhoneSignature: !!openPhone,
    openPhoneScheme: openPhone?.scheme || null,
    openPhoneVersion: openPhone?.version || null,
    openPhoneFields: openPhone?.fieldCount || 0,
    openPhoneSignatureChars: openPhone?.signatureChars || 0,
  };
}
