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
| 定位 | `taskId` + `threadId` | `FollowUpClientId` + `sender`（Email 可仅 `sender`） |
| Follow-up Task | 必挂 | **留空** |
| 取消同 OmniReach 未发任务 | 是 | **否** |
| Client → Human | 是 | 是 |

误把 `taskId` 或 `contactId` 传到本接口会返回 **400**。有已发 Task 的回复请改调 `/api/replies`。

---

## 入参

### Email（推荐）

```json
{
  "channel": "Email",
  "object": "Magnet inquiry",
  "content": "We saw your Magnet offer…",
  "sender": "buyer@acme.com",
  "FollowUpClientId": "<Follow-up Client 页面 ID，可空>",
  "extendedParameters": {
    "gmailThreadId": "18c4abcd",
    "gmailMessageId": "18c4ef01"
  },
  "attachments": [
    {
      "id": "abc123def456",
      "kind": "file",
      "name": "brochure.pdf",
      "mimeType": "application/pdf",
      "size": 12345,
      "url": "https://<bucket>.s3.<region>.amazonaws.com/files/abc123def456.pdf"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `channel` | 是 | `Email` |
| `object` | 是 | 邮件主题 → Conversation `Subject` |
| `content` | 条件 | 正文。可空，但此时必须有 `attachments` |
| `sender` | 是 | **对方发信人邮箱**（KeyPerson `Email`） |
| `FollowUpClientId` | 否 | Follow-up Client 页面 ID。也接受别名 `brandId` |
| `extendedParameters` | 否 | 写入 ConversationDB `Extended Parameters`（如 Gmail ids） |
| `attachments` | 否 | Email 附件元数据数组，写入 ConversationDB `Attachments`。二进制须先落到本系统 S3；非法项整单 **400**。非 Email 携带 `attachments` → **400** |

`attachments[]` 每项（与 [Reply 回写](./Follow-up｜Reply%20回写接口.md) Email 约定相同）：

| 字段 | 说明 |
| --- | --- |
| `id` | 上传 id（与 S3 key 主体一致，去横线 UUID） |
| `kind` | `image` / `video` / `file`。也可省略，由 `mimeType` 推断：`image/*` → `image`，`video/*` → `video`，其余（如 `application/pdf`）→ `file`。Email **默认**允许的 MIME 只有 pdf / jpeg / png / webp，因此默认场景实际只会落到 `image` 或 `file`；`video` 仅在 `EMAIL_ATTACHMENT_MIME_TYPES` 包含视频类型时才会出现 |
| `name` | 文件名 |
| `mimeType` | 默认允许 `application/pdf,image/jpeg,image/png,image/webp`（可用 `EMAIL_ATTACHMENT_MIME_TYPES` 覆盖） |
| `size` | 字节数，须 > 0 且不超过 `EMAIL_ATTACHMENT_MAX_BYTES`（默认 10MB） |
| `url` | 本桶 S3 公网 HTTPS URL（须通过 `isAllowedS3MediaUrl`） |

数量上限默认 5（`EMAIL_ATTACHMENT_MAX_COUNT`）。S3 对象前缀默认 `files`（`S3_FILE_PREFIX`）。

解析：

1. **有 `FollowUpClientId`**：定位品牌 → 品牌内按邮箱匹配 Contact  
2. **无 `FollowUpClientId`**：按邮箱全局查 KeyPerson → Follow-up Contact → 品牌（本轮仅 Email）  
3. 品牌 / 联系人找不到 → **404**；多 Contact 匹配同一邮箱 → **409**

### 其它渠道

需同时提供 `FollowUpClientId`（或 `brandId`）+ `sender`（手机号 / LinkedIn URL）。**不支持**仅凭 `sender` 全局查找。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `channel` | 是 | `LinkedIn` / `SMS` / `WhatsApp` / `Phone` |
| `content` | 条件 | 非 Phone 必填。Phone 可空 → `Inbound call` |
| `object` | 禁止 | 仅 Email 可用 |
| `sender` | 是 | 按渠道匹配手机 / LinkedIn |
| `FollowUpClientId` | 是 | 或别名 `brandId` |

服务端自动处理（调用方不要传）：

- `threadId`：一律新建系统 `THR-…`（Cold Inbound 视为新话题）
- `messageId`：生成 `IN-{channel}-{timestamp}`
- `occurredAt`：服务器时间
- Follow-up Task：**不关联**
- `Notes`：固定为「客户主动来信，无对应已发任务。」

---

## Email

```bash
# 已知品牌
curl -sS -X POST "http://127.0.0.1:5173/api/inbound" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Email",
    "object": "Magnet inquiry",
    "content": "We saw your Magnet offer…",
    "sender": "buyer@acme.com",
    "FollowUpClientId": "<Follow-up Client 页面 ID>"
  }'

# 仅邮箱（全局定位 Contact → Brand）
curl -sS -X POST "http://127.0.0.1:5173/api/inbound" \
  -H "Authorization: Bearer local-reply-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Email",
    "object": "Magnet inquiry",
    "content": "We saw your Magnet offer…",
    "sender": "buyer@acme.com"
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
    "FollowUpClientId": "<Follow-up Client 页面 ID>",
    "sender": "linkedin.com/in/someone"
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
    "FollowUpClientId": "<Follow-up Client 页面 ID>",
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
    "FollowUpClientId": "<Follow-up Client 页面 ID>",
    "sender": "+14155550182"
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
    "FollowUpClientId": "<Follow-up Client 页面 ID>",
    "sender": "+14155550182"
  }'
```

`content` 可省略，空则写入 `Inbound call`。Phone 不写 `Reply Status`。

---

## 写入后行为

- `Direction = Inbound`
- 非 Phone：`Reply Status = Needs Reply`
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
| 400 | 字段不合法（缺 channel、Email 缺 object、误传 taskId/contactId 等） |
| 401 | 未鉴权 |
| 403 | 登录用户无权写该品牌 |
| 404 | Brand / Contact 不存在或不匹配 sender |
| 409 | 多个 Contact 匹配同一 sender |
| 422 | 缺 `sender`；或非 Email 缺 `FollowUpClientId` |
| 500 | 写入失败 |
