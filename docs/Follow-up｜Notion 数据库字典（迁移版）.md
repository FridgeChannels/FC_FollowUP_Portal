# Follow-up｜Notion 数据库字典（迁移版）

> 生成日期：2026-09-18  
> 来源：Notion 线上 Data Source schema（经 MCP `notion-fetch`）+ Portal 代码读写契约  
> 用途：从 Notion 迁移到 SQL / 其他存储时的权威字段与关系清单  
> 时区约定：计划类时间（`Scheduled At` 等）业务语义为 **America/New_York**；写入需带时间（Include time）

## 0. 范围与分层

### 0.1 Portal 执行层（本仓直接 CRUD）

| # | Notion 库名 | 默认 Database ID | Data Source (collection) | 建议 SQL 表名 |
| --- | --- | --- | --- | --- |
| 1 | FC3.0-Follow-up-ClientDB | `8b04a997-c66f-40dd-8f23-7234450f3c58` | `9a07646d-190c-4346-9ab6-96c2e40d66a7` | `followup_client` |
| 2 | FC3.0-Follow-up-ContactDB | `d67e70b2-230f-4a4e-b8a2-ce79337ee959` | `e9fce670-c858-4ab2-9d50-fd196b64f8ed` | `followup_contact` |
| 3 | FC3.0-Follow-up-TaskDB | `ff50607a-3fdd-469e-b5fc-2592a33ff63b` | `79601071-9560-41c1-9ad2-a036bd4c2df8` | `followup_task` |
| 4 | FC3.0-Follow-up-ConversationDB | `a7ded397-b23f-47f1-a911-3855fc3d10ce` | `0fe672f1-49c6-498b-a4c6-d5c5fe6d3fa4` | `followup_conversation` |
| 5 | FC3.0 OmniReachDB（原 Bomb） | `61c87fca-723a-4b52-8fc4-7fa6a8cb55e5` | `9a93f44a-56c7-4d8f-9eeb-c8ea1e92a228` | `omni_reach` |
| 6 | FC3.0 ScenarioDB | `a6b464d8-43ec-47c6-8f0f-21e42b224b76` | `ffdfa020-12bc-45c7-9cf0-e281885ad738` | `scenario` |
| 7 | FC3.0-OmniReach-TemplateDB | `6b8cab86-324d-4d1d-9a8b-8acc48ebc1c5` | `0af9831c-b8bb-4530-a9cb-3b819afa694d` | `omni_reach_template` |
| 8 | FC3.0-Follow-up-ChannelCapacityDB | `0c422a9a-a10b-4f6f-b87d-b97fbb263dee` | `1348c783-6c9a-428f-8c63-14198152795c` | `channel_capacity` |
| 9 | FC3.0-Follow-up-OwnerDB | `3460eaca-0fb1-42da-813a-64a1dc5a39d6` | `876691a8-cb4f-49d8-b51e-9851a65b1bd9` | `followup_owner` |
| 10 | FC3.0 CheckPoint DB | `1e1f297c-2925-4903-a0f1-2b6ad113c364` | `ba758476-bca2-429c-8d12-2a8ff43df2a6` | `checkpoint` |
| 11 | FC3.0-Follow-up-LinkedInAccountDB | `2ea248ed-37c4-42ec-8591-699f336a3ee7` | `bf19df0c-18fe-49da-8396-da414002dd45` | `linkedin_account` |

### 0.2 主数据层（Portal 只读引用；不全量维护）

| Notion 库名 | Data Source | Portal 用途 |
| --- | --- | --- |
| FC2.0-ClientDB / FC3.0-ClientDB | `1f107371-3833-4e84-9b30-179a2aa817aa` | 品牌名、产品描述、品类等；`Follow-up Client.Client` 关联 |
| FC3.0-KeyPersonDB | `0189166f-d9fd-8373-9626-01cc3dddd878` | 联系人姓名、Email/Phone/LinkedIn、验证状态；`Follow-up Contact.Key Person` 关联 |
| FC3.0-ExhibitionDB | `3989166f-d9fd-8098-96e8-000b692cd932` | 展会名称；`Follow-up Client.Follow-up Exhibition` 关联 |

主数据表字段极多（ClientDB / ExhibitionDB 各数十列）。迁移时建议：**全量导出主数据**，但应用层只映射 Portal 实际读取的子集（见第 12–14 节）。

### 0.3 Notion → SQL 类型映射

