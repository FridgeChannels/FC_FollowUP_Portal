# Inbound 回写（冷进线）

渠道适配器把**非已发 Follow-up Task 上的客户来信**写入 `FC3.0-Follow-up-ConversationDB`。

- 已发出任务的回复 → 用 [`POST /api/replies`](./Follow-up｜Reply%20回写接口.md)
- 客户先联系 / 无对应已发 Task → 用本接口 `POST /api/inbound`

不要把 Gmail 等原始 webhook 直接交给 Portal。

## Notion 前置

在 **FC3.0-Follow-up-ConversationDB** 新增 Date 属性（可含时间）：

| 属性名 | 类型 | 说明 |
| --- | --- | --- |
| `Reply Due At` | Date | 最晚应人工回复时间。由 Portal 在写入 Needs Reply 时自动计算 |

未添加该字段时，带 `Reply Due At` 的入库请求会失败。历史已存在的 Needs Reply 若无此字段，Brands 列表会回退显示 `Interaction At`。

```
POST https://followup-portal.fridgechannels.com/api/inbound
Authorization: Bearer <REPLY_INGEST_TOKEN>
```

本地未配置 token 时，使用 `local-reply-ingest`。也可登录后调用（需对该品牌有写权限）。

---

## 与 `/api/replies` 的区别

| | `/api/replies` | `/api/inbound` |
| --- | --- | --- |
| 场景 | 已发 Follow-up 的回复 | 无已发 Task / 客户先联系 |
| 定位 | `taskId` + `threadId` | `contactId`，或 `brandId` + `sender` |
| Follow-up Task | 必挂 | **留空** |
| 取消同 OmniReach 未发任务 | 是 | **否** |
| Client → Human | 是 | 是 |

误把 `taskId` 传到本接口会返回 **400**，请改调 `/api/replies`。

---

## 入参（精简）

### 路径 A：已知 Contact（推荐）

```json
{
  "channel": "Email",
  "object": "Magnet inquiry",
  "content": "We saw your Magnet offer…",
  "contactId": "<Follow-up Contact 页面 ID>"
}
```

### 路径 B：品牌 + 来信标识

```json
{
  "channel": "SMS",
  "content": "Got the sample.",
  "brandId": "<Follow-up Client 页面 ID>",
  "sender": "+14155550182"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `channel` | 是 | `Email` / `LinkedIn` / `SMS` / `WhatsApp` / `Phone` |
| `content` | 条件 | 非 Phone 必填。Phone 可空，空则写入 `Inbound call` |
| `object` | 仅 Email | **邮件主题**，写入 Conversation `Subject`。Email **必填**；其它渠道**禁止**传 |
| `contactId` | 二选一 | Follow-up Contact 页面 ID（优先） |
| `brandId` + `sender` | 二选一 | 无 `contactId` 时成对必填。`sender` 按渠道匹配邮箱 / 手机 / LinkedIn |

服务端自动处理（调用方不要传）：

- `threadId`：同联系人同渠道已有系统 `THR-…` 则复用，否则新建
- `messageId`：生成 `IN-{channel}-{timestamp}`
- `occurredAt`：服务器时间
- Follow-up Task：**不关联**
- `Notes`：固定为「客户主动来信，无对应已发任务。」

---

## Email

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/inbound" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Email",
    "object": "Magnet inquiry",
    "content": "We saw your Magnet offer…",
    "contactId": "<Follow-up Contact 页面 ID>"
  }'
```

`object` 为邮件主题。缺省或非 Email 传 `object` → **400**。

---

## LinkedIn

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/inbound" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "LinkedIn",
    "content": "Interested in learning more about Magnet.",
    "contactId": "<Follow-up Contact 页面 ID>"
  }'
```

---

## SMS

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/inbound" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "SMS",
    "content": "Got the sample.",
    "brandId": "<Follow-up Client 页面 ID>",
    "sender": "+14155550182"
  }'
```

---

## WhatsApp

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/inbound" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "WhatsApp",
    "content": "Can we schedule a call?",
    "contactId": "<Follow-up Contact 页面 ID>"
  }'
```

---

## Phone

```bash
curl -sS -X POST "http://127.0.0.1:5173/api/inbound" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Phone",
    "content": "Asked about pricing",
    "contactId": "<Follow-up Contact 页面 ID>"
  }'
```

`content` 可省略，空则写入 `Inbound call`。Phone 不写 `Message Status` / `Reply Status`。

---

## 写入后行为

- `Direction = Inbound`
- 非 Phone：`Message Status = Received`，`Reply Status = Needs Reply`
- 非 Phone：写入 `Reply Due At`（默认 Interaction At + 24h 工作日；渠道容量满则顺延）
- `Follow-up Task` **留空**
- 客户 `Follow-up Status = In Progress`（若尚不是），`Handling Mode = Human`
- **不**取消同 OmniReach 未发出渠道任务

成功响应 **201**：

```json
{
  "duplicate": false,
  "conversationId": "<page id>",
  "threadId": "THR-…-Email",
  "messageId": "IN-Email-…",
  "contactId": "…",
  "brandId": "…",
  "taskId": null,
  "inboxStatus": "Needs Reply"
}
```

Phone 时 `inboxStatus` 为 `null`。

| HTTP | 含义 |
| --- | --- |
| 400 | 字段不合法（缺 channel、Email 缺 object、非 Email 传了 object、误传 taskId 等） |
| 401 | 未鉴权 |
| 403 | 登录用户无权写该品牌 |
| 404 | Brand / Contact 不存在 |
| 409 | 多个 Contact 匹配同一 sender |
| 422 | 无法定位 Contact（缺 contactId 且无完整 brandId+sender，或 sender 无匹配） |
| 500 | 写入失败 |
