# 多渠道客户外联系统｜LinkedIn 账号额度与发送闸门

## 1. 文档目标

约定 LinkedIn 冷触达在 **多发送账号、月额度、渠道带宽、同人未回不可二发** 下的控制规则；划分 **本 Portal / Notion** 与 **第三方发送工具** 的职责边界。

本文只做产品与接口约定。**真实 LinkedIn 投递、账号登录态、第三方工具内的队列与重试，一律不在本仓库实现。**

## 2. 已确认决策

| 项 | 定案 |
| --- | --- |
| 账号策略 | 自然月内 **串行** 用完 3 个账号各自的月额度；任意时刻 **全局唯一活跃发送账号** |
| 月额度 | 每账号每月 **15** 条；仅计 **冷触达** |
| 已回复后的跟进 | **不扣** 月额度，**不占** LinkedIn Daily Max / Time interval |
| 同人闸门 | 粒度 = **Key Person（联系人）**；对方未回复前，禁止对该人再发第二封 LinkedIn |
| 人工 Send message | 与 OmniReach / 自动创建 **同一套闸门**（活跃号 + 月额度 + 同人规则） |
| 真发执行 | **第三方工具**；本仓只负责任务创建、预检、Sender 绑定、额度账本、回写契约 |
| 额度扣减 | **创建冷触达任务即预扣**；任务 **Cancelled 则释放** |
| Failed | **不释放** 月额度（避免失败重试刷额度）；是否人工补额度另议 |
| 跟进 Sender | **优先沿用该联系人上一封冷触达的 Sender**；若该账号本月已 Exhausted / Paused，则改绑当前 `activeAccountId` |

## 3. 发送账号清单

初始三个 LinkedIn 发送账号（展示名即 Sender 标识，后续可再补平台侧 handle / 内部 id）：

| 顺序（建议串行） | Sender 展示名 | 月冷触达额度 | 初始角色 |
| --- | --- | --- | --- |
| 1 | Paula LIU | 15 | Active（默认首个活跃号） |
| 2 | Billy HAO | 15 | Standby |
| 3 | Ella ZHANG | 15 | Standby |

全队自然月冷触达上限 = **3 × 15 = 45**（串行用完，非三账号并行）。

## 4. 职责边界（必读）

### 4.1 本仓库（Portal / Notion）负责

1. 维护 LinkedIn 发送账号配置与全局 `activeAccountId`。
2. 创建 LinkedIn Task / Outbound Conversation 前的统一预检（人工与自动共用）。
3. 冷触达创建时预扣月额度；Cancelled 时释放。
4. 将 `Sender` 写为当前活跃账号（或跟进规则下的账号名）。
5. 标记 `outreachKind`：`cold` | `followup_after_reply`。
6. 冷触达继续遵守现有 ChannelCapacityDB 的 LinkedIn **Daily Max** 与 **Time interval**；跟进不占该带宽。
7. 通过既有 Reply / Inbound 回写接口接收客户回复，从而打开「可跟进」闸门。
8. 提供第三方可读取的任务字段约定（见第 9 节）；**不实现** 第三方侧的拉取 Worker、浏览器自动化或 LinkedIn API 调用。

### 4.2 本仓库明确不负责（第三方工具负责）

下列能力 **不得** 在本项目中实现，由第三方发送工具独立完成：

1. 使用 LinkedIn 账号登录态 / Cookie / OAuth 真正发出消息。
2. 消费 Pending 任务并执行投递、重试、投递结果上报到 LinkedIn 原生会话。
3. 在工具内维护发送队列、并发、账号轮询或「假装三账号并行」。
4. 连接请求、InMail 产品形态差异、平台风控绕过等。

第三方只应：

- 读取本系统中 **可发送** 的 LinkedIn 任务（`Sender` = 当前活跃号，状态允许发送）；
- 按 `Scheduled At` 节奏发送；
- 发送成功后将对应 Follow-up Task 的 **Task Status 标为 Completed**（本系统 Reply 回写依赖该门闩）；
- 失败时将 Task 标为 Failed（或不改状态并人工处理），**不要自动切换** 本系统的活跃账号。

账号切换（额度用尽或人工指定）只由本系统账号配置完成；第三方 **不得** 自行在 Paula LIU / Billy HAO / Ella ZHANG 之间轮询。

## 5. 账号状态与串行轮换

### 5.1 账号状态