| Notion 类型 | 建议 SQL | 说明 |
| --- | --- | --- |
| title | `text` / `varchar` | 业务主键旁路；真正 ID 用 Notion page UUID → `uuid`/`text` |
| text (rich_text) | `text` | |
| number | `numeric` / `integer` | |
| checkbox | `boolean` | |
| select / status | `text` + CHECK 或 enum | 迁移时保留英文选项字面量 |
| multi_select | `text[]` 或 junction | |
| date（含时间） | `timestamptz` | 业务按 ET 解释；存储建议 UTC |
| date（仅日） | `date` | |
| url / email / phone_number | `text` | |
| relation (limit 1) | `uuid` FK | |
| relation (多) | junction 表 | |
| rollup / formula | **不落库或物化视图** | 由关联表计算 |
| created_time / last_edited_time | `timestamptz` | |
| auto_increment_id | `bigint` serial | |
| created_by / last_edited_by | 可选忽略 | |

每条 Notion 记录额外保留：`notion_page_id`（原 page UUID，迁移主键）、`created_at`、`updated_at`。

---

## 1. 实体关系（迁移 ER）

```
ClientDB ──────────────┐
KeyPersonDB ────────┐  │
ExhibitionDB ────┐  │  │
                 │  │  │
                 ▼  ▼  ▼
            followup_client ◄──── followup_owner
                 │ 1
                 │
                 ▼ N
            followup_contact ──── KeyPersonDB
                 │ 1
        ┌────────┴────────┐
        ▼ N               ▼ N
  followup_task     followup_conversation
        │                   │
        └─────────┬─────────┘
                  │
     scenario ──► omni_reach ──► omni_reach_template
                  │
                  └── checkpoint（Current CP / Conversation CP / Scenario CP）

channel_capacity（按 Channel 独立配置，无 FK）
linkedin_account（额度账本，无 FK；Sender 写入 conversation.sender / task.notes）
```

核心规则：

- 客户归属：`Task` / `Conversation` → `Follow-up Contact` → `Follow-up Client`
- 主数据不冗余：渠道联系方式只在 KeyPersonDB
- 计划在 Task；事实内容在 Conversation
- OmniReach Launch 同一次执行共享 `OmniReach Run Id`（UUID）

---

## 2. followup_client（FC3.0-Follow-up-ClientDB）

**作用**：本轮跟进范围内的客户行；Portal Brands 列表一行一条。

| 字段（Notion） | 类型 | 基数 | 必填 | 枚举 / 关联 | 中文说明 | 迁移建议列 |
| --- | --- | --- | --- | --- | --- | --- |
| Follow-up Client | title | — | 是 | — | 系统标题（通常来自 Client 名） | `title` |
| Client | relation | 1 | 是 | → ClientDB | 主数据客户 | `client_id` |
| Follow-up Contacts | relation | N | 否 | → ContactDB | 本轮联系人 | junction / 逆关系 |
| Owner | relation | 1 | 业务必填 | → OwnerDB | 客户负责人 | `owner_id` |
| Follow-up Status | status | — | 是 | 见 2.1 | 客户级跟进状态 | `status` |
| Handling Mode | select | — | 是 | Automated / Human | 客户级跟进方式 | `handling_mode` |
| Current CP | relation | N* | 否 | → CheckPoint DB | 最近已完成 CP；空≈NONE | `current_cp_id` |
| Priority | select | — | 否 | P0 / P1 / P2 | 优先级 | `priority` |
| Is Test | checkbox | — | 否 | — | 测试客户；Admin/Caller Portal 隐藏 | `is_test` |
| Follow-up Exhibition | relation | 1 | 否 | → ExhibitionDB | 关联展会 | `exhibition_id` |
| Last Interaction At | rollup | — | 自动 | Contacts→… | 最近互动 | **派生** |
| Last Reply At | rollup | — | 自动 | Contacts formula | 最近回复 | **派生** |
| Notes | text | — | 否 | 中文 | 备注 | `notes` |
| FC3.0-FollowUp-NotionAIMeetings | relation | N | 否 | Meetings DB | AI 会议关联 | 可选迁移 |
| Created At | created_time | — | 自动 | — | | `created_at` |
| Last Edited At | last_edited_time | — | 自动 | — | | `updated_at` |

\*线上 schema 未强制 limit=1；Portal 按 **第一条 relation** 读取。迁移建议落为单 FK。

### 2.1 Follow-up Status

`Unassigned` | `Ready` | `In Progress` | `Paused` | `Completed` | `Terminated`

### 2.2 Handling Mode

`Automated` | `Human`（与 Status 独立）

