# Reply 回写

渠道适配器把客户回复写入 `FC3.0-Follow-up-ConversationDB`。不要把 Gmail 等原始 webhook 直接交给 Portal。

```
POST /api/replies
Authorization: Bearer <REPLY_INGEST_TOKEN>
```

本地未配置 token 时，使用 `local-reply-ingest`。

`threadId` 是系统线程 ID（如 `THR-…-Email`），从该任务下已发出 Conversation 携带。不是 Gmail 线程 ID。

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
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `taskId` | 是 | 已发出任务的页面 ID 或标题 |
| `threadId` | 是 | 系统线程 ID，与 Outbound 相同。Inbound 复用，对话才能拼在一起 |
| `content` | 是 | 回复原文 |
| `channel` | 建议 | 固定 `Email` |
| `sender` | 否 | 空则补联系人邮箱 |
| `subject` | 否 | 空则补 `Re:` + Outbound 主题 |
| `messageId` | 否 | **回写留空**。服务端生成 `IN-Email-{timestamp}`，不影响对话展示 |
| `occurredAt` | 否 | 真实收到时间。空则用服务器时间 |
| `extendedParameters` | 否 | JSON 对象，写入 ConversationDB `Extended Parameters`。Gmail thread / message id 放这里 |

`taskId` + `threadId` 必须指向同一条已发出 Email：`Message Status = Sent`，`Task Status = Completed`。

写入后：

- `Direction = Inbound`，`Message Status = Received`，`Reply Status = Needs Reply`
- 挂到该 Outbound 的 Task / Thread
- 同 Bomb 未发出渠道任务改为 `Cancelled`
- 客户 `Follow-up Status = In Progress`，`Handling Mode = Human`

新建 `201`，同一 `messageId` 再提交 `200` + `duplicate: true`。

| HTTP | 含义 |
| --- | --- |
| 400 | 字段不合法 |
| 401 | 未鉴权 |
| 403 | 登录用户无权写该品牌 |
| 404 | Task / Thread 不存在 |
| 409 | Task 与 Thread 对不上，或尚未发出 |
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

## 其他渠道

同一接口。LinkedIn / SMS / WhatsApp 同样传 `taskId` + `threadId` + `content`。Phone 可用 `callResult` 代替 `content`。
