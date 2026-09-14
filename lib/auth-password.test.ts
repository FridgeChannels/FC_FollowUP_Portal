import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, isPasswordHash, verifyPassword } from "./auth-password.ts";

describe("verifyPassword", () => {
  it("accepts a matching hash", async () => {
    const stored = await hashPassword("secret-pass");
    assert.equal(isPasswordHash(stored), true);
    const result = await verifyPassword("secret-pass", stored);
    assert.deepEqual(result, { ok: true });
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("secret-pass");
    const result = await verifyPassword("other-pass", stored);
    assert.deepEqual(result, { ok: false });
  });

  it("upgrades a plaintext OwnerDB value to a hash", async () => {
    const result = await verifyPassword("temporary", "temporary");
    assert.equal(result.ok, true);
    assert.equal(isPasswordHash(result.upgradedHash), true);
    const hashed = await verifyPassword("temporary", result.upgradedHash);
    assert.deepEqual(hashed, { ok: true });
  });

  it("rejects empty stored passwords", async () => {
    assert.deepEqual(await verifyPassword("secret-pass", ""), { ok: false });
    assert.deepEqual(await verifyPassword("secret-pass", null), { ok: false });
  });
});