### 2.3 与旧文档差异

- **Current CP 实际为 Relation → CheckPoint DB**，不是 Select。
- Portal 本地字典仍用短名 `NONE` / `CP1` / `CP2` / `CP3` 做展示与校验；NONE = 无关联。

---

## 3. followup_contact（FC3.0-Follow-up-ContactDB）

| 字段 | 类型 | 基数 | 必填 | 枚举 / 关联 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- | --- | --- |
| Follow-up Contact | title | — | 是 | — | 系统标题 | `title` |
| Follow-up Client | relation | 1 | 是 | → ClientDB(FU) | 所属客户 | `followup_client_id` |
| Key Person | relation | 1 | 是 | → KeyPersonDB | 主数据联系人 | `key_person_id` |
| Owner | rollup | — | 自动 | Client.Owner | | **派生** |
| Follow-up Status | status | — | 是 | 见 3.1 | 人员级状态 | `status` |
| Follow-up Mode | select | — | 是 | Automated / Manual | 人员级方式 | `followup_mode` |
| Contact Order | select | — | 否 | Primary / Secondary / Backup | 本轮顺序 | `contact_order` |
| Conversations | relation | N | 自动 | → ConversationDB | 双向 | junction |
| Follow-up Tasks | relation | N | 自动 | → TaskDB | 双向 | junction |
| Last Interaction At | rollup | — | 自动 | Conversations.Interaction At | | **派生** |
| Last Reply At | formula | — | 自动 | Inbound 最近回复 | | **派生** |
| Notes | text | — | 否 | 中文 | | `notes` |
| Created At / Last Edited At | 系统 | — | 自动 | | | |

### 3.1 Follow-up Status

`Not Contacted` | `In Progress` | `Completed` | `Terminated`

---

## 4. followup_task（FC3.0-Follow-up-TaskDB）

**作用**：按日排班；不存消息正文。

| 字段 | 类型 | 基数 | 必填 | 枚举 / 关联 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- | --- | --- |
| Follow-up Task | title | — | 是 | — | 建议：客户—人员—渠道—日期 | `title` |
| Follow-up Contact | relation | 1 | 是 | → ContactDB | | `followup_contact_id` |
| Owner | relation | 1 | 是 | → OwnerDB | 实际执行人（**非 Notion Person**） | `owner_id` |
| Creation Method | select | — | 是 | Automated / Manual | | `creation_method` |
| Template | relation | 1 | 否 | → TemplateDB | | `template_id` |
| Scheduled At | date+time | — | 是 | ET | 计划发送时刻 | `scheduled_at` |
| Priority | select | — | 否 | P0 / P1 / P2 | | `priority` |
| Channel | select | — | 是 | Email / LinkedIn / SMS / WhatsApp / Phone | | `channel` |
| Task Status | status | — | 是 | 见 4.1 | | `status` |
| Source Bomb | relation | N* | 否 | → OmniReachDB | Launch 来源 | `source_omni_reach_id` |
| OmniReach Run Id | text | — | 否 | UUID | 同次 Launch 共享 | `omni_reach_run_id` |
| Call Review Status | select | — | 否 | Awaiting Review / Qualified / Unqualified | 仅 Phone | `call_review_status` |
| Conversations | relation | N | 否 | → ConversationDB | | junction |
| Ended At | date | — | 否 | Completed/Failed/Cancelled 时写 | | `ended_at` |
| Notes | text | — | 否 | 中文；LinkedIn 闸门机器行见 4.3 | | `notes` |
| Created At / Last Edited At | 系统 | — | 自动 | | | |

### 4.1 Task Status

`Pending` | `In Progress` | `Completed` | `Failed` | `Cancelled`

容量占用：除 `Cancelled` 外均占用当日 Channel Daily Max。

### 4.2 Call Review Status（Phone）

- `Awaiting Review`：Quo `Call Result=Connected` 后自动；Task→Completed  
- `Qualified`：保持 Completed  
- `Unqualified`：Task→Pending，改派 Beril，Priority→P0  

### 4.3 LinkedIn 闸门机器行（写入 Notes）

```
[LI_GATE] outreachKind=cold|followup_after_reply;senderAccount=<Account Name>;countsAgainstQuota=1|0
```

迁移建议：拆成显式列 `outreach_kind`、`sender_account`、`counts_against_quota`，避免解析 Notes。

---

## 5. followup_conversation（FC3.0-Follow-up-ConversationDB）

**作用**：待发 / 已发 / 已收 / 电话结果等事实记录。

