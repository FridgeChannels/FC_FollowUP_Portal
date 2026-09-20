# 多渠道客户外联系统｜V1 数据架构规划

## 1. 项目背景

当前需要管理约 100 家客户，由 5 位 Owner 负责，通过 Email、LinkedIn、SMS、WhatsApp、Phone 五个渠道，在周一至周五完成外联和跟进。

V1 阶段先建立清晰、可执行、可扩展的数据基础。

### 1.1 字段命名规范

- 所有数据库字段名称统一使用英文，并采用清晰、稳定的 Title Case 命名。
- 所有 Status 和 Select 选项统一使用英文。
- 每个状态和选项必须附有中文定义，明确使用条件和业务含义。
- 所有 `Notes` 字段的实际备注内容必须使用中文。
- 客户名称、人员姓名、邮件主题、消息原文及外部系统 ID 保留其原始语言和格式。

## 2. V1 数据架构结论

第一版采用四层执行数据库，并增加 Scenario、Bomb、Template 和渠道容量配置数据库：

1. **Follow-up ClientDB**：管理当前进入跟进范围的客户、Owner 和客户级推进状态。
2. **Follow-up ContactDB**：管理本轮实际选择的联系人及人员级跟进状态。
3. **Follow-up TaskDB**：管理未来要执行的渠道动作、时间、Owner 和任务状态。
4. **Follow-up ConversationDB**：管理待发送内容，以及实际发生的发送、接收、电话和回复记录。
5. **Follow-up ScenarioDB**：定义业务外联场景；一个 Scenario 可以向下关联多个 Bomb。
6. **Follow-up BombDB**：定义场景下的具体外联方案；每个 Bomb 最多属于一个 Scenario，并可关联多个渠道 Template。
7. **Follow-up TemplateDB**：统一管理五个渠道使用的消息模板、电话话术和语音信箱话术。
8. **Follow-up ChannelCapacityDB**：维护五个渠道每个工作日允许排入的最大任务数量。

核心原则：

> ClientDB 和 KeyPersonDB 是主数据；Follow-up ClientDB 和 Follow-up ContactDB 定义本轮执行范围；Follow-up ScenarioDB 组织业务场景；Follow-up BombDB 定义场景下的外联方案；Follow-up TemplateDB 提供五个渠道的标准内容；Follow-up ChannelCapacityDB 提供每日渠道容量约束；Follow-up TaskDB 记录计划；Follow-up ConversationDB 管理消息内容和实际互动状态。
> 

## 3. 数据流与表关系

```
ClientDB / KeyPersonDB
        ↓ 选择进入跟进
Follow-up ClientDB / Follow-up ContactDB
        ↓ 选择场景与方案
Follow-up ScenarioDB ── 1:N ──→ Follow-up BombDB
        ↓                         ↓ N:M
        └────────────────→ Follow-up TemplateDB
                                  ↓ 生成计划与内容
Follow-up ChannelCapacityDB ── 每日渠道上限 ──→ Follow-up TaskDB
                                  ↓ 执行
                        Follow-up ConversationDB
```

主要关系：

- 一个 ClientDB 客户对应一条 Follow-up Client 记录。
- 一个 Follow-up Client 可以关联多个 Follow-up Contact。
- 一个 Follow-up Contact 可以关联多条 Follow-up Task 和 Interaction。
- 一个 Scenario 可以关联多个 Bomb；每个 Bomb 最多关联一个 Scenario。
- 一个 Bomb 可以关联多个 Template；一个 Template 也可以被多个 Bomb 复用。
- Template 通过 Channel 区分 Email、LinkedIn、SMS、WhatsApp 和 Phone 五个渠道。
- Follow-up Task 和 Interaction 通过 Follow-up Contact 归属到 Follow-up Client。
- 一条 Follow-up Task 执行后，可以关联一条或多条 Conversation Record。
- Follow-up Task 的 Template 和 Follow-up ConversationDB 的 Template Used 均为可选字段。
- 未选择模板时，Owner 可以纯人工规划任务并直接编辑 Content。
- Follow-up ChannelCapacityDB 不与 Task 建立 Relation；排班引擎按照 Channel、Scheduled At 和 Task Status 动态计算每日剩余容量。

## 4. Follow-up ClientDB

### 4.1 作用

管理当前进入跟进范围的客户，以及客户级 Owner、推进状态、Handling Mode、Current CP 和最近互动。Portal Brands 列表以本库为一行一条记录，品牌名从关联 Client 读取。

数据库名称：**FC3.0-Follow-up-ClientDB**

### 4.2 V1 字段

