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
    result: "answered",
    dial: true,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-dial") options.dial = false;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--url" && next) {
      options.url = next;
      index += 1;
    } else if (arg === "--task" && next) {
      options.taskId = next;
      index += 1;
    } else if (arg === "--email" && next) {
      options.email = next;
      index += 1;
    } else if (arg === "--result" && next) {
      options.result = next;
      index += 1;
    } else if (!arg.startsWith("-") && !options.taskId) {
      options.taskId = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
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

function sessionCookie(email) {
  return `fc_portal_session=${encodeURIComponent(JSON.stringify({ email: email.trim().toLowerCase() }))}`;
}

function signBody(body, secret) {
  if (secret.startsWith("whsec_")) {
    const webhookId = `msg_sim_${Date.now()}`;
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

async function requestJson(url, { path, method = "GET", headers = {}, payload, retried = false }) {
  try {
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
      body = { error: text || "Empty response" };
    }
    return { status: response.status, body, url };
  } catch (error) {
    const fallback = !retried && alternateLocalUrl(url);
    if (fallback) return requestJson(fallback, { path, method, headers, payload, retried: true });
    const reason = error instanceof Error ? error.cause?.message || error.message : String(error);
    throw new Error(`无法连接 ${new URL(path, url).href}（${reason}）。请确认 npm run dev 已启动。`);
  }
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function buildEvents({ callId, from, to, result }) {
  const createdAt = isoMinutesAgo(2);
  const answeredAt = result === "unanswered" ? null : isoMinutesAgo(1);
  const completedAt = new Date().toISOString();
  const context = {
    orgId: "ORsim",
    phoneNumberId: "PNsim",
    conversationId: `CNsim${callId}`,
    userId: "USsim",
    participants: {
      workspace: [from],
      external: [to],
      resolution: "available",
    },
  };
  const status = result === "answered" ? "answered" : "unanswered";
  const hasVoicemail = result === "voicemail";
  const wrap = (type, resource) => ({
    id: `EV${callId}-${type}`,
    type,
    createdAt: completedAt,
    data: { resource, context, links: { quo: "https://my.quo.com/inbox/sim" } },
  });

  const events = [
    wrap("call.ringing", {
      id: callId,
      direction: "outgoing",
      createdAt,
      updatedAt: createdAt,
    }),
    wrap("call.completed", {
      id: callId,
      direction: "outgoing",
      status,
      createdAt,
      answeredAt,
      completedAt,
      updatedAt: completedAt,
      duration: result === "unanswered" ? 8 : 42,
      hasVoicemail,
    }),
  ];

  if (result === "voicemail") {
    events.push(wrap("call.voicemail.completed", {
      id: `AC${callId}vm`,
      voicemailId: "VMsim",
      callId,
      direction: "outgoing",
      duration: 12,
      from,
      to,
      transcript: "Simulated voicemail: please call back tomorrow.",
      recordingUrl: "https://example.com/quo-sim-voicemail.mp3",
      createdAt: completedAt,
      updatedAt: completedAt,
    }));
  }

  if (result === "answered") {
    events.push(
      wrap("call.recording.completed", {
        id: callId,
        direction: "outgoing",
        createdAt,
        answeredAt,
        completedAt,
        duration: 42,
        recordings: [{
          id: "REsim",
          duration: 42,
          startTime: answeredAt,
          type: "audio/mpeg",
          url: "https://example.com/quo-sim-recording.mp3",
        }],
      }),
      wrap("call.transcript.completed", {
        callId,
        createdAt: completedAt,
        duration: 42,
        processingStatus: "completed",
        dialogue: [
          { identifier: from, content: "Hi, this is a simulated Quo call from Follow-up Portal.", start: 0, end: 4 },
          { identifier: to, content: "Thanks, I can hear you. Please send the recap.", start: 4, end: 8 },
        ],
      }),
      wrap("call.summary.completed", {
        callId,
        processingStatus: "completed",
        summary: ["Simulated outbound call connected.", "Contact asked for a written recap."],
        nextSteps: ["Send recap in Follow-up Portal."],
        jobs: [],
      }),
    );
  }

  return events;
}

loadDotEnv(join(ROOT, ".env"));

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(`本地模拟 Call with Quo → webhook 回写，不需要真的打电话。

Usage:
  npm run simulate:quo -- --task "<Follow-up Task ID>" --email "<Owner 邮箱>"

  --task     Follow-up Task 页面 ID（必填）
  --email    能打开该任务的 Owner 邮箱，用来写入本地拨号记录
  --result   answered | unanswered | voicemail   默认 answered
  --no-dial  跳过 quo-attempt（你刚在页面点过 Call with Quo 时用）
  --dry-run  只打印将要发送的事件
  --url      默认 http://localhost:5173

会写入真实 Notion ConversationDB。请先启动 npm run dev。
`);
  process.exit(0);
}

if (!options.taskId) {
  console.error('请传入任务 ID，例如：npm run simulate:quo -- --task "3db9166f-d9fd-8119-aa29-f4273e978af2" --email "you@company.com"');
  process.exit(1);
}

const result = String(options.result).toLowerCase();
if (!["answered", "unanswered", "voicemail"].includes(result)) {
  console.error("--result 只能是 answered、unanswered 或 voicemail");
  process.exit(1);
}

const secret = process.env.QUO_WEBHOOK_SIGNING_SECRET || process.env.QUO_WEBHOOK_KEY || "";
if (!secret && !options.dryRun) {
  console.error("缺少 QUO_WEBHOOK_SIGNING_SECRET，无法签署模拟 webhook。");
  process.exit(1);
}

const from = (process.env.QUO_FROM_NUMBER || "+13853310718").trim();
const to = (process.env.DEV_CALL_PHONE || "+18207863604").trim();
const callId = `ACsim${Date.now().toString(36)}`;
const events = buildEvents({ callId, from, to, result });
const cookie = options.email ? sessionCookie(options.email) : "";

console.log(`模拟 Quo 通话 ${callId}`);
console.log(`Task ${options.taskId} · ${from} → ${to} · ${result}`);

if (options.dial) {
  if (!options.email) {
    console.error("写入拨号记录需要 --email。若已在页面点过 Call with Quo，可加 --no-dial。");
    process.exit(1);
  }
  if (!options.dryRun) {
    const attempt = await requestJson(options.url, {
      path: `/api/tasks/${options.taskId}`,
      method: "POST",
      headers: { Cookie: cookie },
      payload: { action: "quo-attempt" },
    });
    console.log(`\nquo-attempt ${attempt.status} ${JSON.stringify(attempt.body.error || { ok: attempt.status < 400 })}`);
    if (attempt.status >= 400) {
      console.error(JSON.stringify(attempt.body, null, 2));
      process.exit(1);
    }
  } else {
    console.log("\nquo-attempt skipped (--dry-run)");
  }
} else {
  console.log("\n跳过 quo-attempt，将使用当前进程里已有的拨号记录。");
}

let failed = 0;
for (const event of events) {
  const body = JSON.stringify(event);
  console.log(`\n=== ${event.type} ===`);
  if (options.dryRun) {
    console.log(JSON.stringify(event, null, 2));
    continue;
  }
  const posted = await requestJson(options.url, {
    path: "/api/webhooks/quo",
    method: "POST",
    headers: signBody(body, secret),
    payload: body,
  });
  console.log(`${posted.status} ${JSON.stringify(posted.body)}`);
  if (event.type === "call.ringing" && posted.status === 200 && !posted.body.linked) {
    console.warn("ringing 未匹配到本地拨号记录。completed 多半会 202，不会写 Notion。");
  }
  if (event.type !== "call.ringing" && (posted.status === 202 || posted.body.linked === false)) {
    failed += 1;
  }
  if (posted.status >= 400) failed += 1;
}

if (options.dryRun) {
  console.log(`\nDry run complete. ${events.length} webhook payload(s) printed.`);
} else if (failed) {
  console.error(`\n有 ${failed} 个事件没有链到任务。先点 Call with Quo，或带上 --email 再跑。`);
  process.exit(1);
} else {
  console.log(`\n模拟完成。可在任务 ${options.taskId} 的 Conversation 里查看 QUO_CALL:${callId}。`);
}
