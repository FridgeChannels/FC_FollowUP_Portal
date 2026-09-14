# Follow-up Reply 回写接口

五渠道（Email / LinkedIn / SMS / WhatsApp / Phone）发出后的 inbound 回复，统一写入 `FC3.0-Follow-up-ConversationDB`。

渠道适配器不要把 Gmail、LinkedIn、Twilio、WhatsApp 或电话系统的原始 webhook 直接交给 Portal。先映射成本文的标准 payload，再调用本接口。

## 接口

```
POST /api/replies
```

Portal 人工补录仍可使用：

```
POST /api/brands/:brandId/replies
```

两者共用同一套 `ingestInboundReply()`。渠道回写请走 `/api/replies`。

## 鉴权

任选一种：

1. 渠道适配器：`Authorization: Bearer <REPLY_INGEST_TOKEN>`
2. Portal 登录态：Cookie `fc_portal_session`，且对解析到的品牌有写权限

本地开发未配置 `REPLY_INGEST_TOKEN` 时，默认 token 为 `local-reply-ingest`。

## 标准请求

```json
{
  "channel": "Email",
  "content": "Yes, Mike has the Magnet.",
  "occurredAt": "2026-09-13T14:22:08+08:00",
  "sender": "john@acme.co",
  "subject": "Re: Did the FC Magnet make it to Mike?",
  "threadId": "gmail-thread-18c4",
  "messageId": "gmail-msg-18c4",
  "sourceUrl": "https://mail.example.com/thread/18c4",
  "inReplyToMessageId": "gmail-msg-18c3",
  "taskId": null,
  "contactId": null,
  "brandId": null,
  "callResult": null,
  "notes": null
}
```

### 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `channel` | 是 | `Email` / `LinkedIn` / `SMS` / `WhatsApp` / `Phone` |
| `content` | 消息渠道必填 | 回复原文，完整写入 `Content`。Phone 可写通话摘要；缺省时回退 `callResult` |
| `occurredAt` | 否 | 渠道真实接收或通话时间，写入 `Interaction At`。缺省为服务器当前时间 |
| `sender` | 建议 | Email 地址、E.164 手机号、LinkedIn URL/handle、来电号码 |
| `messageId` | 强烈建议 | 渠道单条消息 ID，作为幂等键。重复提交返回 `duplicate: true` |
| `threadId` | 建议 | 渠道会话 ID。缺省回退已有线程或 `contactId + channel` |
| `inReplyToMessageId` | 否 | 对应 outbound 的 `Message ID`，用于挂回原会话 |
| `sourceUrl` | 否 | 原始渠道链接，写入 `Source URL` |
| `subject` | Email 建议 | 其他渠道留空 |
| `taskId` / `contactId` / `brandId` | 定位用 | 能给就给。解析顺序见下表 |
| `brandName` | 模拟/人工可用 | 按企业名称匹配 Follow-up Client，并自动选当前正在联系的人 |
| `callResult` | Phone 建议 | `Connected` / `No Answer` / `Voicemail` / `Declined` / `Invalid Number` |
| `notes` | 否 | 中文备注。缺省为「渠道回复已入库，待人工处理。」 |

### 固定写入

- `Direction = Inbound`
- 消息渠道 `Message Status = Received`
- Phone 不写 `Message Status`，写 `Call Result`
- Title：`客户 — 人员 — 渠道 — Inbound`
- `Conversation Record ID = PORTAL-IN-{messageId}`

## 归属解析

按以下顺序解析 Follow-up Contact，找到即停：

1. `messageId` 已存在 → 视为重复，不新建
2. `taskId` + `threadId` → 必须指向同一条 Outbound，再使用该任务上的 Contact / Thread
3. 仅 `taskId` → 使用任务上的 Contact
4. `inReplyToMessageId` 或仅 `threadId` → 继承已有 Conversation 的 Contact / Task / Thread
5. `contactId` → 直接使用，并校验与 `brandId` 一致
6. `brandId + sender` → 按渠道标识匹配该客户下的 Follow-up Contact
7. `brandName` 或仅 `brandId` → 按企业名称找到客户，再选当前正在联系的人
8. 无法解析 → `422`

“当前正在联系的人”选择顺序：`Follow-up Status = In Progress`，其次未结束联系人；同组内优先有未完成 Task 的人，再按 Primary / Secondary / Backup，最后看最近互动时间。

按 Follow-up Task + Thread ID 查找发出记录：

```
GET /api/replies/target?taskId=<Follow-up Task ID>&threadId=<Thread ID>
```

两者必须指向同一条 Outbound。只给 `threadId` 时仍可查找，但同一 Thread 上有多条发出记录时，应同时给 `taskId`，避免挂到别的 Bomb 步骤。

渠道标识匹配：

- Email：`sender` = KeyPerson.Email
- SMS / WhatsApp / Phone：规范化后的手机号
- LinkedIn：profile URL 或 handle

多个 Contact 命中同一 `sender` 时返回 `409`。不要为对不上的回复新建 Contact。

## 已发出校验

回写前必须找到对应渠道的 Outbound 记录，并且同时满足：

- **Message Status = `Sent`**。Phone 可以用已填写的 `Call Result` 代替。
- **Task Status = `Completed`**。表示该渠道动作已经实际执行。

`Pending`、`In Progress`、`Failed`、`Cancelled` 的任务，或 `Pending` / `Failed` 的发出记录，一律拒绝回写。接口不会为此新建独立任务。

Inbound 会挂到这条已发出 Outbound 所属的 Task 和 Thread 上。

## 回写后的状态

1. 新建 Inbound Conversation，挂到已发出的 Task
2. Conversation 与 Task 双向关联
3. 客户 `Follow-up Status` 更新为 `In Progress`
4. 任务 inbox 标记为 `Needs Reply`