| Field Name | Type | 必填 | 中文说明 |
| --- | --- | --- | --- |
| Follow-up Client | Title | 是 | 系统根据关联的 Client 生成，仅作为记录标题 |
| Client | Relation | 是 | 关联 ClientDB，原则上一条记录只对应一个客户 |
| Follow-up Contacts | Relation | 否 | 关联 Follow-up ContactDB，可关联多人 |
| Owner | Relation | 是 | 关联 FC3.0-Follow-up-OwnerDB；每条客户最多关联一个 Owner |
| Follow-up Status | Status | 是 | 客户整体跟进状态；选项见 4.3 |
| Handling Mode | Select | 是 | Automated / Human，表示客户级主要跟进方式；选项见 4.4 |
| Current CP | Select | 是 | 本地字典单选：NONE / CP1 / CP2 / CP3；记录最近已经完成的 CP，默认 NONE |
| Priority | Select | 否 | P0 / P1 / P2，表示客户处理优先级 |
| Is Test | Checkbox | 否 | 勾选表示测试/联调客户；Admin / Caller 在 Portal 隐藏该客户及其 Task；AccountManager / 允许名单账号仍可见；Inbound/Reply 回写不拦截 |
| Last Interaction At | Rollup | 否 | 从关联 Follow-up Contacts 汇总最近一次实际互动时间 |
| Last Reply At | Rollup | 否 | 从关联 Follow-up Contacts 汇总最近一次入站回复时间 |
| Notes | Text | 否 | 客户级补充信息； |
| Created At | Created time | 自动 | 系统自动记录创建时间 |
| Last Edited At | Last edited time | 自动 | 系统自动记录最后修改时间 |

### 4.3 Follow-up Status

```
Unassigned
Ready
In Progress
Paused
Completed
Terminated
```

状态定义：

- **Unassigned**：客户已进入跟进范围，但尚未分配 Owner。
- **Ready**：Owner、联系人以及必要的执行配置已经完成，可以启动跟进。
- **In Progress**：客户正在推进，包括自动执行、等待回复和人工处理。
- **Paused**：本轮跟进暂时停止，未来预计恢复。
- **Completed**：本轮客户跟进目标已经达成。
- **Terminated**：目标尚未达成，但已决定停止本轮推进。

### 4.4 Handling Mode

```
Automated
Human
```

选项定义：

- **Automated**：客户主要由系统根据 Scenario、Bomb、排班和渠道可用性自动推进。
- **Human**：客户主要由 Owner 人工判断和执行后续动作，系统不再自动生成该客户的标准跟进任务。

Handling Mode 与 Follow-up Status 相互独立。切换 Handling Mode 时不改变客户的 Follow-up Status；处于 In Progress 的客户可以在 Automated 和 Human 之间切换。

### 4.5 Current CP

Current CP 只记录该客户**最近已经完成的 CP**，默认值为 `NONE`。只有同时满足对应完成标准并具备可核验的 Evidence 后，才能更新。

CP1–CP3 与 NONE 全部使用 Portal 本地字典，不再查询或回写 FC3.0-Follow-up-CPDictionaryDB。Follow-up ClientDB 的 Current CP、OmniReachDB 的 CP 都是 Select 单选字段，选项名称与本地字典短名称一致。

#### 4.5.1 本地字典

Portal 本地字典是 Current CP / Applicable CP 的唯一来源。Notion 只保存 Select 选项值，不保存 Full Name、中文定义或完成标准。

规则：

- 每个 CP 标准值只保留一条字典记录，Name 必须唯一。
- Name 和 Full Name 使用英文，其他说明内容使用中文，必要的业务术语可保留英文。
- Follow-up ClientDB 的 Current CP 是 Select 单选：`NONE` / `CP1` / `CP2` / `CP3`。
- OmniReachDB 的 CP 是 Select 单选：`CP1` / `CP2` / `CP3`，表示该方案适用的阶段。
- 只有 Completion Criteria 全部满足且 Evidence 可核验时，才能将客户的 Current CP 更新为对应选项。

| Name | Full Name | 中文定义 | 完成标准 | Evidence |
| --- | --- | --- | --- | --- |
| NONE | No CP Completed | 尚未完成任何 CP。 | 没有任何一个 CP 达到完整完成标准。 | 无 |
| CP1 | Post-Tap Brand Experience Delivered | 品牌定制的 Post-tap 体验已经完成，并已交付给 Connector 或 Owner 实际体验。 | Brand Customized Post-tap 已完成；Connector 或 Owner 已收到 FC 产品；对方可以实际 Tap 并访问该品牌体验。 | 体验链接、测试记录、交付对象、交付日期 |
| CP2 | Sample Delivered to Owner | 正确 Owner 已经识别并收到 Sample，同时已具备后续直接推进所需的必要联系方式。 | 正确 Owner 已识别；Owner 已收到 Sample；Owner Fire Cover Complete。 | Owner 身份记录、联系人信息、引荐记录、签收或确认记录 |
| CP3 | Owner Input & Plan Review Completed | Owner 的业务目标及必要输入已经收集完成，并形成可进入 Review 的客户专属 Plan。 | Business Objective 已确认；必要业务流程、事实和限制已记录；AI 已生成客户专属 Plan；FC 已完成人工审核；Plan 已达到可进入 Review 的完整度。 | Guided Input 记录、Plan 版本、FC Review 记录 |

Current CP 使用规则：

