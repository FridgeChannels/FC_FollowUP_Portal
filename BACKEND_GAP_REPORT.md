# 后端接库与业务逻辑补充清单

检查范围：当前仓库的页面交互、`/api` 路由、Notion/Supabase 数据访问，以及本地状态实现。结论反映代码现状；若生产环境另有未提交的后端服务，需要再与部署配置核对。

## 结论

主业务并非整体没有接后端。品牌、联系人、跟进记录、消息、任务、OmniReach、通话审核等线上流程已经通过 API 读写 Notion；样品访问、Signals 状态和 Caller 每日 Notion 链接使用 Supabase。当前项目的 D1/Drizzle schema 为空，也没有可见的 D1 业务表迁移。因此如果“接数据库”特指接入 SQL/D1，现有主业务数据还没有迁到该数据库；若后端以 Notion 和 Supabase 为数据源，则不能把整套业务标成未接库。

## 已移除：品牌 CSV 批量导入

CSV 批量导入不纳入后端开发范围。前端只保留单个品牌新增入口；CSV 导入弹窗、解析逻辑和本地导入方法已从代码中删除，因此不需要新增批量导入 API。

## 仍需确认：管理设置（优先级：中，先确认是否纳入产品范围）

- 现状：`SettingsPage` 中的渠道连接状态、Caller 每日容量和审计记录都来自演示 `WorkspaceState`，修改只存入浏览器 `localStorage`。当前导航没有设置入口，`/settings` 会被重定向到角色首页。
- 代码位置：`app/workspace-admin.tsx`、`app/workspace-store.tsx`、`app/outreach-workspace.tsx`。
- 后端补充：如果这些设置是正式需求，需确定真实配置数据源，并提供读取/更新接口；Caller 容量需要可持久化的 Caller 配置；审计记录需服务端在业务写入成功后产生并保存。渠道状态应由集成配置或健康检查得出，不能由用户随意改成“已连接”。同时恢复正式设置页面路由和权限控制。

## 只在演示/回退模式本地保存的功能

以下操作确实存在本地模拟逻辑，但当前品牌详情的真实线上路径（Notion-backed）已有相应 API。不要将这些功能直接记作线上缺失；只有产品要保留无 Notion 数据的独立工作模式，或准备把数据迁出 Notion 时，才需要再补持久化：

- 品牌详情的本地回退操作：回复、标记回复已处理、修改 CP、安排跟进、分配负责人、暂停/关闭品牌、更新联系人。
- 本地演示的任务和 OmniReach 执行模拟：创建/重分配电话任务、启动/停止流程、推进模拟日期、模拟发送成功或失败，以及对应的活动记录。
- 这些状态集中在 `app/workspace-store.tsx`，以 `outreach-control-demo-v3` 为键写入浏览器 `localStorage`；种子数据来自 `lib/outreach-domain`。
- 线上真实流程使用 `/api/brands/*`、`/api/tasks/*`、`/api/bombs*` 等路由，并通过 `lib/notion/*` 访问 Notion。品牌详情根据真实远端数据走 Notion-backed 分支。

## 已有后端能力（无需重复列为“未接库”）

- 品牌列表、单品牌创建/详情更新、联系人创建与资料补全：`/api/brands*`，主要写入 Notion。
- 跟进轮次、暂停/恢复/完成、CP 更新、消息收发、活动、预约会议、回复处理：`/api/brands/[id]/*`，主要写入 Notion。
- 任务列表、任务状态/负责人、通话脚本、通话结果审核与提交：`/api/tasks*`，主要读写 Notion，并接 Quo 通话数据。
- OmniReach 模板读取/创建/更新、启动与取消：`/api/bombs*` 和 `/api/brands/[id]/launch`，主要读写 Notion 并生成任务。
- Signals 的真实数据和已读/审核状态：从 Supabase 读取并写入；审核写入可由配置关闭，关闭时会返回只读预览提示。
- 样品访问和 Caller 每日 Notion 报告：代码已接 Supabase/外部服务，但部署需要对应 Supabase 表、密钥和相关服务配置。

## 需要产品确认的业务规则

- README 说明：到期跟进在刷新品牌列表后进入 Admin 的 Needs Action；不会自动发送通知。若预期需要定时提醒或推送，需要另外实现通知任务和通知渠道。
- 自动化发送、任务执行、失败重试和并发/容量控制需要以 Notion/渠道服务的真实任务状态为准；本地 `advanceDay()`、`simulateFailure()` 仅是演示逻辑。
- 若要把 Notion 主数据迁入 D1/Supabase，需要单独定义数据迁移范围、字段映射、唯一键、历史数据迁移和双写/切换方案；当前仓库没有该 SQL schema。

## 建议后端先做

1. 明确 Settings 是否上线；若上线，再定义 Caller 容量、集成配置和审计日志的数据表/API。
2. 明确是否继续以 Notion 为主业务数据源。若继续，主要工作是核实生产配置；若要全面使用 SQL，则先做数据模型与迁移计划，不能只补几个接口。
