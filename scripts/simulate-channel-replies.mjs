import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHANNELS = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];
const SAMPLE_FILES = {
  Email: "email.json",
  LinkedIn: "linkedin.json",
  SMS: "sms.json",
  WhatsApp: "whatsapp.json",
  Phone: "phone.json",
};

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
    channels: [],
    dryRun: false,
    url: process.env.PORTAL_URL || "http://localhost:5173",
    token: process.env.REPLY_INGEST_TOKEN || "local-reply-ingest",
    threadId: process.env.REPLY_THREAD_ID || "",
    brandName: process.env.REPLY_BRAND_NAME || "",
    contactId: process.env.REPLY_CONTACT_ID || "",
    taskId: process.env.REPLY_TASK_ID || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--channel" && next) {
      options.channels.push(next);
      index += 1;
    } else if (arg === "--url" && next) {
      options.url = next;
      index += 1;
    } else if (arg === "--token" && next) {
      options.token = next;
      index += 1;
    } else if ((arg === "--thread" || arg === "--thread-id") && next) {
      options.threadId = next;
      index += 1;
    } else if ((arg === "--name" || arg === "--brand-name") && next) {
      options.brandName = next;
      index += 1;
    } else if (arg === "--contact" && next) {
      options.contactId = next;
      index += 1;
    } else if (arg === "--task" && next) {
      options.taskId = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("-")) {
      options.threadId = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function normalizeChannels(values, fallback) {
  if (!values.length) return fallback ? [fallback] : CHANNELS;
  return values.map((value) => {
    const match = CHANNELS.find((item) => item.toLowerCase() === value.toLowerCase());
    if (!match) throw new Error(`Unknown channel: ${value}. Use ${CHANNELS.join(", ")}`);
    return match;
  });
}

function replaceStamp(value, stamp) {
  return typeof value === "string" ? value.replaceAll("{{stamp}}", stamp) : value;
}

function loadPayload(channel, stamp, options, target) {
  const file = join(ROOT, "scripts/reply-samples", SAMPLE_FILES[channel]);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const payload = {
    taskId: target?.taskId || options.taskId,
    threadId: options.threadId || target?.threadId,
    content: replaceStamp(raw.content, stamp),
  };
  if (channel === "Phone" && raw.callResult) payload.callResult = raw.callResult;
  return payload;
}

function alternateLocalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
      return parsed.toString().replace(/\/$/, "");
    }
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    return null;
  }
  return null;
}

async function requestJson(url, token, path, payload, retried = false) {
  try {
    const response = await fetch(new URL(path, url), {
      method: payload ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text || "Empty response" };
    }
    return { status: response.status, body, url };
  } catch (error) {
    const fallback = !retried && alternateLocalUrl(url);
    if (fallback) return requestJson(fallback, token, path, payload, true);
    const reason = error instanceof Error ? error.cause?.message || error.message : String(error);
    throw new Error(`无法连接 ${new URL(path, url).href}（${reason}）。请确认 npm run dev 已启动。`);
  }
}

async function resolveTarget(options) {
  const search = new URLSearchParams({
    threadId: options.threadId,
    taskId: options.taskId,
  });
  const result = await requestJson(
    options.url,
    options.token,
    `/api/replies/target?${search}`,
  );
  if (result.status >= 400) {
    throw new Error(result.body.error || `Lookup failed (${result.status})`);
  }
  return result.body;
}

loadDotEnv(join(ROOT, ".env"));

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(`按 Follow-up Task + Thread ID 模拟对某条已发出消息的 inbound reply。

Usage:
  npm run simulate:replies -- --task "<Follow-up Task ID>" --thread "<Thread ID>"
  npm run simulate:replies:email -- --task "<Follow-up Task ID>" --thread "<Thread ID>"

  --task        Follow-up Task 的 Notion 页面 ID，或任务标题
  --thread      该任务上已发出记录的 Thread ID
  --dry-run     只打印将要提交的 payload
  --channel     Email | LinkedIn | SMS | WhatsApp | Phone，须与该 Task / Thread 渠道一致
`);
  process.exit(0);
}

if (!options.taskId || !options.threadId) {
  console.error(
    '请同时输入 Follow-up Task ID 和 Thread ID，例如：npm run simulate:replies:email -- --task "<Task ID>" --thread "<Thread ID>"',
  );
  process.exit(1);
}

let target = null;
try {
  target = await resolveTarget(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const threadChannel = target?.taskChannel || null;
const channels = normalizeChannels(options.channels, threadChannel);
if (threadChannel && channels.some((item) => item !== threadChannel)) {
  console.error(`Thread ID 属于 ${threadChannel}，不能用 ${channels.join(", ")} 模拟。`);
  process.exit(1);
}

console.log(
  `已匹配 Task ${target.taskId || options.taskId} · Thread ${target.threadId || options.threadId}：${target.brandName} → ${target.contactName}` +
    `${threadChannel ? ` · ${threadChannel}` : ""}` +
    `${target.sourceBombName ? ` / ${target.sourceBombName}` : ""}` +
    `${target.messageStatus ? ` / Message ${target.messageStatus}` : ""}` +
    `${target.taskStatus ? ` / Task ${target.taskStatus}` : ""}`,
);

const stamp = Date.now().toString();
let failed = 0;
for (const channel of channels) {
  const payload = loadPayload(channel, `${stamp}-${channel.toLowerCase()}`, options, target);
  console.log(`\n=== ${channel} ===`);
  console.log(JSON.stringify(payload, null, 2));
  if (options.dryRun) continue;
  const result = await requestJson(options.url, options.token, "/api/replies", payload);
  console.log(`${result.status} ${JSON.stringify(result.body, null, 2)}`);
  if (result.status >= 400) failed += 1;
}

if (options.dryRun) {
  console.log(`\nDry run complete. ${channels.length} channel payload(s) printed.`);
} else if (failed) {
  console.error(`\n${failed}/${channels.length} channel write-back(s) failed.`);
  process.exit(1);
} else {
  console.log(`\n${channels.length} channel write-back(s) completed.`);
}