| Status | 含义 |
| --- | --- |
| Active | 当前唯一允许绑定新冷触达的发送号 |
| Standby | 候补；本月额度未用尽，等待成为 Active |
| Exhausted | 本月冷触达额度已用尽 |
| Paused | 人工暂停，不参与自动轮换 |

全局约束：任意时刻至多 **一个** Active。

### 5.2 轮换规则

```
Paula LIU (Active) 用尽本月 15
  → Paula LIU = Exhausted
  → Billy HAO = Active
Billy HAO 用尽
  → Ella ZHANG = Active
Ella ZHANG 用尽
  → 本月不再创建新的 LinkedIn 冷触达
  → 仍允许「已回复」联系人的 followup_after_reply（不扣额度、不占带宽）
```

- 默认切换条件：**当前 Active 的 `monthlyUsedCold` 达到 15**，或 **人工强制切换**。
- **发送 Failed 不自动切号。**
- 自然月开始：各账号 `monthlyUsedCold` 清零；Exhausted 可回到 Standby；Active 可由人工指定或按顺序恢复为首个 Standby。

## 6. 冷触达 vs 跟进

| 场景 | `outreachKind` | 扣月额度 | 占 Daily Max / 间隔 | 是否允许 |
| --- | --- | --- | --- | --- |
| 对某 Key Person 的首封冷 LinkedIn | `cold` | 是（创建预扣） | 是 | 有 Active 且额度与日带宽足够，且同人闸门通过 |
| 同人尚未 LinkedIn 回复再发 | — | — | — | **禁止** |
| 同人已有 LinkedIn Inbound 后的跟进 | `followup_after_reply` | 否 | 否 | 允许 |
| Task Cancelled（曾为 cold） | — | 释放预扣 | 不再占用当日容量 | — |

「已回复」判定：该 **Key Person** 在 Channel = LinkedIn 下，至少存在一条 **Inbound** Conversation（经 `/api/replies` 或 `/api/inbound` 写入）。

## 7. 同人闸门（Key Person）

作用域：`contactId`（Key Person）+ Channel = LinkedIn。  
**不是** Brand 粒度：同一客户下另一联系人仍可各自发一封冷信（各扣额度）。

禁止新建 `cold`，若满足任一：

1. 该联系人已存在 **非 Cancelled** 的 LinkedIn 冷触达 Task / 对应 Outbound，且尚无该联系人的 LinkedIn Inbound；或  
2. 该联系人已存在 **Pending** 或 **In Progress** 的 LinkedIn Task（防止双排、双发）。

仅当该联系人已有 LinkedIn Inbound 时，才允许创建 `followup_after_reply`。

## 8. 额度账本

```
创建 outreachKind = cold 的 LinkedIn Task
  → 要求存在 Active 账号且 monthlyUsedCold < 15
  → monthlyUsedCold += 1
  → Task / Conversation.Sender = Active 账号展示名
  → 记录 senderAccount 与 countsAgainstQuota = true

Task Status → Cancelled（且曾预扣）
  → monthlyUsedCold = max(0, monthlyUsedCold - 1)
  → 释放对该日 LinkedIn Daily Max 的占用（与现有 Cancelled 不占容量一致）

Task Status → Completed / Failed
  → 月额度不退
```

`followup_after_reply`：创建与取消均 **不修改** `monthlyUsedCold`，也 **不计入** LinkedIn Daily Max。

统计占用冷额度的任务：Channel = LinkedIn、`outreachKind = cold`、Status ≠ Cancelled。

## 9. 创建预检顺序（人工 + 自动共用）

对任意 LinkedIn 任务创建请求（含人工 Send message、OmniReach / launch）：

1. 解析目标 Key Person；无有效 LinkedIn 联系方式则拒。  
2. 判定 `outreachKind`：无该人 LinkedIn Inbound → 只能走 `cold`；已有 Inbound → 可走 `followup_after_reply`。  
3. 若 `cold`：存在 Active 账号且 `monthlyUsedCold < 15`；否则拒（可提示切换或等待下月）。  
4. 同人闸门（第 7 节）通过。  
5. 若 `cold`：按现有排班引擎检查 LinkedIn Daily Max、Time interval、美东工作窗；若 `followup_after_reply`：跳过 Daily Max / 间隔占用。  
6. 写入 Task + Outbound；`cold` 立即预扣额度；`Sender` 按第 2 节规则绑定。  

Manual / P0 **不得** 绕过上述 LinkedIn 闸门与冷触达月额度（可与历史「人工绕过 Daily Max」行为区分：LinkedIn 以本文为准）。

