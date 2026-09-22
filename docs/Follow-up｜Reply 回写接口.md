# Reply 回写

渠道适配器把**已发出 Follow-up Task 上的客户回复**写入 `FC3.0-Follow-up-ConversationDB`。不要把 Gmail 等原始 webhook 直接交给 Portal。

客户先联系、无对应已发任务 → 使用 [`POST /api/inbound`](./Follow-up｜Inbound%20回写接口.md)。

**Notion 前置：** ConversationDB 需有 Date 属性 `Reply Due At`（详见 Inbound 文档）。入库 Needs Reply 时会自动写入最晚应回复时间。

```
POST https://followup-portal.fridgechannels.com/api/replies
Authorization: Bearer <REPLY_INGEST_TOKEN>
```

本地未配置 token 时，使用 `local-reply-ingest`。

`threadId` 是系统线程 ID（如 `THR-…-Email` / `THR-…-LinkedIn`），从该任务下已发出 Conversation 携带。不是 Gmail、LinkedIn、Twilio、WhatsApp 或 Quo 的原始会话 ID；那些放进 `extendedParameters`。

---

## Email

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<系统线程 ID>",
  "content": "Yes, Mike has the Magnet.",
  "channel": "Email",
  "sender": "",
  "subject": "",
  "messageId": "",
  "occurredAt": "",
  "extendedParameters": {
    "gmailThreadId": "18c4abcd",
    "gmailMessageId": "18c4ef01"
  },
  "attachments": [
    {
      "id": "abc123def456",
      "kind": "file",
      "name": "quote.pdf",
      "mimeType": "application/pdf",
      "size": 12345,
      "url": "https://<bucket>.s3.<region>.amazonaws.com/files/abc123def456.pdf"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `taskId` | 是 | 已发出任务的页面 ID 或标题 |
| `threadId` | 是 | 系统线程 ID，与 Outbound 相同。Inbound 复用，对话才能拼在一起 |
| `content` | 条件 | 回复原文。可空，但此时必须有 `attachments`（Content 会写成附件 caption） |
| `channel` | 建议 | 固定 `Email` |
| `sender` | 否 | 空则补联系人邮箱 |
| `subject` | 否 | 空则补 `Re:` + Outbound 主题 |
| `messageId` | 否 | **回写留空**。服务端生成 `IN-Email-{timestamp}`，不影响对话展示 |
| `occurredAt` | 否 | 真实收到时间。空则用服务器时间 |
| `extendedParameters` | 否 | JSON 对象，写入 ConversationDB `Extended Parameters`。Gmail thread / message id 放这里 |
| `attachments` | 否 | Email 附件元数据数组，写入 ConversationDB `Attachments`。二进制须先落到本系统 S3；非法项整单 **400** |

`attachments[]` 每项：

| 字段 | 说明 |
| --- | --- |
| `id` | 上传 id（与 S3 key 主体一致，去横线 UUID） |
| `kind` | `image` / `video` / `file`。也可省略，由 `mimeType` 推断：`image/*` → `image`，`video/*` → `video`，其余（如 `application/pdf`）→ `file`。Email **默认**允许的 MIME 只有 pdf / jpeg / png / webp，因此默认场景实际只会落到 `image` 或 `file`；`video` 仅在 `EMAIL_ATTACHMENT_MIME_TYPES` 包含视频类型时才会出现 |
| `name` | 文件名 |
| `mimeType` | 默认允许 `application/pdf,image/jpeg,image/png,image/webp`（可用 `EMAIL_ATTACHMENT_MIME_TYPES` 覆盖） |
| `size` | 字节数，须 > 0 且不超过 `EMAIL_ATTACHMENT_MAX_BYTES`（默认 10MB） |
| `url` | 本桶 S3 公网 HTTPS URL（须通过 `isAllowedS3MediaUrl`） |

数量上限默认 5（`EMAIL_ATTACHMENT_MAX_COUNT`）。S3 对象前缀默认 `files`（`S3_FILE_PREFIX`）。

非 Email 渠道携带 `attachments` → **400**。
`taskId` + `threadId` 必须指向同一条 Outbound Email，且对应 `Task Status = Completed`。发送状态以 Task Status 为准。

写入后：

- `Direction = Inbound`，`Reply Status = Needs Reply`
- 写入 `Reply Due At`（最晚应回复时间）：默认收到后 24 小时内的工作日时刻；若当日渠道 Daily Max 已满，顺延到最近有剩余容量的工作日
- 挂到该 Outbound 的 Task / Thread
- 同 OmniReach 未发出渠道任务改为 `Cancelled`
- 客户 `Follow-up Status = In Progress`，`Handling Mode = Human`

新建 `201`，同一 `messageId` 再提交 `200` + `duplicate: true`。

| HTTP | 含义 |
| --- | --- |
| 400 | 字段不合法 |
| 401 | 未鉴权 |
| 403 | 登录用户无权写该品牌 |
| 404 | Task / Thread 不存在 |
| 409 | Task 与 Thread 对不上，或 Task Status 尚未 Completed |
| 422 | 找不到可挂靠的已发出记录 |
| 500 | 写入失败 |

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/replies" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<Follow-up Task 页面 ID 或标题>",
    "threadId": "<系统线程 ID>",
    "content": "Yes, Mike has the Magnet.",
    "channel": "Email"
  }'
```

先核对发出记录：

```
GET /api/replies/target?taskId=<Task>&threadId=<系统线程 ID>
```

---

## LinkedIn

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<系统线程 ID>",
  "content": "I will confirm with Mike this afternoon.",
  "channel": "LinkedIn",
  "sender": "",
  "messageId": "",
  "occurredAt": "",
  "extendedParameters": {
    "linkedinConversationId": "2-Y2FjZS1jb252ZXJzYXRpb24=",
    "linkedinMessageId": "2-bXNnLTE4YzQ="
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `taskId` | 是 | 已发出 LinkedIn 任务的页面 ID 或标题 |
| `threadId` | 是 | 系统线程 ID，如 `THR-…-LinkedIn`。与 Outbound 相同，Inbound 复用 |
| `content` | 是 | 回复原文 |
| `channel` | 建议 | 固定 `LinkedIn` |
| `sender` | 否 | 空则补联系人 LinkedIn URL / handle |
| `messageId` | 否 | **回写留空**。服务端生成 `IN-LinkedIn-{timestamp}` |
| `occurredAt` | 否 | 真实收到时间。空则用服务器时间 |
| `extendedParameters` | 否 | LinkedIn 会话 / 消息 ID 放这里，不要当作 `threadId` |

`taskId` + `threadId` 必须指向同一条 Outbound LinkedIn，且对应 `Task Status = Completed`。发送状态以 Task Status 为准。写入后行为与错误码同 Email。

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/replies" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<Follow-up Task 页面 ID 或标题>",
    "threadId": "<系统线程 ID>",
    "content": "I will confirm with Mike this afternoon.",
    "channel": "LinkedIn"
  }'
```

---

## SMS

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<系统线程 ID>",
  "content": "Magnet arrived yesterday.",
  "channel": "SMS",
  "sender": "",
  "messageId": "",
  "occurredAt": "",
  "extendedParameters": {
    "smsMessageSid": "SM1234567890abcdef",
    "smsFrom": "+14155550182"
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `taskId` | 是 | 已发出 SMS 任务的页面 ID 或标题 |
| `threadId` | 是 | 系统线程 ID，如 `THR-…-SMS`。与 Outbound 相同，Inbound 复用 |
| `content` | 是 | 回复原文 |
| `channel` | 建议 | 固定 `SMS`。不要写成 WhatsApp |
| `sender` | 否 | 空则补联系人手机号 |
| `messageId` | 否 | **回写留空**。服务端生成 `IN-SMS-{timestamp}` |
| `occurredAt` | 否 | 真实收到时间。空则用服务器时间 |
| `extendedParameters` | 否 | 供应商 Message SID、来信号码放这里，不要当作 `threadId` |

`taskId` + `threadId` 必须指向同一条 Outbound SMS，且对应 `Task Status = Completed`。发送状态以 Task Status 为准。写入后行为与错误码同 Email。

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/replies" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<Follow-up Task 页面 ID 或标题>",
    "threadId": "<系统线程 ID>",
    "content": "Magnet arrived yesterday.",
    "channel": "SMS"
  }'
```

---

## WhatsApp

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<系统线程 ID>",
  "content": "The Magnet arrived. I can review the form this afternoon.",
  "channel": "WhatsApp",
  "sender": "",
  "messageId": "",
  "occurredAt": "",
  "extendedParameters": {
    "whatsappMessageId": "wamid.HBgNMTQxNTU1NTAxODIVAgARGBI=",
    "whatsappConversationId": "whatsapp:+14155550182"
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `taskId` | 是 | 已发出 WhatsApp 任务的页面 ID 或标题 |
| `threadId` | 是 | 系统线程 ID，如 `THR-…-WhatsApp`。与 Outbound 相同，Inbound 复用 |
| `content` | 是 | 回复原文 |
| `channel` | 建议 | 固定 `WhatsApp`。不要写成 SMS |
| `sender` | 否 | 空则补联系人手机号 / WhatsApp 号码 |
| `messageId` | 否 | **回写留空**。服务端生成 `IN-WhatsApp-{timestamp}` |
| `occurredAt` | 否 | 真实收到时间。空则用服务器时间 |
| `extendedParameters` | 否 | wamid、WhatsApp conversation id 放这里，不要当作 `threadId` |

`taskId` + `threadId` 必须指向同一条 Outbound WhatsApp，且对应 `Task Status = Completed`。发送状态以 Task Status 为准。写入后行为与错误码同 Email。

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/replies" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<Follow-up Task 页面 ID 或标题>",
    "threadId": "<系统线程 ID>",
    "content": "The Magnet arrived. I can review the form this afternoon.",
    "channel": "WhatsApp"
  }'
```

---

## Phone

Phone 主路径是 Quo webhook（`/api/webhooks/quo`）+ Call Review，匹配规则见 [Quo 电话回写匹配](./Follow-up｜Quo%20电话回写匹配.md)。本节 `/api/replies` 仅作补充验证。


```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<系统线程 ID>",
  "callResult": "Connected",
  "content": "",
  "channel": "Phone",
  "sender": "",
  "messageId": "",
  "occurredAt": "",
  "extendedParameters": {
    "quoCallId": "call_18c4",
    "quoConversationId": "conv_18c4"
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `taskId` | 是 | 已发出 Phone 任务的页面 ID 或标题 |
| `threadId` | 是 | 系统线程 ID，如 `THR-…-Phone`。与 Outbound 相同，Inbound 复用 |
| `callResult` | 建议 | `Connected` / `No Answer` / `Voicemail` / `Declined` / `Invalid Number`。可代替 `content` |
| `content` | 否 | 通话摘要。空则回退 `callResult`，再空则写 `Inbound call` |
| `channel` | 建议 | 固定 `Phone` |
| `sender` | 否 | 空则补联系人手机号 |
| `messageId` | 否 | **回写留空**。服务端生成 `IN-Phone-{timestamp}` |
| `occurredAt` | 否 | 真实来电 / 回拨时间。空则用服务器时间 |
| `extendedParameters` | 否 | Quo Call ID / Conversation ID 放这里，不要当作 `threadId` |

`callResult` 仅 Phone 可用，其它渠道传入会 `400`。

`taskId` + `threadId` 必须指向同一条 Outbound Phone，且对应 `Task Status = Completed`。发送状态以 Task Status 为准；不检查 `Call Result`。

写入后与其它渠道相同，但 Phone **不写 `Reply Status`**，只写 `Call Result`（若传入）。

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/replies" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<Follow-up Task 页面 ID 或标题>",
    "threadId": "<系统线程 ID>",
    "callResult": "Connected",
    "channel": "Phone"
  }'
```