- Current CP 记录最近完成的里程碑，不记录正在进行但尚未完成的阶段。
- 不允许只因开始某项工作就提前更新 Current CP。
- 更新 Current CP 时，必须保留对应 Evidence。
- Current CP 与 Follow-up Status 相互独立；客户可以处于 In Progress，同时拥有任意一个已完成的 Current CP。

### 4.6 Priority

```
P0
P1
P2
```

选项定义：

- **P0**：最高优先级，需要优先分配资源和执行任务。
- **P1**：标准优先级，按照正常排班推进。
- **P2**：较低优先级，在 P0 和 P1 之后安排。

## 5. Follow-up ContactDB

### 5.1 作用

记录本次跟进实际选择了哪个 Key Person，以及当前与该人员的跟进状态和跟进方式。

数据库名称：**FC3.0-Follow-up-ContactDB**

### 5.2 V1 字段

| Field Name | Type | 必填 | 中文说明 |
| --- | --- | --- | --- |
| Follow-up Contact | Title | 是 | 系统根据 Key Person 和 Follow-up Client 生成，仅作为记录标题 |
| Follow-up Client | Relation | 是 | 关联 Follow-up ClientDB |
| Key Person | Relation | 是 | 关联 KeyPersonDB，原则上一条记录只对应一个 Key Person |
| Owner | Rollup | 自动 | 从 Follow-up Client 读取当前 Owner |
| Follow-up Status | Status | 是 | 该人员当前的跟进状态；选项见 5.3 |
| Follow-up Mode | Select | 是 | Automated / Manual，默认值为 Automated |
| Contact Order | Select | 否 | Primary / Secondary / Backup，仅表示本轮跟进中的执行顺序 |
| Last Interaction At | Rollup | 否 | 从关联 Interaction 中汇总最近一次实际互动时间 |
| Last Reply At | Rollup | 否 | 从 Inbound Interaction 中汇总最近一次回复时间 |
| Interactions | Relation | 自动 | 与 Follow-up ConversationDB 双向关联 |
| Follow-up Tasks | Relation | 自动 | 与 Follow-up TaskDB 双向关联 |
| Notes | Text | 否 | 人员级补充信息；备注内容必须使用中文 |
| Created At | Created time | 自动 | 系统自动记录创建时间 |
| Last Edited At | Last edited time | 自动 | 系统自动记录最后修改时间 |

### 5.3 Follow-up Status

```
Not Contacted
In Progress
Completed
Terminated
```

状态定义：

- **Not Contacted**：人员已进入 Follow-up ContactDB，但尚未执行任何 Follow-up Task。
- **In Progress**：正在通过自动或人工方式推进；发生回复或转为人工处理后仍属于此状态。
- **Completed**：对该人员的本轮跟进目标已经完成，不再需要继续生成任务。
- **Terminated**：本轮跟进目标尚未完成，但已决定停止对该人员继续推进；拒绝、失联、联系人错误等具体原因写入中文 Notes。

### 5.4 Follow-up Mode

```
Automated
Manual
```

选项定义：

- **Automated**：系统可以根据排班和渠道可用性生成并执行标准 Follow-up Task。
- **Manual**：由 Owner 人工判断和执行后续动作，系统不再自动生成标准 Follow-up Task。

从 Automated 切换为 Manual 时，只更新 Follow-up Mode，不改变 Follow-up Status；人员仍保持 In Progress。如需恢复自动化，可将 Follow-up Mode 重新改为 Automated。

### 5.5 Contact Order

```
Primary
Secondary
Backup
```

选项定义：

- **Primary**：本轮优先推进的主要联系人。
- **Secondary**：主要联系人无法推进或需要并行沟通时使用的次要联系人。
- **Backup**：前两级联系人均不可推进时使用的备用联系人。

## 6. Follow-up TaskDB

### 6.1 作用

Follow-up TaskDB 只负责按日排班与任务分配，记录由谁在哪个工作日、通过什么渠道，对哪位联系人执行跟进任务。

任务表不保存发送内容、回复内容或电话沟通内容；这些实际互动内容统一写入 Follow-up ConversationDB。

数据库名称：**FC3.0-Follow-up-TaskDB**

### 6.2 V1 字段