## 10. 第三方工具对接约定

本仓库 **不实现** 下列拉取 Worker；仅约定第三方应遵守的契约。

### 10.1 建议读取字段

| 字段 | 说明 |
| --- | --- |
| `taskId` | Follow-up Task 页面 ID 或标题 |
| `scheduledAt` | 计划发送时刻 |
| `sender` / `senderAccountId` | 必须等于本系统当前 Active（冷触达）；跟进按第 2 节 |
| `outreachKind` | `cold` 或 `followup_after_reply` |
| 联系人 LinkedIn | Key Person 的 LinkedIn URL / handle |
| 正文 | Outbound Conversation 内容 |
| `threadId` | 系统线程 ID（如 `THR-…-LinkedIn`），回写时复用 |

### 10.2 第三方行为约束

1. **只发送** `Sender` 匹配本系统当前 Active 账号（冷触达）的任务；不要并行使用三个账号。  
2. 发送成功 → Task Status = **Completed**。  
3. 客户回复经既有 Reply / Inbound 接口回写；`threadId` 等约定见 `docs/Follow-up｜Reply 回写接口.md` 与 `docs/Follow-up｜Inbound 回写接口.md`。  
4. 不要在第三方维护第二套「月 15」账本作为权威源；权威在本系统账号额度。第三方可做本地限速，但不得与本系统 Active / 额度冲突。

## 11. 与现有排班文档的关系

- `docs/Follow-up｜V1 排班引擎规划.md` 仍成立：Channel Daily Max **按渠道全局**，不按账号拆分日容量。  
- 本文在 LinkedIn 上 **额外** 增加：账号月额度、唯一 Active、同人未回不可二发、冷/跟进分流。  
- 排班引擎 **仍不** 替代账号额度账本；账号额度由 LinkedIn 闸门（本系统配置层）维护，排班只处理日历带宽。  
- 对 `outreachKind = followup_after_reply`：不占用 ChannelCapacityDB 的 LinkedIn Daily Max。

## 12. 数据配置

Notion 库：**FC3.0-Follow-up-LinkedInAccountDB**  
数据库 ID（默认）：`2ea248ed-37c4-42ec-8591-699f336a3ee7`  
可用环境变量覆盖：`NOTION_FOLLOWUP_LINKEDIN_ACCOUNT_DB_ID`

| 字段 | 说明 |
| --- | --- |
| Account Name | 与 Sender 一致：Paula LIU / Billy HAO / Ella ZHANG |
| Monthly Quota | 默认 15 |
| Monthly Used Cold | 当前自然月（美东）已预扣的冷触达数 |
| Status | Active / Standby / Exhausted / Paused |
| Sort Order | 串行顺序（Paula=1, Billy=2, Ella=3） |
| Quota Month | `YYYY-MM`（美东）；跨月自动清零 Used |
| Notes | 中文备注 |

**Task Notes 机器行（本仓已写入）：**

```
[LI_GATE] outreachKind=cold|followup_after_reply;senderAccount=Paula LIU;countsAgainstQuota=1|0
```

Conversation.`Sender` 写发送账号展示名（不再用 Portal 登录邮箱冒充 LinkedIn Sender）。

## 13. 本仓已实现范围

1. LinkedInAccountDB 读写、月度重置、Active 串行晋升。  
2. 人工 Send message 与 OmniReach launch 的统一预检与冷额度预扣。  
3. Task 取消时按 Notes 中的 `countsAgainstQuota` 释放额度。  
4. 同人未回不可二发；跟进不占 Daily Max（排班占用统计会跳过 followup）。  
5. **未实现** 第三方 LinkedIn 真发 Worker（见第 4.2 节）。

## 14. 实现阶段建议（后续）

1. 确认 Notion Integration 已连接 `FC3.0-Follow-up-LinkedInAccountDB`。  
2. Admin UI 展示三账号额度 / 强制切号（可选）。  
3. 与第三方对齐拉取字段（第 10 节）；本仓最多提供只读查询，**不写发送 Worker**。

## 15. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-09-17 | 初版：串行 3×15、Key Person 闸门、创建预扣/取消释放、第三方职责排除；账号 Paula LIU / Billy HAO / Ella ZHANG |
| 2026-09-17 | 落地 Notion 账号库与本仓闸门实现；补充 Task Notes `[LI_GATE]` 约定 |
