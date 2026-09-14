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

最少三个字段：定位到哪一步已发出，再加上回复原文。渠道、联系人、主题、Sender、Message ID 都从该 Task / Thread 的 Outbound 补全。

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<Thread ID>",
  "content": "Yes, Mike has the Magnet."
}
```

Phone 可以只给通话结果：

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<Thread ID>",
  "callResult": "Connected"
}
```

### 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `taskId` | 是 | Follow-up Task 页面 ID 或标题。必须与 `threadId` 指向同一条已发出 Outbound |
| `threadId` | 是 | 同一联系人、同一渠道、同一场对话的 Thread ID |
| `content` | 消息渠道必填 | 回复原文。Phone 可省略，回退 `callResult` |
| `channel` | 否 | 缺省用该 Task / Thread 上 Outbound 的渠道 |
| `callResult` | Phone 建议 | `Connected` / `No Answer` / `Voicemail` / `Declined` / `Invalid Number` |
| `occurredAt` | 否 | 真实接收时间。缺省为服务器当前时间 |
| `messageId` | 否 | 幂等键。缺省自动生成 `IN-{channel}-{timestamp}` |
| `sender` / `subject` / `inReplyToMessageId` | 否 | 缺省从联系人和对应 Outbound 补全 |
| `sourceUrl` / `notes` / `contactId` / `brandId` / `brandName` | 否 | 兼容旧调用，不再需要 |

### 固定写入

- `Direction = Inbound`
- 消息渠道 `Message Status = Received`
- Phone 不写 `Message Status`，写 `Call Result`
- `Reply Status = Needs Reply`
- `CP At Interaction` = 入库当时 Follow-up Client 的 Current CP（CP1 / CP2 / CP3）。历史消息不得用客户此刻的 CP 回填
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

1. 新建 Inbound Conversation，挂到已发出的 Task，`Reply Status = Needs Reply`
2. Conversation 与 Task 双向关联
3. 若该 Task 属于某个 Bomb：同一 Bomb、同一联系人下，其余尚未发出的渠道任务（`Pending` / `In Progress`）全部改为 `Cancelled`
4. 客户 `Follow-up Status` 更新为 `In Progress`
5. 客户 `Handling Mode` 更新为 `Human`
6. 任务 inbox 标记为 `Needs Reply`

人工从该条 Inbound 回复后，同一 Task / Thread 上的待处理 Inbound 更新为 `Reply Status = Replied`，Portal 收起回复框。

已 `Completed` / `Failed` / `Cancelled` 的渠道任务不会被改动。非 Bomb 任务的回复不会取消其他渠道。`Follow-up Status` 保持独立，不会因为切换 Handling Mode 而改成别的状态。

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

标准写入只传 `taskId` + `threadId` + `content`（Phone 可用 `callResult`）。下表是服务端从 Outbound / Contact 补全时用的含义；渠道适配器不必再传。

| 渠道 | `threadId` | 自动补全 |
| --- | --- | --- |
| Email | 邮件线程 ID | Sender = 联系人邮箱；Subject = `Re:` + Outbound 主题 |
| LinkedIn | 会话 ID | Sender = 联系人 LinkedIn |
| SMS | 建议 `sms:{e164}` | Sender = 联系人手机号 |
| WhatsApp | WhatsApp conversation id | Sender = 联系人手机号 |
| Phone | 建议 `phone:{e164}` | Sender = 联系人手机号；`callResult` 可单独传入 |

## 示例

本地默认：

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/replies" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<Follow-up Task 页面 ID 或标题>",
    "threadId": "<Thread ID>",
    "content": "Yes, Mike has the Magnet."
  }'
```

### Email

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<Thread ID>",
  "content": "Yes, Mike has the Magnet."
}
```

### LinkedIn

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<Thread ID>",
  "content": "I will confirm with Mike this afternoon."
}
```

### SMS

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<Thread ID>",
  "content": "Magnet arrived yesterday."
}
```

### WhatsApp

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<Thread ID>",
  "content": "The Magnet arrived. I can review the form this afternoon."
}
```

### Phone

```json
{
  "taskId": "<Follow-up Task 页面 ID 或标题>",
  "threadId": "<Thread ID>",
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