| Field Name | Type | 必填 | 中文说明 |
| --- | --- | --- | --- |
| Follow-up Task | Title | 是 | 建议格式：客户—人员—渠道—计划日期 |
| Follow-up Contact | Relation | 是 | 关联 Follow-up ContactDB；客户归属通过 Follow-up Contact 获取 |
| Owner | Person | 是 | 实际执行负责人 |
| Creation Method | Select | 是 | Automated / Manual，记录任务创建时的来源 |
| Template | Relation | 否 | 可选关联 Follow-up TemplateDB；纯人工任务可以留空 |
| Scheduled At | Date | 是 | 计划发送时刻（精确到分钟的 datetime，时区 America/New_York）；历史仅到天的值按当日 09:00 ET 参与间隔计算 |
| Priority | Select | 否 | P0 / P1 / P2；相同时间窗口内用于决定处理顺序 |
| Channel | Select | 是 | Email / LinkedIn / SMS / WhatsApp / Phone |
| Task Status | Status | 是 | 任务当前状态；选项见 6.3 |
| Source Bomb | Relation | 否 | 关联生成该任务的 OmniReach（Follow-up BombDB）模板；非 OmniReach 任务可留空 |
| OmniReach Run Id | Text | 否 | 同一次 Launch 生成的所有 Task 共享同一 UUID；用于区分停后再启的多次执行；Plan 按此字段分组 |
| Call Review Status | Select | 否 | 仅 Phone Task；`Awaiting Review` / `Qualified` / `Unqualified`；Quo 回写 `Call Result = Connected` 时自动写入 Awaiting Review 并将 Task Status→Completed；Account Manager 评审后写入 Qualified / Unqualified；Qualified 保持 Completed，Unqualified 时 Task Status→Pending、Owner→Beril、Priority→P0 |
| Call Review Reason | Text | 否 | 仅 Phone；最新一轮 Unqualified 原因；标记 Qualified 时清空 |
| Call Qualified At | Date | 否 | 仅 Phone；最近一次标记 Qualified 的时间；标记 Unqualified 时清空 |
| Call Review History | Text | 否 | 仅 Phone；多轮评审结构化 JSON（轮次、状态、评审人、reason、callIds 等）；不得写入 Notes |
| Interactions | Relation | 否 | 关联实际产生的 Interaction |
| Ended At | Date | 否 | 任务变为 Completed、Failed 或 Cancelled 时写入 |
| Notes | Text | 否 | 记录失败、取消或渠道不可用等原因；备注内容必须使用中文；不含 Call Review 结构化历史 |
| Created At | Created time | 自动 | 系统自动记录创建时间 |
| Last Edited At | Last edited time | 自动 | 系统自动记录最后修改时间 |

### 6.3 Task Status

```
Pending
In Progress
Completed
Failed
Cancelled
```

状态定义：

- **Pending**：任务已生成，等待 Owner 或自动化执行。
- **In Progress**：任务正在处理，尚未形成最终结果。
- **Completed**：渠道动作已经实际执行；发送内容和具体结果记录在 Follow-up ConversationDB。
- **Failed**：联系方式缺失、渠道不可用、发送失败或拨打失败等导致任务未成功执行；具体原因写入中文 Notes。
- **Cancelled**：因客户回复、人工接管或计划调整而不再需要执行；具体原因写入中文 Notes。

### 6.4 Call Review Status

仅 Phone 任务使用。

- **Awaiting Review**：Quo 回写 `Call Result = Connected` 后自动写入；同时将 Task Status 设为 Completed（结束 Pending），表示通话已执行、等待 Account Manager 评审。
- **Qualified**：通话合格；Task Status 保持 / 设为 Completed，写入 Ended At 与 `Call Qualified At`，并清空 `Call Review Reason`。
- **Unqualified**：通话不合格、需召回；同时将 Task Status 设为 Pending、Owner 改派给 Beril（`beril@fridgechannels.com`）、Priority 设为 P0；写入 `Call Review Reason`，并清空 `Call Qualified At`。召回后若再次 Connected，会重新进入 Awaiting Review。

该字段写在 TaskDB（不是 ConversationDB），因为评审结论驱动的是任务闭环与召回改派，而不是单条消息内容。多轮评审详情写入 `Call Review History`，不再嵌入 Notes。

### 6.5 Creation Method

```
Automated
Manual
```

选项定义：

- **Automated**：任务由系统按照排班和渠道可用性自动创建。
- **Manual**：任务由 Owner 或其他团队成员人工创建。

### 6.6 Channel

```
Email
LinkedIn
SMS
WhatsApp
Phone
```

选项定义：

- **Email**：通过 KeyPersonDB 中记录的有效邮箱执行。
- **LinkedIn**：通过 KeyPersonDB 中记录的有效 LinkedIn 账号执行。
- **SMS**：通过 KeyPersonDB 中记录且支持短信的电话号码执行。
- **WhatsApp**：通过 KeyPersonDB 中记录且已确认可用的 WhatsApp 号码执行。
- **Phone**：通过 KeyPersonDB 中记录的有效电话号码执行拨打任务。

## 7. Follow-up ConversationDB

### 7.1 作用

统一管理待发送消息和真实发生的互动，包括：

- 待发送的消息内容
- 已发出的消息
- 已收到的消息
- 电话拨打及结果
- 发送失败或退信
- 拒绝、退订和停止联系相关的原始互动记录

本系统新建独立的 Follow-up ConversationDB；现有 **FC3.0-InteractionHistoryLOG** 保留，不直接修改，避免影响既有数据和流程。

数据库名称：**FC3.0-Follow-up-ConversationDB**

### 7.2 V1 字段

