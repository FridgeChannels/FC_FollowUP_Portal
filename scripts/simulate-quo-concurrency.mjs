import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const options = {
    url: process.env.PORTAL_URL || "http://localhost:5173",
    taskId: process.env.SIMULATE_QUO_TASK_ID || "",
    email: process.env.PORTAL_EMAIL || "",
    parallel: 6,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--url" && next) {
      options.url = next;
      index += 1;
    } else if (arg === "--task" && next) {
      options.taskId = next;
      index += 1;
    } else if (arg === "--email" && next) {
      options.email = next;
      index += 1;
    } else if ((arg === "--parallel" || arg === "--concurrency") && next) {
      options.parallel = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function sessionCookie(email) {
  return `fc_portal_session=${encodeURIComponent(JSON.stringify({ email: email.trim().toLowerCase() }))}`;
}

function signBody(body, secret) {
  if (secret.startsWith("whsec_")) {
    const webhookId = `msg_conc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(secret.slice("whsec_".length), "base64");
    const signature = createHmac("sha256", key)
      .update(`${webhookId}.${timestamp}.${body}`)
      .digest("base64");
    return {
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    };
  }
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${timestamp}.${body}`)
    .digest("base64");
  return { "openphone-signature": `hmac;1;${timestamp};${signature}` };
}

function ringingPayload(index) {
  const callId = `ACconc${Date.now().toString(36)}${index}`;
  return {
    id: `EV${callId}`,
    type: "call.ringing",
    createdAt: new Date().toISOString(),
    data: {
      resource: {
        id: callId,
        direction: "outgoing",
        status: "ringing",
        from: (process.env.QUO_FROM_NUMBER || "+13853310718").trim(),
        to: (process.env.DEV_CALL_PHONE || "+18207863604").trim(),
      },
      context: {
        conversationId: `CN${callId}`,
        participants: {
          workspace: [(process.env.QUO_FROM_NUMBER || "+13853310718").trim()],
          external: [(process.env.DEV_CALL_PHONE || "+18207863604").trim()],
        },
      },
    },
  };
}

async function timed(label, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    return { label, ok: result.status < 500, status: result.status, ms: Date.now() - started, error: result.body?.error || null };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function request(url, { path, method = "GET", headers = {}, payload }) {
  const response = await fetch(new URL(path, url), {
    method,
    headers: {
      Accept: "application/json",
      ...headers,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: typeof payload === "string" ? payload : JSON.stringify(payload) } : {}),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text.slice(0, 200) || "Empty response" };
  }
  return { status: response.status, body };
}

loadDotEnv(join(ROOT, ".env"));

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(`并发压测：同时打任务列表、任务详情、Quo ringing webhook。

Usage:
  npm run simulate:quo:concurrency -- --task "<Task ID>" --email "<Owner 邮箱>"

  --parallel  每类请求并发数，默认 6
  --url       默认 http://localhost:5173

webhook 只用 call.ringing，不会写 Conversation。
请先启动 npm run dev，并看终端里是否再出现 cross-request promise 警告。
`);
  process.exit(0);
}

if (!options.taskId || !options.email) {
  console.error("需要 --task 和 --email。");
  process.exit(1);
}
if (!Number.isFinite(options.parallel) || options.parallel < 1) {
  console.error("--parallel 必须是正整数。");
  process.exit(1);
}

const secret = process.env.QUO_WEBHOOK_SIGNING_SECRET || process.env.QUO_WEBHOOK_KEY || "";
if (!secret) {
  console.error("缺少 QUO_WEBHOOK_SIGNING_SECRET。");
  process.exit(1);
}

const cookie = sessionCookie(options.email);
const jobs = [];
for (let index = 0; index < options.parallel; index += 1) {
  jobs.push(timed("GET /api/tasks", () => request(options.url, {
    path: "/api/tasks",
    headers: { Cookie: cookie },
  })));
  jobs.push(timed("GET /api/tasks/:id", () => request(options.url, {
    path: `/api/tasks/${options.taskId}`,
    headers: { Cookie: cookie },
  })));
  const body = JSON.stringify(ringingPayload(index));
  jobs.push(timed("POST /api/webhooks/quo", () => request(options.url, {
    path: "/api/webhooks/quo",
    method: "POST",
    headers: signBody(body, secret),
    payload: body,
  })));
}

console.log(`并发 ${options.parallel} × 3 类 = ${jobs.length} 个请求`);
console.log(`Task ${options.taskId}`);

const rows = await Promise.all(jobs);
const failed = rows.filter((row) => !row.ok);
const labels = [...new Set(rows.map((row) => row.label))];

for (const label of labels) {
  const group = rows.filter((row) => row.label === label);
  const statuses = [...new Set(group.map((row) => row.status))].sort((a, b) => a - b);
  const maxMs = Math.max(...group.map((row) => row.ms));
  const minMs = Math.min(...group.map((row) => row.ms));
  console.log(`${label}: ${group.filter((row) => row.ok).length}/${group.length} ok · status ${statuses.join(",")} · ${minMs}-${maxMs}ms`);
}

if (failed.length) {
  console.error(`\n失败 ${failed.length} 个：`);
  for (const row of failed) {
    console.error(`- ${row.label} ${row.status} ${row.ms}ms ${row.error || ""}`);
  }
  process.exit(1);
}

console.log("\n没有 5xx。请再看 npm run dev 终端：不应再出现 cross-request promise 警告。");
