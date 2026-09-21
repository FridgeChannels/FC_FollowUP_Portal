# Test FridgeChannel Peter｜五渠道人工测试清单

按本清单自上而下勾选。每条用例完成后在「结果」列填 `Pass` / `Fail` / `Skip`，并记下 Notion 页 ID 或截图位置。

相关接口文档：

- [Inbound 回写接口](./Follow-up｜Inbound%20回写接口.md)
- [Reply 回写接口](./Follow-up｜Reply%20回写接口.md)
- [Quo 电话回写匹配](./Follow-up｜Quo%20电话回写匹配.md)
- [消息通知引擎规划](./Follow-up｜消息通知引擎规划.md) §11
- [Thread ID 与 CP 挂靠规则](./Follow-up｜Thread%20ID%20与%20CP%20挂靠规则.md)

---

## 0. 联调对象与常量

| 项 | 值 |
| --- | --- |
| Brand 标题 | `[TEST] FridgeChannel Peter` |
| Brand 页 ID（`FollowUpClientId`） | `3dc9166f-d9fd-80cb-b68d-ea31f82e4f87` |
| Portal 路径 | `/customers/3dc9166f-d9fd-80cb-b68d-ea31f82e4f87` |
| Contact | `[TEST]FridgeChannel - PeterCompany` → `3dc9166f-d9fd-8033-93a3-c3c4622386e8` |
| Key Person | `Test Peter` → `3dc9166f-d9fd-80c2-8c5b-da797214ac22` |
| Email（Verified） | `tzchao2025@gmail.com` |
| Phone / SMS / WhatsApp sender | `+16208941711` |
| LinkedIn | `https://www.linkedin.com/in/peter-tang-1830a03a2/` |
| `Is Test` | 已勾选 |
| Owner | Peter（`peter@fridgechannels.com`） |
| 基线状态（开测前核对） | Follow-up Status=`In Progress`，Handling Mode=`Human` |

**本地基址**（按实际改）：

```text
BASE=http://127.0.0.1:5173
TOKEN=local-reply-ingest
# 若 .env 配置了 REPLY_INGEST_TOKEN，改用该值
BRAND=3dc9166f-d9fd-80cb-b68d-ea31f82e4f87
```

**登录账号建议**：

| 账号 | 用途 |
| --- | --- |
| `peter@fridgechannels.com` 或 AccountManager | 主测：可见 `Is Test` 品牌 |
| 普通 Admin / Caller（非白名单） | ACL：应**看不到**该品牌 |
| `testcaller@fridgechannels.com` | 仅测 Phone Task 可见性（可选） |

**分层断言（每条用例都做）**：

1. **Portal UI**：渠道 tab / 气泡或 Phone Board / Needs Reply / toast  
2. **Notion**：ConversationDB（Channel、Direction、Thread、CP、Reply Status）+ TaskDB（若有）+ Client 状态  
3. **副作用**：Slack（Reply / Inbound）；LinkedIn 闸门；Phone 走 Quo

**注意**：

- 历史数据混有「真实已互动」与「仅排班未发」→ 判断时看 `Interaction At` / `Notes`，不要只看 Content。  
- Cold Inbound **总是新建** `THR-…`；Reply **沿用** Outbound 的 Thread。  
- Phone 主路径是 Quo webhook + Call Review；`/api/replies` 的 Phone 仅作补充验证。  
- WhatsApp 是**唯一**支持媒体附件的渠道。

---

## 1. 开测前检查

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 1.1 | `npm run dev` 已启动；用 Peter / AM 登录 | 能打开 Brand 详情 | ☐ | |
| 1.2 | 打开 `/customers/3dc9166f-d9fd-80cb-b68d-ea31f82e4f87` | 标题、CP、Status、Handling Mode 可见 | ☐ | |
| 1.3 | 核对 Contact `Test Peter` 五渠道字段 | Email / Phone / LI 与上表一致；WA 可用 | ☐ | 缺字段先补 Notion |
| 1.4 | ConversationDB 有 `Reply Due At` 属性 | 有则继续；无则 Inbound/Reply 会失败 | ☐ | 见 Inbound 文档 |
| 1.5 | （可选）`NOTIFY_ENABLED` + Slack Webhook | 后续 §7 可验通知 | ☐ | 勿把 Webhook 写入本清单 |
| 1.6 | （可选）跑单测：`npm run test:inbound` / `test:linkedin` / `test:quo` / `test:notify` | 全绿 | ☐ | 非阻塞 |