| 字段 | 类型 | 基数 | 必填 | 枚举 / 关联 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- | --- | --- |
| Conversation Record | title | — | 是 | — | | `title` |
| Conversation Record ID | text | — | 是 | 业务唯一 | | `record_id` UNIQUE |
| Thread ID | text | — | 否 | 同人同渠道同场对话共用 | | `thread_id` |
| Message ID | text | — | 否 | 渠道消息 ID；Quo=`QUO_CALL:<id>` | | `message_id` |
| Follow-up Contact | relation | 1 | 是 | → ContactDB | | `followup_contact_id` |
| Follow-up Task | relation | 1 | 否 | → TaskDB | Inbound 可空 | `followup_task_id` |
| Template Used | relation | 1 | 否 | → TemplateDB | | `template_id` |
| Channel | select | — | 是 | 五渠道 | | `channel` |
| Direction | select | — | 是 | Outbound / Inbound | | `direction` |
| Subject | text | — | 否 | Email 主题 | | `subject` |
| Content | text | — | 否 | 完整正文 | | `content` |
| Scheduled At | date+time | — | Outbound 待发建议必填 | ET | | `scheduled_at` |
| Interaction At | date | — | 否 | 实际发生时间；Pending 留空 | | `interaction_at` |
| Sender | text | — | 否 | 发件账号 / LinkedIn 展示名等 | | `sender` |
| Reply Status | select | — | 否 | Needs Reply / Replied | 仅 Inbound | `reply_status` |
| Reply Due At | date | — | 否 | Needs Reply 时写入 | | `reply_due_at` |
| CP | relation | N* | 否 | → CheckPoint | **发生当时** CP，禁止用当前 CP 回填 | `cp_id` |
| Call Result | **text** | — | 否 | Connected / No Answer / Voicemail / Declined / Invalid Number | 线上为 Text，非 Select | `call_result` |
| Source URL | url | — | 否 | 原始会话链接 | | `source_url` |
| Extended Parameters | text | — | 否 | JSON（Gmail/Quo 等） | | `extended_parameters` jsonb |
| Notes | text | — | 否 | 中文 | | `notes` |
| Created At / Last Edited At | 系统 | — | 自动 | | | |

### 5.1 已删除 / 勿按旧文档迁移

- **无 `Message Status` 字段**。发送状态以关联 Task 的 `Task Status` 为准（Portal 注释已说明）。
- 旧架构中的 Select 版 `Call Result`：线上为 **Text**。

### 5.2 Direction / Reply Status / Call Result 取值

- Direction: `Outbound` | `Inbound`
- Reply Status: `Needs Reply` | `Replied`（仅 Inbound）
- Call Result 约定值: `Connected` | `No Answer` | `Voicemail` | `Declined` | `Invalid Number`

---

## 6. omni_reach（FC3.0 OmniReachDB）

| 字段 | 类型 | 基数 | 必填 | 枚举 / 关联 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- | --- | --- |
| OmniReach Name | title | — | 是 | — | | `name` |
| OmniReachID | auto_increment_id | — | 自动 | — | | `omni_reach_number` |
| Scenario | relation | 1 | 否 | → ScenarioDB | 最多一个 | `scenario_id` |
| CP | relation | N* | 否 | → CheckPoint | 适用阶段 | `cp_id` |
| Goal | **rollup** | — | 自动 | 来自 Scenario.Goal | **不要当可写列** | 派生 |
| Method | text | — | 否 | 如何达成 Goal | Portal 部分路径仍写 Goal，迁移以 Method 为准 | `method` |
| Target Role | select | — | 否 | Connector / Owner / Decision Maker / Influencer / Operator / Other | | `target_role` |
| OmniReach Status | status | — | 是 | Draft / Active / Archived | 仅 Active 可 Launch | `status` |
| Templates | relation | N | 否 | → TemplateDB | | junction |
| Generated Tasks | relation | N | 自动 | → TaskDB | Source Bomb 逆 | junction |
| created | created_by | — | 自动 | | 可选 |
| Created At / Last Edited At | 系统 | — | 自动 | | |

---

## 7. scenario（FC3.0 ScenarioDB）

| 字段 | 类型 | 基数 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- |
| Scenario Title | title | — | | `title` |
| Scenario Description | text | — | 背景与使用条件 | `description` |
| Goal | text | — | 场景目标；OmniReach.Goal rollup 来源 | `goal` |
| CP | relation | 1 | 所属 CheckPoint | `cp_id` |
| OmniReaches | relation | N | → OmniReachDB | junction |

