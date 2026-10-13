# 本次数据库新增清单

约束：数据库结构只做新增；不删除原有表、字段或业务记录。后续若需新增字段，必须先说明字段清单。

已执行在现有 Supabase `fridgechannel` 项目。2026-10-13 只读核对：以下四张新表均为 0 条记录。数据库验收测试在事务中运行并全部回滚；浏览器验证使用模拟响应，没有写入真实品牌。

## 新表及全部字段

| 新表 | 新增字段 |
| --- | --- |
| `followup_brand_state` | `brand_id`, `client_id`, `version`, `projection`, `projection_token`, `projection_claimed_at`, `created_at`, `relationship_summary`, `summary_version` |
| `followup_rounds` | `id`, `brand_id`, `round_number`, `status`, `assigned_am_id`, `assigned_am_name`, `origin_encounter_id`, `current_cp`, `started_at`, `paused_at`, `completed_at`, `paused_reason`, `outcome`, `migrated`, `created_at`, `updated_at` |
| `followup_encounters` | `id`, `brand_id`, `exhibition_id`, `exhibition_name`, `round_id`, `meeting_at`, `met_by`, `meeting_notes`, `key_changes`, `next_step`, `meeting_record_url`, `original_payload`, `created_at` |
| `followup_assignment_history` | `id`, `round_id`, `previous_am_id`, `previous_am_name`, `new_am_id`, `new_am_name`, `changed_by`, `changed_at` |

`relationship_summary` 与 `summary_version` 是后续追加在本次新建的 `followup_brand_state` 表上的两列；没有追加到原有业务表。

## 新增函数

| 函数 | 用途 |
| --- | --- |
| `followup_history` | 读取统一历史与长期品牌上下文 |
| `followup_mutate` | 创建/恢复/暂停/完成轮次、记录会面、记录 AM 交接，并发校验 |
| `followup_projection` | 领取并确认 Notion 同步，失败后可重试 |
| `followup_enrich_encounter` | 给原始会面追加有来源的关键变化，不覆盖原始笔记 |
| `followup_save_summary` | 保存长期品牌摘要，拒绝过期 AI 生成结果 |

`followup_history` 在后续迁移中调整了本次新建函数的返回内容；没有替换任何项目原有函数。

## 新表约束与访问范围

- 新增主键、外键、唯一索引与查询索引，仅涉及本次四张新表。
- 同品牌最多一条 Active/Paused Round；轮次编号在品牌内唯一。
- Encounter ID 全局唯一，跨应用重试不重复创建。
- 四张新表启用 RLS；仅服务端 `service_role` 可访问，新增函数也只允许服务端调用。
- 现有 `system_notifications` 表结构没有修改。功能启用后，重要会面变化通过已有通知表新增通知记录。
- 现有 Notion Brand、AM、CP、Meeting、Task、Conversation、Sample Profile 表结构没有修改。实际使用页面操作时，AM/CP/跟进状态仍按需求通过已有操作更新，旧记录保留。

## 已执行的迁移文件

- `supabase/migrations/20261013060202_followup_rounds.sql`
- `supabase/migrations/20261013062027_followup_encounter_enrichment.sql`
- `supabase/migrations/20261013062248_followup_relationship_context.sql`

这些迁移没有 `DROP`、`DELETE` 或 `TRUNCATE` 语句。