---

## 2. ACL（Is Test 可见性）

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 2.1 | Peter / AccountManager 登录 → Brands 列表 | 能看到 `[TEST] FridgeChannel Peter` | ☐ | |
| 2.2 | 普通 Admin（非白名单）登录 | 列表与直链均**看不到** / 403 | ☐ | |
| 2.3 | 普通 Caller 登录 | 同上 | ☐ | |
| 2.4 | （可选）`testcaller@…` | 仅见 Is Test 的 **Phone** 任务，不见生产品牌 | ☐ | |

---

## 3. 时间线 UI（五渠道 × CP）

对 **Email / LinkedIn / SMS / WhatsApp / Phone** 各做一遍；Phone 有 Pending Task 时可能进 Phone Board。

| # | 渠道 | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Email | 切 CP tab → 切 Email | 仅该 CP+渠道消息；排序合理 | ☐ | |
| 3.2 | LinkedIn | 同上 | 同上 | ☐ | 历史可能较少 |
| 3.3 | SMS | 同上 | 同上 | ☐ | |
| 3.4 | WhatsApp | 同上 | 同上；媒体消息可预览 | ☐ | |
| 3.5 | Phone | 同上 | 有 Task 时进 Board；无则对话流 | ☐ | |
| 3.6 | 横切 | 在 CP1 与当前 CP 间切换 | 内容不串台 | ☐ | |
| 3.7 | 横切 | 刷新页面 | tab 状态与数据一致 | ☐ | |

---

## 4. 渠道可用性闸门

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 4.1 | Send message：选 Email | 可选；Subject 必填 | ☐ | emailVerified |
| 4.2 | 选 Phone / SMS | 可选（有 `+16208941711`） | ☐ | |
| 4.3 | 选 WhatsApp | 可选 | ☐ | UI 可回退 phone |
| 4.4 | 选 LinkedIn | 可选；发送前走 `/linkedin-availability` | ☐ | 闸门失败应 toast |
| 4.5 | （负例，可选）临时清空 Contact 某渠道字段后刷新 | 对应渠道不可发 / 灰掉 | ☐ | 测完恢复字段 |

---

## 5. 人工 Send（Outbound）

内容建议前缀：`[MANUAL-TEST YYYY-MM-DD]`，便于事后清理。

| # | 渠道 | 步骤 | Notion / UI 期望 | 结果 | 记下 Conversation / Task ID |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Email | 选 Test Peter → Email → 填 Subject+正文 → Send | Outbound Conversation；Direction=Outbound；Channel=Email | ☐ | |
| 5.2 | LinkedIn | 同上（闸门通过时） | Outbound LI；闸门失败则不写库 | ☐ | |
| 5.3 | SMS | 同上 | Outbound SMS | ☐ | |
| 5.4 | WhatsApp | 纯文本 Send | Outbound WA | ☐ | |
| 5.5 | WhatsApp | **带 1 个媒体附件** Send | Conversation 含媒体 URL；其它渠道无附件入口 | ☐ | |
| 5.6 | Phone | 按产品路径发/记通话或脚本外联 | 有对应记录或 Task | ☐ | 与 Quo 路径区分 |
| 5.7 | 横切 | Human 模式下若有进行中 OmniReach，人工 Send 后 | OmniReach 可中止 / Handling → Human（按现网规则） | ☐ | 对照 Client Notes |

---

## 6. OmniReach Launch / Cancel

选一个**含多渠道步骤**的 Bomb（或测试 Bomb）。

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 6.1 | Brand → Launch OmniReach → 选 Bomb → 预览 | 仅**可达**渠道出现；LI 最多 1 个 cold 步 | ☐ | |
| 6.2 | 确认 Launch | Client Handling=`Automated`（或按现网）；多条 Pending Task | ☐ | 记下 run / task ids |
| 6.3 | Notion TaskDB | Channel、Scheduled At、Contact、Client 正确 | ☐ | |
| 6.4 | Cancel 未发 OmniReach | 未发 Task → `Cancelled`；已发不受影响 | ☐ | |
| 6.5 | （可选）LI 闸门刻意失败再 Launch | 预览跳过或整单失败，行为符合产品 | ☐ | |
| 6.6 | （可选）不可达渠道 | 该步不建 Task（`SKIP_UNAVAILABLE_CHANNELS`） | ☐ | |

