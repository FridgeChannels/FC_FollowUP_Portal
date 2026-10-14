# Performance 数据来源与统计口径

本功能通过已有 `GET /api/brands?view=performance` 的只读分支读取数据。只有真实 Admin 可以访问，不新增 API 路径，不创建或修改表，也不调用 history seed、projection repair、sample sync 或其他写入功能。统计页面不含生产 Mock Data。

## 已接入

| 数据 | 来源 | 口径 |
| --- | --- | --- |
| Total Brands | 非测试 Follow-up Client.Client；关联的 ClientDB 元数据 | 仅统计 Brands 列表同一非测试范围（当前 203 个品牌）；通过 Client ID 和 Parent / Master Record 去重，不包含未进入 Follow-up 的总库品牌 |
| 展会品牌 | ClientDB.Related Events；Follow-up Exhibition；Encounter.exhibition_id | 每个展会的品牌分别按主品牌 ID 去重；允许同一品牌出现在多个展会的获取列表 |
| 当前机会与 CP | Supabase followup_rounds；尚无 Round 的现有 Follow-up Client.Current CP | 已保存 Round 使用其真实 ID；未保存 Round 的当前记录使用 Follow-up ID 并标记 Current record，不补造历史轮次；一个记录只归属一个当前阶段 |
| Current CP1/2/3 品牌数 | 当前机会与 CP | 按主品牌 ID 去重，使用筛选范围内最新 Round 的当前 CP；AM 视图只取该 AM 当前未完成的最新机会。同一品牌只归属一个 CP 阶段。 |
| 展会成果归属 | Round.origin_encounter_id → Encounter.exhibition_id | 来源唯一；旧品牌仅在只有第一个 Round 时使用其显式 Follow-up Exhibition，跨多个 Round 不回填当前展会；未保存 Round 的当前记录保留已有单一来源 |
| 当前 AM | Round.assigned_am_id；Follow-up Client.Owner | 已保存 Round 使用其分配记录；当前记录读取实际 Owner；Completed/Terminated 不计入正在负责的机会 |
| 历史 AM | followup_assignment_history；无 Round 标记的旧沟通回退到 Follow-up Client.Owner | 有 Round 标记时按事件时间重建负责人；无 Round 标记时按所选截止日品牌 Owner 归属。过去截止日没有可还原 Owner 时留空 |
| 回复 | ConversationDB Direction、Content、Interaction At | 实际非空 Inbound Email/SMS/WhatsApp/LinkedIn 记录，按主品牌 ID 去重；不把 Last Reply At 作为回复历史 |
| 沟通 | ConversationDB 双向线程，或实际 Connected 电话 | 线程已有实际双向交流后，本期再次交流也计入；按主品牌去重 |
| 渠道实际发送 | ConversationDB Direction=Outbound + Interaction At | 按渠道实际发送时间过滤；相同 provider Message ID 去重；AM 归属优先用 Round 的历史 Owner，无 Round 标记时使用截止日品牌 Owner；Scheduled At、创建时间、计划任务不视为发送 |
| Caller Calls | Phone Conversation + Interaction At + Call Result | 所选期间内、AM 负责品牌的电话记录，要求有通话结果并按通话记录去重；AM 归属优先用 Round 的历史 Owner，无 Round 标记时使用截止日品牌 Owner |
| OmniReach Runs | TaskDB.OmniReach Run Id + created_time + Owner | 同一 Run ID 去重，以首次任务创建时间作为启动时间、首次任务 Owner 作为启动 AM；若无 Owner，则仅对有 Round 标记的任务回退到该 Round 的历史分配。展会筛选按该品牌关联展会。与实际发送数分开 |
| OmniReach Sends | TaskDB.OmniReach Run Id + 关联 Conversation 的 Interaction At | 只统计有 OmniReach Run Id 的自动流程任务；关联出站 Conversation 有真实 Interaction At 时按 Task ID 每条计 1，以实际发送时间筛选日期、按任务 Owner 归属 AM；仅创建/排期而没有真实发送时间的记录不计。 |
| Send Message Sends | Send Message 任务 Notes 标记 + 关联 Conversation 的 Interaction At | 每条 Send Message 任务创建时写入稳定标记；旧任务若仍保留原始 Send Message Notes 也可识别。只统计关联出站 Conversation 有真实 Interaction At 的任务，按 Task ID 每条计 1。以实际发送时间筛选日期，以任务 Owner 归属 AM，按品牌关联到展会后汇总；仅创建/排期而没有真实发送时间的记录不计。 |
| Sample Tapped Brands | sample_tap_visits | 排除 is_internal，按主品牌去重；Tap 不视为物理送达 |
| Last Interaction | 真实 Conversation.Interaction At | Round 只使用已保存 Round 标记；没有 Round 的当前记录展示其品牌关联的实际最后互动 |

有 Round 标记的通信按事件时 Round Owner 归属；没有 Round 标记的旧通信，在当前截止日使用品牌 Owner 归属到品牌组合。过去截止日没有历史 Owner 证据时不回推当前 Owner。相关渠道仍存在无法归属的记录时显示 `—`，不展示不完整数字。

## 当前不能准确计算的指标

- Total Investment、Cost / CP3：已核对现有展会、Follow-up 与 Supabase 表结构，没有可明确归属展会/跟进的成本数据。当前 CP1/2/3 品牌数按最新 Round 去重统计，无需阶段晋级历史。
- Samples Delivered：样品配置、导出、Tap 不能证明已送达品牌或 Owner。
- Meeting Confirmed：Meeting note / AI Meeting Links 和表单记录不能单独证明 Meeting 已确认。
- OmniReach Sends 与 Send Message Sends：分别按 OmniReach Run Id 和 Send Message Notes 标记识别入口，再通过关联出站 Conversation 的真实 Interaction At 判断实际发送；无法识别入口的旧任务不计，避免混淆两个入口。

上述指标保留 `—` 并提供口径说明。读取失败的来源也显示 unavailable，不静默转换成 0。

## 日期与完整性

- 本期通信及 Run 统计采用上海时区的日期边界。
- 读取已保存数据，不触发历史迁移。
- 历史截止日前无法还原的 CP、状态或 Owner 显示 Unknown / `—`。缺少 started_at 的迁移 Round 不假定其真实开始时间。
- 展会 relation 没有变更时间/历史记录；选取过去的截止日时，无法还原完整的展会品牌归属，展会 Brands/CP 总数显示 `—`，不把今天的关联反推到过去。
- 先读取非测试 Follow-up（当前 203 条），仅加载其关联 Client、跟进展会（Follow-up Exhibition / 已有 Encounter）、联系人、沟通及任务；Client 总库的其他历史展会不进入比较表。沟通同时按 Follow-up Client 和其联系人查询、去重，保留仅关联联系人的旧记录。Client 的 Master 仅用于身份去重，不增加品牌总数。
- 相关来源读取完整分页；Notion 超过 25 条的 relation 单独读取完整属性分页。
- 同一读数快照用于 Overview、Exhibition Detail、AM Detail；默认缓存 60 秒，Refresh 可以重新读取。
- 比较表在全量数据上排序，20 条一页；详情与 CP 筛选保留日期和展会上下文。

## 验证

`npm run test:performance` 验证品牌去重、截止日期、多 Round、CP 全阶段、历史 AM 归属、缺失事件、发送去重、失败来源与旧记录边界。