本接口不自动改 `Handling Mode`，也不自动取消其他渠道任务。

## 成功响应

新建返回 `201`，重复回写返回 `200`。

```json
{
  "duplicate": false,
  "conversationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "threadId": "gmail-thread-18c4",
  "messageId": "gmail-msg-18c4",
  "contactId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "taskId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "brandId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "inboxStatus": "Needs Reply"
}
```

## 错误码

| HTTP | 含义 |
| --- | --- |
| 400 | 渠道、内容、`occurredAt`、`sourceUrl` 或 `callResult` 不合法 |
| 401 | 未提供登录态或 ingest token |
| 403 | 登录用户无权写该品牌 |
| 404 | Task / Contact / Brand 不存在 |
| 409 | 多个 Contact 匹配同一 sender；或 Task / Message 尚未发出 |
| 422 | 无法解析 Contact，或 Contact 缺少 Follow-up Client |
| 500 | 服务器或 Notion 写入失败 |

## 五渠道映射

| 渠道 | `threadId` | `messageId` | `sender` | 特殊字段 |
| --- | --- | --- | --- | --- |
| Email | 邮件线程 ID | RFC Message-ID 或供应商 message id | From 邮箱 | `subject` |
| LinkedIn | 会话 ID | 单条 message id | profile URL 或 handle | `sourceUrl` 指向对话页 |
| SMS | 建议 `sms:{e164}` | 供应商 message sid | E.164 手机号 | 号码先规范化 |
| WhatsApp | WhatsApp conversation id | wamid | E.164 手机号 | `channel` 必须是 `WhatsApp`，不要写成 SMS |
| Phone | 建议 `phone:{e164}` 或 Call SID | Call SID | 来电号码 | `callResult` 必填语义；`content` 写摘要 |

## 示例

本地默认：

```bash
curl -X POST http://127.0.0.1:5173/api/replies \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d @scripts/reply-samples/email.json
```

提交前把 sample 里的 `{{stamp}}` 换成唯一值，并补上 `brandId` / `contactId` / `taskId`。

### Email

```json
{
  "channel": "Email",
  "brandId": "<follow-up-client-id>",
  "contactId": "<follow-up-contact-id>",
  "content": "Yes, Mike has the Magnet.",
  "sender": "john@acme.co",
  "subject": "Re: Did the FC Magnet make it to Mike?",
  "threadId": "gmail-thread-18c4",
  "messageId": "gmail-msg-18c4",
  "occurredAt": "2026-09-13T14:22:08+08:00"
}
```

### LinkedIn

```json
{
  "channel": "LinkedIn",
  "contactId": "<follow-up-contact-id>",
  "content": "I will confirm with Mike this afternoon.",
  "sender": "https://www.linkedin.com/in/john-smith",
  "threadId": "linkedin-thread-001",
  "messageId": "linkedin-msg-001",
  "sourceUrl": "https://www.linkedin.com/messaging/thread/linkedin-thread-001"
}
```

### SMS

```json
{
  "channel": "SMS",
  "contactId": "<follow-up-contact-id>",
  "content": "Magnet arrived yesterday.",
  "sender": "+14155550182",
  "threadId": "sms:+14155550182",
  "messageId": "SM1234567890"
}
```

### WhatsApp

```json
{
  "channel": "WhatsApp",
  "contactId": "<follow-up-contact-id>",
  "content": "The Magnet arrived. I can review the form this afternoon.",
  "sender": "+14155550182",
  "threadId": "whatsapp:+14155550182",
  "messageId": "wamid.HBgM..."
}
```

### Phone

```json
{
  "channel": "Phone",
  "contactId": "<follow-up-contact-id>",
  "content": "对方回拨确认 Magnet 已交给 Mike。",
  "sender": "+14155550182",
  "threadId": "phone:+14155550182",
  "messageId": "CA1234567890",
  "callResult": "Connected"
}
```

## 模拟脚本

样例 payload 在 `scripts/reply-samples/`。模拟回写必须同时指定 **Follow-up Task**（页面 ID 或任务标题）和 **Thread ID**，只回复这一步已经发出的记录，不会因为同一联系人复用旧 Thread 而挂到别的 Bomb。

```bash
# 按 Task + Thread 回写
npm run simulate:replies -- --task "<Follow-up Task ID 或标题>" --thread "<Thread ID>"
npm run simulate:replies:email -- --task "Oxyfresh — Melissa Gulbranson — Email — 2026-09-14" --thread "<Thread ID>"

# 先看匹配到哪条发出记录，不写入
npm run simulate:replies -- --dry-run --task "<Follow-up Task ID 或标题>" --thread "<Thread ID>"
```

查找接口：

```
GET /api/replies/target?taskId=<Follow-up Task ID>&threadId=<Thread ID>
```

该 Task 上、该 Thread 的 Outbound 必须已经 `Message Status = Sent`，且 Task Status 必须是 `Completed`，否则回写会被拒绝。两者对不上会返回 `409`。

环境变量：

```bash
PORTAL_URL=http://localhost:5173
REPLY_INGEST_TOKEN=local-reply-ingest
REPLY_TASK_ID=
REPLY_THREAD_ID=
```

每次运行会把 inbound 的 `messageId` 换成新时间戳，避免冲突。同一 inbound `messageId` 再提交会返回 `duplicate: true`。

## 和发出链路的关系

| 事件 | 接口 | Conversation |
| --- | --- | --- |
| 生成待发内容 | launch / messages | Outbound + `Pending` |
| 客户回复 | **`POST /api/replies`** | Inbound + `Received` |

确认渠道已发出（Pending → Sent）不在本接口范围。