---

## 8. omni_reach_template（FC3.0-OmniReach-TemplateDB）

| 字段 | 类型 | 基数 | 必填 | 枚举 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- | --- | --- |
| Name | title | — | 是 | — | 模板名 | `name` |
| Channel | select | — | 是 | 五渠道 | | `channel` |
| Type | select | — | 是 | Message / Call Script | | `type` |
| Subject Template | text | — | 否 | Email 主题 | | `subject_template` |
| Content Template | text | — | 是 | 正文 / 话术 | | `content_template` |
| OmniReach | relation | N | 否 | → OmniReach | | junction |
| Follow-up Tasks | relation | N | 自动 | | junction |
| Conversation Records | relation | N | 自动 | | junction |
| Created At / Last Edited At | 系统 | — | 自动 | | |

### 8.1 相对旧规划文档已不存在的字段

`Template Status`、`Sequence Step`、`Language`、`Version`、`Notes` — **线上 TemplateDB 无这些列**。

---

## 9. channel_capacity（FC3.0-Follow-up-ChannelCapacityDB）

每个渠道一条配置。

| 字段 | 类型 | 必填 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- |
| Channel Capacity | title | 是 | 通常等于渠道名 | `title` |
| Channel | select | 是 | Email / LinkedIn / SMS / WhatsApp / Phone | `channel` UNIQUE |
| Daily Max | number | 是 | 工作日最大任务数；0=暂停 | `daily_max` |
| Time interval | number | 否 | 同渠道最小间隔（分钟）；缺省回退 5 | `time_interval_minutes` |
| Month Max | number | 否 | 月最大发送量（渠道级） | `month_max` |
| Notes | text | 否 | 中文 | `notes` |
| Created At / Last Edited At | 系统 | 自动 | | |

LinkedIn **账号月额度**不在本表，见 LinkedInAccountDB。

---

## 10. followup_owner（FC3.0-Follow-up-OwnerDB）

| 字段 | 类型 | 必填 | 枚举 | 说明 | 迁移列 |
| --- | --- | --- | --- | --- | --- |
| Name | title | 是 | — | | `name` |
| Owner ID | auto_increment_id | 自动 | — | | `owner_number` |
| Account | text | 是 | 工作邮箱，登录账号 | | `account` UNIQUE |
| Password Hash | text | 登录必需 | 禁止明文 | | `password_hash` |
| Role | select | 是 | Admin / Owner / Caller | Portal：Admin；Owner→AccountManager；Caller | `role` |
| Is Admin | checkbox | 否 | 遗留；权限以 Role 为准 | | `is_admin` |
| Owner Status | status | 是 | Pending / Active / Disabled | 仅 Active 可登录 | `status` |
| Created At | created_time | 自动 | | | |

---

## 11. checkpoint（FC3.0 CheckPoint DB）

| 字段 | 类型 | 说明 | 迁移列 |
| --- | --- | --- | --- |
| Name | title | 标题常含短名，如 `CP1-...`；Portal 解析短名 | `name` |
| Type | select | Order / Operational | `type` |
| Completion Criteria | text | 完成标准 | `completion_criteria` |
| Evidence | text | 证据要求 | `evidence` |
| External Stage (Client Safe Wording) | text | 对外表述 | `external_stage` |
| Materials Delivered | text | | `materials_delivered` |
| Follow-up Clients | relation N | 逆关联 | junction |
| Follow-up Conversations | relation N | 逆关联 | junction |

Portal 业务短名：`NONE`（无关联）、`CP1`、`CP2`、`CP3`（及可能的 `Nurture` 等标题解析结果）。

---

## 12. linkedin_account（FC3.0-Follow-up-LinkedInAccountDB）

| 字段 | 类型 | 说明 | 迁移列 |
| --- | --- | --- | --- |
| Account Name | title | 与 Conversation.Sender 一致 | `account_name` UNIQUE |
| Status | select | Active / Standby / Exhausted / Paused | `status` |
| Monthly Quota | number | 默认 15 | `monthly_quota` |
| Monthly Used Cold | number | 当月已预扣冷触达 | `monthly_used_cold` |
| Quota Month | text | `YYYY-MM`（美东）；跨月清零 Used | `quota_month` |
| Sort Order | number | 串行顺序 | `sort_order` |
| Notes | text | 中文 | `notes` |

约束：全局至多一个 `Active`。

---

## 13. 主数据：ClientDB（Portal 只读子集）