| Field Name | Type | 必填 | 中文说明 |
| --- | --- | --- | --- |
| Conversation Record | Title | 是 | 完整对话记录标题，建议格式：客户—人员—渠道—记录类型 |
| Conversation Record ID | Text | 是 | 完整对话记录的系统唯一 ID |
| Thread ID | Text | 否 | 同一联系人、同一渠道、同一场对话共用的会话线程 ID |
| Message ID | Text | 否 | 渠道提供的单条消息 ID |
| Follow-up Contact | Relation | 是 | 关联 Follow-up ContactDB；客户归属通过 Follow-up Contact 获取 |
| Follow-up Task | Relation | 否 | 关联触发本次互动的 Follow-up Task；Inbound 无对应任务时可留空 |
| Template Used | Relation | 否 | 可选关联 Follow-up TemplateDB；纯人工编辑内容时可以留空 |
| Channel | Select | 是 | Email / LinkedIn / SMS / WhatsApp / Phone |
| Direction | Select | 是 | Outbound / Inbound |
| Subject | Text | 否 | Email 主题；其他渠道可留空 |
| Content | Text | 否 | 实际待发送、已发送或已收到的完整内容 |
| Scheduled At | Date | 否 | 计划发送时刻（精确到分钟的 datetime，时区 America/New_York）；由排班引擎生成，写入格式与 TaskDB 一致。Outbound Pending 必填；Inbound / 纯实际互动记录可留空 |
| Interaction At | Date | 否 | 实际发送、收到或通话发生的时间；Pending 时留空 |
| Sender | Text | 否 | 发件账号、发送号码、LinkedIn 账号或拨打人 |
| Message Status | Select | 否 | Pending / Sent / Received / Failed；Phone 可留空 |
| Reply Status | Select | 否 | 仅 Inbound：Needs Reply / Replied。表示这封客户来信是否已人工回复 |
| Reply Due At | Date | 否 | 仅 Inbound 且 Needs Reply：最晚应人工回复的时间。由排班容量逻辑在入库时写入：默认 Interaction At + 24 小时（落到工作日）；若该日渠道 Daily Max 已满，则顺延到最近有剩余带宽的工作日。Phone 或不需要回复的记录留空 |
| CP | Relation | 否 | 关联 FC3.0 CheckPoint DB，记录该条消息发送或收到当时客户所处的 CP。用于还原当时阶段，禁止用客户当前 CP 回填历史消息 |
| Call Result | Select | 否 | Connected / No Answer / Voicemail / Declined / Invalid Number；仅 Phone 使用 |
| Source URL | URL | 否 | 打开原始渠道会话或消息的链接 |
| Notes | Text | 否 | 补充互动异常、失败原因或人工判断；备注内容必须使用中文 |
| Created At | Created time | 自动 | 系统自动记录创建时间 |
| Last Edited At | Last edited time | 自动 | 系统自动记录最后修改时间 |

### 7.3 Direction

```
Outbound
Inbound
```

选项定义：

- **Outbound**：由 FC 团队或自动化向客户发出的消息或电话。
- **Inbound**：由客户向 FC 团队发回的消息或来电。

### 7.4 Message Status

```
Pending
Sent
Received
Failed
```

状态定义：

- **Pending**：Outbound 内容已经生成，但尚未实际发送；Interaction At 留空。
- **Sent**：Outbound 消息已经实际发送；Interaction At 写入实际发送时间。
- **Received**：Inbound 消息已经实际收到；Interaction At 写入实际接收时间。
- **Failed**：Outbound 消息尝试发送但未成功；失败详情保留在中文 Notes 或渠道原始记录中。

### 7.5 Reply Status

```
Needs Reply
Replied
```

仅 Inbound 使用。Outbound 留空。

状态定义：

- **Needs Reply**：客户来信已入库，等待人工回复。Portal 在对应联系人会话下显示回复框。
- **Replied**：已有人工 Outbound 接到这封 Inbound 的同一 Task / Thread。Portal 收起该条回复框。

客户再次来信时，新的 Inbound 重新写入 `Needs Reply`，不影响上一封已标记 `Replied` 的记录。

### 7.6 CP

Conversation 的 `CP` 是 Relation，关联 **FC3.0 CheckPoint DB** 中的一条 CheckPoint 记录。Portal 读取关联标题后映射为 CP1 / CP2 / CP3。

每条 Conversation 必须记录**发生当时**的客户 CP，而不是客户此刻的 Current CP。

- Outbound：写入发出（或生成待发记录）时 Follow-up Client 的 Current CP 对应 CheckPoint。
- Inbound：写入收到时 Follow-up Client 的 Current CP 对应 CheckPoint。
- Current CP 为 NONE 时不写 `CP`。
- 历史记录若未关联 CheckPoint，不得归入当前 CP 时间线。
- CP 是客户完整生命周期；渠道消息不能默认归属到当前 CP。

### 7.7 Portal Brand activity

Brand activity 按以下结构展示，OmniReach 执行计划不是对话的唯一骨架：

