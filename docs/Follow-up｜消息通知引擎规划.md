# Follow-up｜消息通知引擎规划

## 1. 文档目标

定义一套**独立、可插拔**的消息通知引擎：在 Reply / Inbound 成功回写后，向外部渠道推送提醒。

V1 只落地 **Slack Incoming Webhook**；架构上必须允许后续增加其它 Provider（邮件、Teams、企业微信等），且业务回写链路不感知具体渠道实现。

本文档只定需求与边界，**不包含实现代码**。

---

## 2. 背景与动机

渠道适配器通过以下接口把客户消息写入 ConversationDB：

| 场景 | 接口 | 文档 |
| --- | --- | --- |
| 已发 Follow-up Task 上的客户回复 | `POST /api/replies` | [Reply 回写接口](./Follow-up｜Reply%20回写接口.md) |
| 无对应已发 Task / 客户先联系 | `POST /api/inbound` | [Inbound 回写接口](./Follow-up｜Inbound%20回写接口.md) |

写入成功后，Owner / 值班人员需要及时知道「有客户来信 / 需要人工跟进」。当前 Portal 没有统一的出站通知层，不宜在各 route 里硬编码 Slack 请求。

---

## 3. 设计原则

1. **独立模块**：通知逻辑集中在独立目录（建议实现时 `lib/notify/`），不散落在 Notion 写入或 API route 细节中。
2. **可插拔 Provider**：引擎只认统一事件与投递接口；Slack 是第一个 Provider，可开关、可替换、可并存。
3. **业务无感**：`/api/replies`、`/api/inbound` 成功落库后只发出领域事件（或调用引擎入口）；不直接拼 Slack payload。
4. **失败隔离**：通知失败**不得**回滚或改变回写 API 的成功结果（仍返回 201/200）。通知错误只记日志，可后续重试（V1 可不做队列）。
5. **配置外置**：Webhook URL、总开关、按事件开关均来自 `.env`，禁止把密钥写进代码或文档正文。
6. **默认安全**：未配置 Webhook 或总开关关闭时，引擎为空操作（no-op），不抛错阻断回写。

---

## 4. 职责边界

### 4.1 通知引擎负责

1. 接收标准化通知事件（见 §6）。
2. 按配置决定是否投递、投递给哪些已启用 Provider。
3. 将事件渲染为各 Provider 所需的消息格式。
4. 调用 Provider 出站（V1：HTTP POST Slack Webhook）。
5. 记录投递结果日志（成功 / 跳过 / 失败原因）。

### 4.2 通知引擎不负责

- Conversation / Task / Client 的写入与校验（仍由现有 Reply / Inbound 链路完成）。
- 鉴权（仍由 `REPLY_INGEST_TOKEN` 或登录态处理）。
- 接收 Slack 交互回调、按钮审批（V1 不做 Incoming Interactive）。
- 站内 Inbox UI、未读角标（仍属 Portal 前端）。
- 把 Gmail / LinkedIn 等原始渠道 webhook 转成业务事件（适配器仍先调 Portal 回写接口）。

---

## 5. 模块形态（可插拔）

逻辑分层（实现时的目标结构，本阶段仅规划）：

```
领域事件（Reply / Inbound 成功）
        ↓
  Notification Engine（编排：开关、过滤、扇出）
        ↓
  Provider 接口（send(event)）
        ├── SlackWebhookProvider   ← V1
        ├── （预留）EmailProvider
        └── （预留）其它 IM Provider
```

### 5.1 对调用方的契约

回写成功后调用单一入口，例如概念上：

```
notify.emit(NotificationEvent)
```

调用方**只传领域事实**（事件类型、品牌、联系人、渠道、摘要、conversationId、taskId、是否 Needs Reply 等），不传 Slack 专用字段。

### 5.2 Provider 契约（概念）

每个 Provider：

| 能力 | 说明 |
| --- | --- |
| `id` | 稳定标识，如 `slack` |
| `enabled` | 由环境变量与自身必填配置共同决定 |
| `supports(event)` | 可选过滤（如某 Provider 只要 Needs Reply） |
| `send(event)` | 执行出站；抛错由引擎捕获并记日志 |

引擎对已启用 Provider **并行或顺序扇出**（V1 建议顺序，便于日志）；任一 Provider 失败不影响其它 Provider，也不影响回写响应。

### 5.3 插拔方式（V1）

- **配置插拔**：`.env` 开关关闭 → 该 Provider 不注册或 `enabled=false`。
- **代码插拔**：新增 Provider 实现并在注册表登记一行；回写调用点无需修改。
- **事件插拔**：后续若有「任务失败」「排班告警」等，只需定义新 `eventType`，不必改 Slack 传输层。

---

## 6. 触发事件（V1）

### 6.1 事件一览

