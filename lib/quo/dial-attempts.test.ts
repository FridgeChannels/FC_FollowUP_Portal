import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DIAL_ATTEMPT_TTL_MS,
  findRecentQuoDialAttempt,
  recordQuoDialAttempt,
} from "./dial-attempts.ts";

async function withStore<T>(run: () => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "quo-dial-"));
  const previous = process.env.QUO_DIAL_ATTEMPTS_PATH;
  process.env.QUO_DIAL_ATTEMPTS_PATH = join(dir, "attempts.json");
  try {
    return await run();
  } finally {
    if (previous == null) delete process.env.QUO_DIAL_ATTEMPTS_PATH;
    else process.env.QUO_DIAL_ATTEMPTS_PATH = previous;
  }
}

describe("Quo dial attempts", () => {
  it("stores the task, phone, and time on disk", async () => {
    await withStore(async () => {
      const saved = await recordQuoDialAttempt({
        taskId: "task-1",
        phone: "+1 972 900 0833",
        contactId: "contact-1",
      });
      assert.equal(saved.phone, "9729000833");
      const raw = JSON.parse(await readFile(process.env.QUO_DIAL_ATTEMPTS_PATH || "", "utf8"));
      assert.equal(raw.attempts[0].taskId, "task-1");
    });
  });

  it("matches a webhook phone within 30 minutes", async () => {
    await withStore(async () => {
      await recordQuoDialAttempt({ taskId: "task-1", phone: "+19729000833" });
      const matched = await findRecentQuoDialAttempt(["+1 972 900 0833"]);
      assert.equal(matched?.taskId, "task-1");
    });
  });

  it("ignores attempts older than 30 minutes", async () => {
    await withStore(async () => {
      await recordQuoDialAttempt({ taskId: "task-old", phone: "+19729000833" });
      const staleAt = new Date(Date.now() + DIAL_ATTEMPT_TTL_MS + 1000).toISOString();
      const matched = await findRecentQuoDialAttempt(["+19729000833"], staleAt);
      assert.equal(matched, null);
    });
  });
});