---

## 7. Cold Inbound（`POST /api/inbound`）

每条成功后核对：

- Conversation：`Direction=Inbound`，非 Phone → `Reply Status=Needs Reply` + `Reply Due At`  
- `Follow-up Task` **为空**  
- Notes 含「客户主动来信…」  
- **新建** `threadId`（`THR-…`）  
- Client → `In Progress` + `Handling Mode=Human`  
- **不**取消同 OmniReach 未发任务  
- Slack：`inbound.received`（若通知开启）  
- Portal：对应渠道 tab 出现气泡；Brands 列表 Needs Reply 角标

### 7.A Email

```bash
curl -sS -X POST "$BASE/api/inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Email",
    "object": "[TEST] Cold inbound email",
    "content": "[MANUAL-TEST] Cold inbound via Email",
    "sender": "tzchao2025@gmail.com",
    "FollowUpClientId": "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87"
  }'
```

| # | 步骤 | 期望 | 结果 | threadId / conversationId |
| --- | --- | --- | --- | --- |
| 7.1 | 执行上方 curl | HTTP **201**；`taskId: null`；`inboxStatus: Needs Reply` | ☐ | |
| 7.2 | （可选）去掉 `FollowUpClientId`，仅 `sender` | 仍能定位到本品牌 Contact | ☐ | Email 专属 |
| 7.3 | Portal Email tab + Slack | 可见 Needs Reply；Slack 有 Inbound | ☐ | |

### 7.B LinkedIn

```bash
curl -sS -X POST "$BASE/api/inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "LinkedIn",
    "content": "[MANUAL-TEST] Cold inbound via LinkedIn",
    "FollowUpClientId": "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87",
    "sender": "linkedin.com/in/peter-tang-1830a03a2"
  }'
```

| # | 步骤 | 期望 | 结果 | threadId / conversationId |
| --- | --- | --- | --- | --- |
| 7.4 | 执行 curl | 201；Needs Reply；新 Thread | ☐ | |
| 7.5 | Portal LI tab + Slack | 同上 | ☐ | |

### 7.C SMS

```bash
curl -sS -X POST "$BASE/api/inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "SMS",
    "content": "[MANUAL-TEST] Cold inbound via SMS",
    "FollowUpClientId": "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87",
    "sender": "+16208941711"
  }'
```

| # | 步骤 | 期望 | 结果 | threadId / conversationId |
| --- | --- | --- | --- | --- |
| 7.6 | 执行 curl | 201；Needs Reply | ☐ | |
| 7.7 | Portal SMS tab + Slack | 同上 | ☐ | |

### 7.D WhatsApp

```bash
curl -sS -X POST "$BASE/api/inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "WhatsApp",
    "content": "[MANUAL-TEST] Cold inbound via WhatsApp",
    "FollowUpClientId": "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87",
    "sender": "+16208941711"
  }'
```

| # | 步骤 | 期望 | 结果 | threadId / conversationId |
| --- | --- | --- | --- | --- |
| 7.8 | 执行 curl | 201；Needs Reply | ☐ | |
| 7.9 | Portal WA tab + Slack | 同上 | ☐ | |

### 7.E Phone（Cold）

```bash
curl -sS -X POST "$BASE/api/inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Phone",
    "content": "[MANUAL-TEST] Cold inbound call note",
    "FollowUpClientId": "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87",
    "sender": "+16208941711"
  }'
```

| # | 步骤 | 期望 | 结果 | threadId / conversationId |
| --- | --- | --- | --- | --- |
| 7.10 | 执行 curl | 201；`inboxStatus: null`（**不**写 Needs Reply） | ☐ | |
| 7.11 | （可选）省略 `content` | 正文回退为 `Inbound call` | ☐ | |
| 7.12 | Portal Phone + Slack | 有记录；Slack 是否推送取决于 `NOTIFY_ON_PHONE` | ☐ | |