| `eventType` | 触发时机 | 来源接口 |
| --- | --- | --- |
| `reply.received` | 已发 Task 上客户回复写入成功 | `POST /api/replies` |
| `inbound.received` | Cold Inbound 写入成功 | `POST /api/inbound` |

### 6.2 何时触发 / 何时不触发

| 条件 | 是否通知 | 说明 |
| --- | --- | --- |
| 新建成功（HTTP 201，`duplicate: false`） | **是** | 主路径 |
| 幂等重复（HTTP 200，`duplicate: true`） | **否** | 避免适配器重试刷屏 |
| 校验失败（4xx）或写入失败（5xx） | **否** | 无有效业务落库 |
| Phone 且未产生 `Needs Reply` | **可配置，默认是** | 仍可能需要「有来电/通话记录」提醒；见 §8 |
| 通知总开关关闭 / Webhook 未配置 | **否**（静默跳过） | no-op |

### 6.3 事件载荷（领域字段，建议）

所有事件共用一套字段，缺失则省略或写 `—`：

| 字段 | 说明 |
| --- | --- |
| `eventType` | `reply.received` / `inbound.received` |
| `channel` | Email / LinkedIn / SMS / WhatsApp / Phone |
| `brandId` / `brandName` | Follow-up Client |
| `ownerId` / `ownerName` | 该品牌 Follow-up Client 上的 Owner（负责人）。V1 展示姓名；不做 Slack @mention |
| `contactId` / `contactName` | 联系人 |
| `sender` | 来信标识（邮箱 / 手机 / LinkedIn） |
| `subject` | Email 主题（若有） |
| `contentPreview` | 正文截断（建议 ≤ 300 字符，避免 Slack 过长） |
| `conversationId` | Conversation 页面 ID |
| `taskId` | Reply 有值；Inbound 为 `null` |
| `threadId` | 系统线程 ID |
| `messageId` | 服务端生成的 `IN-…` |
| `inboxStatus` | `Needs Reply` 或 `null`（Phone） |
| `replyDueAt` | 若已写入 |
| `occurredAt` | 互动时间 |
| `portalUrl` | 可选：跳转 Portal 品牌/对话的深链（若可构造） |

载荷由回写链路在**已成功拿到结果**后组装，通知引擎不二次查 Notion（V1）。若品牌名等展示字段在结果里没有，允许用 ID 占位，后续再增强。

---

## 7. Slack Provider（V1）

### 7.1 出站方式

- 使用 Slack **Incoming Webhook**（`https://hooks.slack.com/services/...`）。
- HTTP `POST`，`Content-Type: application/json`。
- V1 使用简单 `text` 和/或 Block Kit 均可；推荐 **可读纯文本 + 少量固定字段**，降低耦合。

### 7.2 消息内容要求

每条通知至少让值班人在 3 秒内看清：

1. **类型**：Reply 还是 Cold Inbound  
2. **渠道**  
3. **品牌**（标题级）+ **Owner / Contact / From**（分栏）  
4. **是否 Needs Reply / Reply Due At（若有）**  
5. **正文预览**  
6. **Portal 品牌页按钮**：`{PORTAL_BASE_URL}/customers/{brandId}`（默认生产域名；本地可覆写）

V1 使用 Slack Incoming Webhook 的 **Block Kit**：标题 + 字段分栏 + Preview 引用 + `Open brand in Portal` 按钮。纯文本 fallback 仍保留给推送摘要。

`Owner` 取自该品牌 Follow-up Client 的 Owner 关系；缺失时显示 `—`，不阻断推送。V1 只展示人名，不做 Slack @mention / 按 Owner 分流频道（见 §10）。

环境变量：`PORTAL_BASE_URL`（可选，默认 `https://followup-portal.fridgechannels.com`）。

Cold Inbound 标题为 `Cold Inbound · {channel}`；Reply 为 `Reply · {channel}`。

### 7.3 Slack 侧失败

| 情况 | 引擎行为 |
| --- | --- |
| HTTP 非 2xx / 网络超时 | 记 error 日志；不抛给 API 调用方 |
| Webhook 被撤销 / URL 无效 | 同上；运维修 `.env` |
| 速率限制 | V1 仅日志；不入队（后续可加） |

V1 **不做**本地重试队列；若后续需要，作为引擎内部增强，不改回写接口契约。

---

## 8. 环境变量（`.env`）