1. **CP 选项卡**（CP1 / CP2 / CP3）：客户生命周期阶段，仅可查看已到达或当前阶段。各 CP 时间线内容相互独立，按 Conversation 发生当时 stamp 的 CP 归属，不得互相覆盖。
2. **渠道选项卡**（Email / LinkedIn / SMS / WhatsApp / Phone）。
3. **联系人 / Thread**：同一联系人、同一渠道、**同一场对话**共用 Thread ID，完整展示该场对话内的 OmniReach 发出、客户回复、人工跟进。跨 CP 的新 OmniReach run 按「本次 run × 渠道」分配新 Thread（同 run 内同渠道多步仍共用），非 reply 的人工外联也开新 Thread；Inbound / Reply 回写仍跟所回复消息的 Thread。
4. **OmniReach execution plan**：独立按钮打开，不塞进对话时间线当唯一结构。

每条消息展示发给谁 / 谁回复、时间、人工或 OmniReach。回复框挂在仍为 `Needs Reply` 的 Inbound 下。

#### 7.7.1 各渠道对话内容排序

Email / LinkedIn / SMS / WhatsApp / Phone 的 **Conversation 卡片共用同一套排序**（Portal `interactionSortAt`）。渠道之间不另写规则；切到某个渠道 tab 后，只过滤 `Channel`，不换算法。

分层（均为 Portal Brand activity）：

1. **联系人**：同一渠道下多人时，按该人该渠道 **最新一条** 的排序时刻倒序（最近活跃的联系人在上）。
2. **Thread**：同一联系人内按 Thread ID 分组（无 Thread ID 则 `联系人 + 渠道 + Task`）。线程之间、线程内部，均按消息排序时刻 **从早到晚**。
3. **时刻相同**：按 Conversation 页面 ID。

每条消息的排序时刻：

| Direction | 排序字段（前者有值则用前者） | 说明 |
| --- | --- | --- |
| **Inbound** | `Interaction At` → 页面 `Created At` → 才考虑 `Scheduled At` | 按实际收到时间。Inbound 挂在已发 Task 上时 **不得继承** 该 Task 的 `Scheduled At`，否则回复会排到发出时刻 |
| **Outbound** | `Scheduled At` → `Interaction At` → 页面 `Created At` | Pending / In Progress / Cancelled 按计划发送时间插入对话；已发出若尚未写 `Interaction At`，目前仍落在 `Scheduled At` |

比较方式：先换成 **UTC 绝对时刻** 再比，禁止对原始字符串做字典序。`Scheduled At` 的无时区墙钟按 **America/New_York**；`Interaction At` / `Created At` 的 `Z` 或 `±offset` 按绝对时间；仅日期的值按当日 **09:00 ET**。

卡片上看到的时间可以和排序时刻不同：

| 展示位置 | 用的时间 |
| --- | --- |
| 卡片右上角 | 仅 Notion 页面 `Created At` |
| Outbound 状态旁（Pending / In Progress / Cancelled） | `Scheduled At` |
| Outbound 状态旁（Completed / Failed 等） | 页面 `Created At` |

因此「周一创建、周三 9:00 发出」的 LinkedIn / OmniReach 记录，位置按周三 9:00，右上角仍可能是周一。WhatsApp 预约 9:00 的 Pending 会排在当天已发生的回复之后。

**Phone 例外**：该 CP 下已有 Phone Task 时，渠道 tab 走 Phone Task Board，任务列表按 Task `Scheduled At`（界面 `dueAt`）从早到晚，不是 Conversation 卡片时间轴。Board 内单次通话的 Conversation / Quo 记录仍用上表。无 Phone Task、仅有通话 Conversation 时，Phone tab 与其它渠道相同。

本规则只约束 Portal 对话时间轴。排班引擎的 P0/P1/P2、以及「沿用哪条 Thread」时取最新交互（优先 `Interaction At` / `Created At`，不用 `Scheduled At`），见排班文档与 `Follow-up｜Thread ID 与 CP 挂靠规则.md`。

### 7.8 Call Result

```
Connected
No Answer
Voicemail
Declined
Invalid Number
```

选项定义：

- **Connected**：电话已经接通，并与对方产生实际通话。
- **No Answer**：电话已拨出，但无人接听。
- **Voicemail**：电话进入语音信箱。
- **Declined**：对方明确拒接本次电话。
- **Invalid Number**：号码为空号、格式错误或无法连接。

## 8. Follow-up ScenarioDB

### 8.1 作用

定义可复用的业务外联场景，并将同一场景下的多个 Bomb 组织在一起。Scenario 负责说明“在什么情况下使用”，Bomb 负责定义具体外联方案，Template 负责保存五个渠道的具体内容。

数据库名称：**FC3.0-Follow-up-ScenarioDB**

### 8.2 V1 字段

| Field Name | Type | 必填 | 中文说明 |
| --- | --- | --- | --- |
| Scenario Title | Title | 是 | Scenario 名称，用于识别一组相关的 Bomb |
| Scenario Description | Text | 否 | Scenario 的业务背景、使用条件和目标说明 |
| Bombs | Relation | 自动 | 与 Follow-up BombDB 双向关联；一个 Scenario 可以关联多个 Bomb |

### 8.3 表关系

```
Follow-up ScenarioDB
        1
        ↓
        N
Follow-up BombDB
        N
        ↓
        M
Follow-up TemplateDB
```