完整库字段极多；Portal / Launch 实际读取：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| Company Name | title | 品牌展示名 |
| Product Description | text | 模板变量 / 详情 |
| Matched Category | relation → Category DB | 品类展示 |
| （page title 回退） | title | Company Name 为空时 |

迁移：建议整库导出；应用层 FK `followup_client.client_id → client.id`。

---

## 14. 主数据：KeyPersonDB（Portal 只读子集）

| 字段 | 类型 | Portal 用途 |
| --- | --- | --- |
| name | title | 联系人姓名 |
| Title | text | 职位 |
| Contact Role | select | 职能标签 |
| OwnerOrConnector | select | Owner / Connector |
| Email | email | 渠道可用性 |
| Email Verified Status | status | `Verified` / `Icypeas Verified` → emailValid |
| Phone | phone_number | SMS/WhatsApp/Phone |
| LinkedIn URL | url | LinkedIn 渠道 |

其余字段（社媒、ColdReach、研究状态等）属主数据运营，迁移建议整库保留，Follow-up 层不复制。

---

## 15. 主数据：ExhibitionDB（Portal 只读子集）

Portal 仅用 **title（Name）** 做模板变量 `Follow-up Exhibition`。迁移时可只保留 `id` + `name`，或整库导出供其他产品线使用。

---

## 16. 共享枚举字典

### 16.1 Channel

`Email` | `LinkedIn` | `SMS` | `WhatsApp` | `Phone`

### 16.2 Priority

`P0` | `P1` | `P2`

### 16.3 建议 SQL enum / check 一览

见各表 Status/Select 列；**迁移时保留英文原值**，中文仅作文档定义。

---

## 17. 建议 junction / 索引（SQL）

| Junction | 左 | 右 |
| --- | --- | --- |
| `followup_client_contact` | client | contact（若不用逆 FK） |
| `omni_reach_template` | omni_reach | template |
| `task_conversation` | task | conversation（可选；也可用 conversation.task_id） |

推荐索引：

- `followup_task (channel, scheduled_at, status)` — 容量计算  
- `followup_conversation (thread_id)`、`(message_id)`、`(reply_status, direction)`  
- `followup_task (omni_reach_run_id)`  
- `followup_client (owner_id, status, is_test)`  
- `followup_contact (followup_client_id)`  
- `linkedin_account (status)`、`(quota_month)`

---

## 18. 与旧《V1 数据架构规划》的差异摘要（迁移必读）

| 项 | 旧文档 | 线上 / 代码现状 |
| --- | --- | --- |
| BombDB | Follow-up BombDB | **OmniReachDB**；Title=`OmniReach Name` |
| Current CP | Select | **Relation → CheckPoint** |
| Task.Owner | Person | **Relation → OwnerDB** |
| Conversation.Message Status | Select | **已删除**；看 Task Status |
| Conversation.Call Result | Select | **Text** |
| Template 标题 | Template | **Name**；类型字段为 **Type** |
| Template Status 等 | 有 | **无** |
| Contact 对话 relation | Interactions | **Conversations** |
| Scenario | 仅 Description + Bombs | 另有 **Goal、CP、OmniReaches** |
| OmniReach.Goal | 可写 Text | 线上为 **Scenario.Goal 的 Rollup**；可写字段为 **Method** |
| Client | 无 Exhibition / Is Test | 有 **Follow-up Exhibition、Is Test** 等 |
| LinkedIn 账号库 | 未入架构文档 | **LinkedInAccountDB** 已上线 |

---

## 19. 环境变量覆盖（Database ID）

见 `lib/notion/config.ts`：`NOTION_FOLLOWUP_*_DB_ID` 系列；未设置时使用本文第 0.1 节默认 UUID。

---

## 20. 迁移检查清单

1. 用 Notion page UUID 作为迁移主键，建立 `notion_page_id → new_id` 映射表。  
2. 先迁主数据（Client / KeyPerson / Exhibition / CheckPoint / Owner），再迁执行层。  
3. Relation 按「先父后子」：Scenario → OmniReach → Template → Client → Contact → Task / Conversation。  
4. Rollup/Formula 列不要盲迁，改为查询或触发器物化。  
5. `Extended Parameters`、`Password Hash`、`[LI_GATE]` Notes 做结构化拆分。  
6. 校验枚举字面量与线上一致（尤其 `Handling Mode=Human` vs Contact `Manual`）。  
7. 容量与 LinkedIn 额度逻辑依赖 `Task.Status` + `Scheduled At` + Notes/显式列，迁移后跑对账脚本。