全部写入 `.env` / `.env.example`（实现阶段）；文档中**只写变量名与含义，不写真实 Webhook**。

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `NOTIFY_ENABLED` | 否 | `false` | 通知引擎总开关。`true` 才尝试投递 |
| `NOTIFY_SLACK_ENABLED` | 否 | `true`（仅当总开关开且 URL 有值时实际生效） | Slack Provider 开关 |
| `SLACK_WEBHOOK_URL` | 条件 | 空 | Slack Incoming Webhook 完整 URL。为空则 Slack Provider 视为未启用 |
| `NOTIFY_ON_REPLY` | 否 | `true` | 是否推送 `reply.received` |
| `NOTIFY_ON_INBOUND` | 否 | `true` | 是否推送 `inbound.received` |
| `NOTIFY_ON_PHONE` | 否 | `true` | Phone 渠道是否推送（Phone 通常无 Needs Reply） |
| `NOTIFY_CONTENT_MAX_CHARS` | 否 | `300` | 正文预览截断长度 |

### 8.1 生效规则

```
实际推送 Slack =
  NOTIFY_ENABLED == true
  AND NOTIFY_SLACK_ENABLED != false
  AND SLACK_WEBHOOK_URL 非空
  AND 对应事件开关为 true
  AND （非 Phone 或 NOTIFY_ON_PHONE == true）
  AND 非 duplicate
```

### 8.2 密钥与安全

- `SLACK_WEBHOOK_URL` 等同密钥：仅存在于运行环境 `.env` / 部署密钥库。
- **不得**提交到 git、文档、截图、Issue。
- 若 URL 曾在聊天或文档中明文出现，应在 Slack 侧 **Rotate / 重建 Webhook**，并更新环境变量。
- `.env.example` 只保留空变量名，不填真实值。

---

## 9. 与回写链路的挂载点

| 挂载点 | 时机 |
| --- | --- |
| Reply 回写成功路径 | Notion 写入完成、准备返回 201 且 `duplicate === false` 之后 |
| Inbound 回写成功路径 | 同上 |

约束：

1. **异步偏好**：V1 可用 `waitUntil` / 后台 fire-and-forget / 不 await 完整 Slack RTT（实现时按运行时能力选择）；但必须保证进程在响应前至少**已发起**投递或入本地微任务，避免完全丢失。若无法可靠后台执行，可短超时 await（如 2–3s），超时则记日志放弃。
2. **单一出口**：禁止在多个 helper 里各调一次 Slack；只在回写结果确认处调用引擎一次。
3. **不反向依赖**：`lib/notify` 不依赖 Notion 写库细节；可依赖共享类型（channel 枚举等）。

---

## 10. 非目标（明确不做）

V1 不做：

- 按 Owner / 品牌路由到不同 Slack channel  
- @mention 具体 Owner  
- Slack 线程回复、表情确认回写状态  
- 通知已读状态与 Portal Inbox 同步  
- 多 Webhook 负载均衡  
- 持久化投递队列 / DLQ  
- 对外部开放「测试通知」HTTP API（可选后续加内部 admin）

---

## 11. 验收标准（实现阶段对照）

1. `NOTIFY_ENABLED=false` 或未配 `SLACK_WEBHOOK_URL` 时，Reply / Inbound 行为与现网一致，无报错、无出站请求。
2. 总开关打开且 URL 有效时：新建 Reply → Slack 收到一条含类型 Reply 的消息；新建 Inbound → 类型 Inbound。
3. 同一 `messageId` 重复提交（duplicate）→ Slack **不再**多推一条。
4. Slack 宕机或 URL 错误 → API 仍返回成功落库结果；服务端有失败日志。
5. 关闭 `NOTIFY_ON_REPLY` / `NOTIFY_ON_INBOUND` 可单独静音对应事件。
6. 新增第二个 Provider 时，Reply/Inbound route **无需**为 Slack 格式再改一版业务代码（只需注册 Provider + 配置）。

---

## 12. 实现分期建议

| 阶段 | 内容 |
| --- | --- |
| **本期** | `lib/notify` + Slack Provider + `.env` 配置 + 挂到 replies / inbound 成功路径 |
| **再后** | 深链 `portalUrl`、按 Owner 路由、轻量重试或队列 |

---

## 13. 待确认问题

实现前建议产品 / 使用方确认：

1. **文案语言**：Slack 消息用中文、英文，还是中英混排？  
2. **Phone**：默认推送是否合适？还是仅 Needs Reply 渠道通知？  
3. **目标频道**：V1 是否接受「全公司一个 Webhook / 一个 channel」？  
4. **深链**：是否必须在 V1 带上可点击的 Portal 链接？若必须，链接落到 Brands 列表还是具体客户页？  
5. **敏感内容**：正文预览是否允许包含客户原文（合规 / 隐私）？若否，V1 只推元数据不推 `contentPreview`。

---

## 14. 相关文档

- [Reply 回写接口](./Follow-up｜Reply%20回写接口.md)
- [Inbound 回写接口](./Follow-up｜Inbound%20回写接口.md)
- [Notion 数据库字典（迁移版）](./Follow-up｜Notion%20数据库字典（迁移版）.md)