关系规则：

- 一个 Scenario 可以包含多个 Bomb。
- 每个 Bomb 最多关联一个 Scenario。
- 一个 Bomb 可以关联多个 Template；同一个 Template 也可以被多个 Bomb 复用。
- Template 通过 Channel 区分 Email、LinkedIn、SMS、WhatsApp 和 Phone。
- 当前 Relation 不强制每个 Bomb 必须恰好关联五条 Template；完整性由配置检查或后续自动化规则保证。

## 9. Follow-up TemplateDB

### 9.1 作用

统一管理 Email、LinkedIn、SMS、WhatsApp 的消息模板，以及 Phone 的 Call Script 和 Voicemail Script。模板只作为可选内容来源，不限制 Owner 纯人工创建任务或编辑对话内容。

数据库名称：**FC3.0-Follow-up-TemplateDB**

### 9.2 V1 字段

| Field Name | Type | 必填 | 中文说明 |
| --- | --- | --- | --- |
| Template | Title | 是 | 模板名称，用于识别渠道、用途和版本 |
| Channel | Select | 是 | Email / LinkedIn / SMS / WhatsApp / Phone |
| Template Type | Select | 是 | Message / Call Script |
| Subject Template | Text | 否 | Email 主题模板；其他渠道留空 |
| Content Template | Text | 是 | 消息正文、电话话术或语音信箱留言模板 |
| Sequence Step | Number | 否 | 模板在跟进序列中的顺序；不属于固定序列时可留空 |
| Language | Select | 否 | English / Chinese / Bilingual |
| Template Status | Status | 是 | Draft / Active / Archived |
| Version | Text | 否 | 模板版本号，例如 V1、V1.1 |
| Follow-up Tasks | Relation | 自动 | 使用该模板的 Follow-up Tasks |
| Conversation Records | Relation | 自动 | 使用该模板生成内容的 Conversation Records |
| Notes | Text | 否 | 模板使用限制、修改原因和补充说明；备注内容必须使用中文 |
| Created At | Created time | 自动 | 系统自动记录创建时间 |
| Last Edited At | Last edited time | 自动 | 系统自动记录最后修改时间 |

### 9.3 Template Type

- **Message**：用于 Email、LinkedIn、SMS 或 WhatsApp 的消息模板。
- **Call Script**：用于 Phone 的人工通话或语音信箱留言话术。

### 9.4 Template Status

- **Draft**：模板正在编辑或审核，暂不可用于标准任务。
- **Active**：模板已启用，可以用于生成任务和对话内容。
- **Archived**：模板已停用，仅用于查看历史使用记录。

### 9.5 模板使用规则

- 一个 Channel 可以对应多个 Template，通过 Template、Sequence Step、Version 和具体内容区分。
- Follow-up Task 的 Template 可以留空；留空表示任务未预选标准模板，可以由 Owner 纯人工处理。
- Follow-up ConversationDB 的 Template Used 可以留空；留空表示 Content 为纯人工编辑、客户原始回复或其他非模板内容。
- 无论是否使用模板，真正发送或收到的完整内容始终保存在 Conversation Record 的 Content 中。
- 模板后续修改不得覆盖历史 Conversation Record 中已经保存的 Content。

## 10. Follow-up ChannelCapacityDB

### 10.1 作用

维护 Email、LinkedIn、SMS、WhatsApp 和 Phone 五个渠道每个工作日允许排入的最大任务数量。容量由人工在系统页面中直接修改，排班引擎在创建单个或批量 Follow-up Task 时实时读取。

数据库名称：**FC3.0-Follow-up-ChannelCapacityDB**

### 10.2 V1 字段

| Field Name | Type | 必填 | 中文说明 |
| --- | --- | --- | --- |
| Channel Capacity | Title | 是 | 配置记录标题，直接使用渠道名称 |
| Channel | Select | 是 | Email / LinkedIn / SMS / WhatsApp / Phone |
| Daily Max | Number | 是 | 该渠道每个工作日允许排入的最大任务数量；设置为 0 表示暂停该渠道 |
| Time interval | Number | 否 | 同渠道两次发送的最小间隔（分钟）；缺失或非法时排班引擎回退为 5 |
| Notes | Text | 否 | 容量设置、调整原因和补充说明；备注内容必须使用中文 |
| Created At | Created time | 自动 | 系统自动记录创建时间 |
| Last Edited At | Last edited time | 自动 | 系统自动记录最后修改时间 |

### 10.3 Channel

```
Email
LinkedIn
SMS
WhatsApp
Phone
```

每个渠道只保留一条配置记录，不按照 Owner、账号或其他具体资源拆分容量。

### 10.4 容量计算规则

