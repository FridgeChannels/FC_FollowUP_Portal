# 多渠道客户外联系统｜Thread ID 与 CP 挂靠规则

## 1. 文档目标

约定系统 Thread ID（`THR-…`）何时新建 / 沿用，以及 Conversation 的 CP 如何挂靠。  
显示层：每个 CP tab **只显示打了该 CP 戳的消息**，不跨 CP 带历史。

## 2. 粒度

- Thread / 「最后一次交互」均按：**同一 Key Person（contactId）+ 同一 Channel**。
- 换人互不复用 Thread。
- 跨 CP **允许**同一 Thread 延续（Thread 与 CP 解耦）。

## 3. Thread ID 规则

「最后一次交互」= 该人该渠道下，按时间（优先 `Interaction At` / `recordedAt`，否则 `createdAt`）**最新一条** Conversation 的 `Thread ID`（Inbound / Outbound 均可）。若同渠道已有多条历史 `THR-…`，只沿用最新交互那条，不再取「最早一条」。

| 场景 | Thread |
| --- | --- |
| 新 OmniReach launch | 有历史 → 沿用最后一次交互的 Thread；无 → 新建。同一次 launch 内，同一渠道多步共用这一条 |
| 人工 Send message（非回复） | 同上：有历史沿用，无则新建 |
| 门户 Inbound「Reply」人工回信 | 沿用该条会话的 Thread（请求携带的 `threadId`） |
| `POST /api/replies` 客户回写 | 沿用对应已发 Outbound 的 Thread |
| 冷 Inbound `POST /api/inbound` | **总是新建**（无对应已发任务的新话题） |

## 4. CP 挂靠规则

| 场景 | CP |
| --- | --- |
| 新 OmniReach | **launch 当下** Brand Current CP（与任务 `Scheduled At` 无关） |
| 人工 Send（非回复） | **写入当下** Brand Current CP |
| 门户 Inbound「Reply」 | **被回复的那条 Inbound 的 CP**（无戳时回退 Brand Current） |
| `POST /api/replies` 客户回写 | **被回复的那条 Outbound 的 CP**（无 Outbound CP 时才回退 Brand Current） |
| 冷 Inbound `POST /api/inbound` | Thread 新建；**CP = Brand Current** |

原则：

1. Thread 可跨 CP 连续会话。  
2. **新外联**（OmniReach / 人工 Send 非回复）挂 Client **当前进度 CP**。  
3. **回复链**：客户 replies 跟 Outbound CP；门户人工 Reply 跟所点的那条 Inbound CP。

## 5. 与显示的关系

Activity Feed 每个 CP tab 严格按 Conversation 上的 CP 戳过滤。  
因此：在 CP3 launch / 人工发送并沿用旧 Thread 时，**新消息出现在 CP3**；同 Thread 上更早打在 CP2 的消息仍只在 CP2 可见。  
在某条 CP2 Inbound 下点 Reply，人工回信也出现在 **CP2**。

## 6. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-09-17 | 初版：最后一次交互沿用 Thread；OmniReach/人工 Send 同规则；冷 Inbound 新建；CP 规则如上 |
| 2026-09-17 | 门户 Inbound Reply 改为挂被回复 Inbound 的 CP（不再用 Brand Current） |