### 7.F Inbound 负例

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 7.13 | Email 缺 `object` | **400** | ☐ | |
| 7.14 | SMS 不传 `FollowUpClientId` | **422** | ☐ | |
| 7.15 | body 带 `taskId` | **400**（应改用 `/api/replies`） | ☐ | |
| 7.16 | `sender` 故意写错号码 | **404** | ☐ | |

---

## 8. Reply 回写（`POST /api/replies`）

前置：该渠道已有 **Task Status = Completed** 的 Outbound，并记下其 `taskId` + 系统 `threadId`（`THR-…-Channel`）。

先核对目标：

```bash
curl -sS "$BASE/api/replies/target?taskId=<TASK_ID>&threadId=<THREAD_ID>" \
  -H "Authorization: Bearer $TOKEN"
```

写入后核对：

- Inbound Conversation 挂同一 Thread / Task  
- 非 Phone：`Needs Reply` + `Reply Due At`  
- 同 OmniReach **未发** Task → `Cancelled`  
- Client → Human  
- Slack：`reply.received`（非 duplicate）  
- Portal 对应渠道出现 Needs Reply

模板（替换 `<TASK_ID>` / `<THREAD_ID>`）：

```bash
# Email
curl -sS -X POST "$BASE/api/replies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<TASK_ID>",
    "threadId": "<THREAD_ID>",
    "content": "[MANUAL-TEST] Reply via Email",
    "channel": "Email"
  }'

# LinkedIn
curl -sS -X POST "$BASE/api/replies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<TASK_ID>",
    "threadId": "<THREAD_ID>",
    "content": "[MANUAL-TEST] Reply via LinkedIn",
    "channel": "LinkedIn"
  }'

# SMS
curl -sS -X POST "$BASE/api/replies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<TASK_ID>",
    "threadId": "<THREAD_ID>",
    "content": "[MANUAL-TEST] Reply via SMS",
    "channel": "SMS"
  }'

# WhatsApp
curl -sS -X POST "$BASE/api/replies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<TASK_ID>",
    "threadId": "<THREAD_ID>",
    "content": "[MANUAL-TEST] Reply via WhatsApp",
    "channel": "WhatsApp"
  }'
```

| # | 渠道 | 步骤 | 期望 | 结果 | taskId / threadId |
| --- | --- | --- | --- | --- | --- |
| 8.1 | Email | target 核对 → replies | 201；Needs Reply；同 Thread | ☐ | |
| 8.2 | LinkedIn | 同上 | 同上；followup 闸门可放行 | ☐ | |
| 8.3 | SMS | 同上 | 同上 | ☐ | |
| 8.4 | WhatsApp | 同上 | 同上 | ☐ | |
| 8.5 | 横切 | 若有同 run 未发 Task | 未发 → Cancelled | ☐ | |
| 8.6 | 横切 | **同一 messageId 再提交** | 200 + `duplicate: true`；Slack **不再**多推 | ☐ | |
| 8.7 | 负例 | Task 未 Completed | **409** | ☐ | |
| 8.8 | 负例 | taskId 与 threadId 不匹配 | **409** | ☐ | |

### 8.Phone（补充，非主路径）

```bash
curl -sS -X POST "$BASE/api/replies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "<TASK_ID>",
    "threadId": "<THREAD_ID>",
    "callResult": "Connected",
    "channel": "Phone"
  }'
```

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 8.9 | 对 Completed Phone Task 执行 | 写 Call Result；**不**写 Reply Status | ☐ | 主路径仍以 Quo 为准 |

---

## 9. 门户内 Reply（回 Needs Reply）

对 §7 或 §8 产生的 **Needs Reply**（Email / LI / SMS / WA）：

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 9.1 | 在 Brand 详情对应渠道打开回复框 | 可输入并发送 | ☐ | |
| 9.2 | 发送后 | Outbound 挂在**被回复 Inbound 的 Thread/CP**；Needs Reply 收起/清除 | ☐ | 见 Thread/CP 规则 |
| 9.3 | Brands 列表 | Needs Reply 角标减少 | ☐ | |
| 9.4 | 四渠道各至少 1 次 | 行为一致 | ☐ | Phone 无此路径 |

---

## 10. Phone 主路径（Quo + Call Review）