- 容量按照工作区时区下的自然日期计算，并只用于周一至周五的任务排班。
- 当日已占用数量为：Channel 相同、Scheduled At 位于目标日期、且 Task Status 不为 Cancelled 的 Follow-up Task 数量。
- 当日可用数量为：`max(0, Daily Max - 当日已占用数量)`。
- Pending、In Progress、Completed 和 Failed Task 均占用对应日期的容量；Cancelled Task 不占用容量。
- 当日容量已满时，排班引擎自动尝试下一个工作日；如果超出用户指定的最晚执行日期，则任务不创建并返回 Unscheduled。
- 单个创建、批量创建和自动创建必须使用同一套容量检查规则。
- 预览阶段只显示建议排期；正式创建时必须重新读取 Daily Max 并重新统计已有任务，避免并发创建导致超额。

### 10.5 人工修改规则

- 提高 Daily Max 后，新增容量立即可用于后续任务排班。
- 降低 Daily Max 时，不自动取消或移动已经创建的任务。
- 如果修改后的 Daily Max 小于当日已占用数量，当日标记为超出容量，并停止继续创建该渠道的新任务。
- 将 Daily Max 设置为 0，表示暂停该渠道的新任务排班。
- 当前五条初始配置的 Daily Max 均为 0，启用排班前由人工设置实际上限。

## 11. 关键数据规则

### 11.1 不重复维护主数据

- ClientDB 继续保存客户官网、ICP、公司资料和研究结果。
- KeyPersonDB 继续保存人员职位、Email、Phone、LinkedIn 和身份验证信息。
- Follow-up ClientDB 和 Follow-up ContactDB 只通过 Relation 关联主数据；任务生成和执行时实时读取最新信息，不重复保存。
- Follow-up Client 和 Follow-up Contact 的 Title 仅作为系统生成的记录标题，不作为客户名称或人员姓名的主数据。
- Contact Order 只表达当前跟进中的执行顺序，不替代 KeyPersonDB 的 Contact Priority。

### 11.2 计划与事实分开

例如，计划于 2026-09-16 发送 WhatsApp，但实际于 2026-09-17 10:42 才发送：

- Follow-up Task 的 Scheduled At 写入计划发送时刻（datetime，America/New_York），例如 2026-09-16 14:10 ET。
- Follow-up Conversation 的 Scheduled At 与对应 Task 使用同一排班结果、同一写入格式；Inbound 不写 Scheduled At。
- Notion TaskDB / ConversationDB 的 `Scheduled At` 属性需开启 **Include time**，否则界面只显示日期。
- Conversation Record 在 Message Status 为 Pending 时，Interaction At 留空。
- 实际发送后，Message Status 更新为 Sent，Interaction At 写入实际发送时间：2026-09-17 10:42。
- Follow-up Task 的 Task Status 更新为 Completed，Ended At 写入任务实际结束时间：2026-09-17 10:42。
- Interaction At 和 Ended At 使用完整日期与时间；Scheduled At 使用带时区的计划发送时刻。

### 11.3 客户级与人员级状态分开

- Follow-up Client 的 Follow-up Status 是客户级决策的唯一状态字段。
- Follow-up Client 的 Handling Mode 表示客户级主要跟进方式，选项为 Automated / Human，与 Follow-up Status 相互独立。
- Follow-up Contact 的 Follow-up Status 是人员级决策的唯一状态字段。
- Follow-up Contact 的 Follow-up Mode 表示人员级跟进方式，选项为 Automated / Manual。
- 是否停止或继续，由客户和人员维度结合完整互动过程进行评估。
- 客户转为人工处理时，只将 Follow-up Client 的 Handling Mode 更新为 Human，不改变 Follow-up Status。
- 单个人员转为人工处理时，只将 Follow-up Contact 的 Follow-up Mode 更新为 Manual，不改变 Follow-up Status。
- 状态原因统一记录在对应客户或人员的中文 Notes 中。

### 11.4 渠道可用性实时判断

所有渠道联系方式及其有效状态统一记录在 KeyPersonDB。生成 Follow-up Task 时，系统实时读取 Key Person 的 Email、LinkedIn、SMS、WhatsApp 和 Phone 信息，判断目标 Channel 是否可用。Follow-up ContactDB 不保存渠道联系方式或渠道可用性字段。

### 11.5 Owner 分为两层

- Follow-up Client Owner：对客户整体推进负责。
- Follow-up Task Owner：实际执行本次任务的人。

两者默认一致，但允许临时调整。

Portal 读取规则：未登录会先进入登录页。使用 OwnerDB 的 Account（工作邮箱）和 Password Hash 登录，且 Owner Status 必须为 Active。Password Hash 只保存加密哈希，禁止长期保存明文；若当前仍是明文，首次成功登录后会自动改写成哈希。权限以 OwnerDB 的 **Role** 为准：`Admin` 为管理员，`Owner` 为 AccountManager，`Caller` 为 Caller。非 Admin 只读取 Owner 关系等于当前 Owner 记录的 Follow-up Client；未分配 Owner 的记录仅 Admin 可见。Follow-up Client 的 `Is Test` 勾选后，Admin / Caller 在 Portal 中隐藏该客户与其 Task；AccountManager（及允许名单账号如 peter）仍可按原有 Owner 范围查看与操作；带 ingest token 的 Inbound/Reply 回写仍可写入测试客户。

多渠道客户外联系统｜V1 排班引擎规划
