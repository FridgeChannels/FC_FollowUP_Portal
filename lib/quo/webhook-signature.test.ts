import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyQuoWebhookSignature } from "./webhook-signature.ts";

function standardHeaders(body: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  const webhookId = "msg_test_1";
  const timestamp = String(now);
  const material = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const signature = createHmac("sha256", Buffer.from(material, "base64"))
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64");
  return new Headers({
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  });
}

describe("Quo webhook signatures", () => {
  it("accepts Standard Webhooks headers with a whsec_ key", async () => {
    const secret = `whsec_${Buffer.from("quo-standard-secret-bytes").toString("base64")}`;
    const body = JSON.stringify({ type: "call.completed", data: { resource: { id: "AC1" } } });
    assert.equal(await verifyQuoWebhookSignature({
      body,
      headers: standardHeaders(body, secret),
      secrets: [secret],
    }), true);
  });

  it("rejects a Standard Webhooks payload signed with a different key", async () => {
    const secret = `whsec_${Buffer.from("quo-standard-secret-bytes").toString("base64")}`;
    const other = `whsec_${Buffer.from("different-secret-bytes!!").toString("base64")}`;
    const body = JSON.stringify({ type: "call.completed" });
    assert.equal(await verifyQuoWebhookSignature({
      body,
      headers: standardHeaders(body, secret),
      secrets: [other],
    }), false);
  });

  it("accepts the legacy OpenPhone signature over the raw JSON body", async () => {
    const secret = Buffer.from("legacy-openphone-key").toString("base64");
    const body = '{\n  "type": "call.ringing",\n  "data": { "object": { "id": "AC1" } }\n}';
    const timestamp = "1710000000000";
    const signature = createHmac("sha256", Buffer.from(secret, "base64"))
      .update(`${timestamp}.${body}`)
      .digest("base64");
    assert.equal(await verifyQuoWebhookSignature({
      body,
      headers: new Headers({ "openphone-signature": `hmac;1;${timestamp};${signature}` }),
      secrets: [secret],
    }), true);
  });

  it("accepts the legacy OpenPhone signature after whitespace is stripped", async () => {
    const secret = Buffer.from("legacy-openphone-key").toString("base64");
    const body = JSON.stringify({ type: "call.ringing", data: { object: { id: "AC1" } } });
    const timestamp = "1710000000000";
    const signature = createHmac("sha256", Buffer.from(secret, "base64"))
      .update(`${timestamp}.${body.replace(/\s/g, "")}`)
      .digest("base64");
    assert.equal(await verifyQuoWebhookSignature({
      body,
      headers: new Headers({ "openphone-signature": `hmac;1;${timestamp};${signature}` }),
      secrets: [secret],
    }), true);
  });

  it("accepts the OpenPhone Node sample key encoding", async () => {
    const secret = Buffer.from("legacy-openphone-key").toString("base64");
    const body = JSON.stringify({ type: "call.completed" });
    const timestamp = "1710000000000";
    const key = Buffer.from(Buffer.from(secret, "base64").toString("binary"), "utf8");
    const signature = createHmac("sha256", key)
      .update(`${timestamp}.${JSON.stringify(JSON.parse(body))}`)
      .digest("base64");
    assert.equal(await verifyQuoWebhookSignature({
      body,
      headers: new Headers({ "openphone-signature": `hmac;1;${timestamp};${signature}` }),
      secrets: [secret],
    }), true);
  });

  it("rejects requests that have secrets configured but no signature headers", async () => {
    assert.equal(await verifyQuoWebhookSignature({
      body: "{}",
      headers: new Headers(),
      secrets: ["whsec_abc"],
      allowUnsigned: true,
    }), false);
  });

  it("allows unsigned local traffic only when no secrets are configured", async () => {
    assert.equal(await verifyQuoWebhookSignature({
      body: "{}",
      headers: new Headers(),
      secrets: [],
      allowUnsigned: true,
    }), true);
  });
});