匹配规则见 [Quo 电话回写匹配](./Follow-up｜Quo%20电话回写匹配.md)。当前环境仍走任务线（Call ID / 拨打记录）；按对方号码挂未关闭 Phone Task 的电话线尚未实现。

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 10.1 | 存在 Pending Phone Task（可 Launch 产生） | Tasks / Brand Phone Board 可见 | ☐ | |
| 10.2 | 用 Quo 面板拨打测试号 | 通话可发起 | ☐ | 本地注意 `QUO_*` |
| 10.3 | 通话结束 → webhook 回写 | Conversation 有通话结果 | ☐ | `/api/webhooks/quo` |
| 10.4 | Call Review：Qualified | 评审写入；状态符合产品 | ☐ | |
| 10.5 | Call Review：Unqualified → 改派 | 按现网改派规则（如 Beril） | ☐ | |
| 10.6 | （可选）testcaller 仅见测试 Phone | 与 §2.4 一致 | ☐ | |

---

## 11. 通知引擎抽检

在 §7 / §8 过程中顺带勾选；也可 `npm run notify:slack-test`。

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 11.1 | 新建 Reply（非 duplicate） | Slack 一条，类型 Reply | ☐ | |
| 11.2 | 新建 Inbound | Slack 一条，类型 Inbound | ☐ | |
| 11.3 | duplicate Reply | **不再**多推 | ☐ | |
| 11.4 | （可选）临时关 `NOTIFY_ON_REPLY` | 仅 Reply 静音，Inbound 仍推 | ☐ | 测完恢复 |
| 11.5 | Slack URL 错误或宕机（可选） | API 仍 201 落库；服务端有失败日志 | ☐ | |

---

## 12. Thread / CP 横切

| # | 步骤 | 期望 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 12.1 | Cold Inbound | **总是**新 `THR-…`；CP = Brand Current | ☐ | |
| 12.2 | Reply 回写 | Thread = Outbound Thread；CP = 被回 Outbound 的 CP | ☐ | |
| 12.3 | 门户 Reply | 跟被回 Inbound 的 Thread/CP | ☐ | |
| 12.4 | 人工改 CP 后再看历史 | 旧消息仍挂原 CP tab | ☐ | |

---

## 13. 测完清理建议

| # | 动作 | 完成 |
| --- | --- | --- |
| 13.1 | Cancel 残留 Pending OmniReach Task | ☐ |
| 13.2 | Client Handling Mode / Status 恢复到期望基线（如 Human + In Progress） | ☐ |
| 13.3 | （可选）归档或标注 `[MANUAL-TEST]` Conversation，避免污染报表 | ☐ |
| 13.4 | 恢复 ACL / 通知相关临时改动 | ☐ |

---

## 14. 进度总表（最小闭环）

全部勾完 ≈ 全面；忙碌时可先做「最小闭环」列。

| 模块 | 最小闭环 | 全面 | 我的进度 |
| --- | --- | --- | --- |
| §1 开测前 | 1.1–1.4 | +1.5–1.6 | ☐ |
| §2 ACL | 2.1–2.2 | +2.3–2.4 | ☐ |
| §3 时间线 | 每渠道 1 次 | +CP 切换 | ☐ |
| §4 可用性 | 4.1–4.4 | +4.5 | ☐ |
| §5 人工 Send | 五渠道各 1；WA+附件 | +Human 停 OmniReach | ☐ |
| §6 Launch/Cancel | Launch + Cancel | +闸门/不可达 | ☐ |
| §7 Inbound | 五渠道各 1 | +负例 + Email 仅 sender | ☐ |
| §8 Reply | Email+WA 各 1 | 四渠道 + duplicate + 负例 | ☐ |
| §9 门户 Reply | 任 1 渠道 | 四渠道 | ☐ |
| §10 Phone Quo | 拨打+回写 | +Call Review 两态 | ☐ |
| §11 通知 | 11.1–11.3 | +开关/容错 | ☐ |
| §12 Thread/CP | 12.1–12.2 | +12.3–12.4 | ☐ |

**测试人**：__________　**日期**：__________　**环境**：本地 / 预发 / 生产（勿在生产对真实客户测）

**总评**：Pass / Fail / 部分通过  
**阻塞问题**：（链接 Issue / 简述）
