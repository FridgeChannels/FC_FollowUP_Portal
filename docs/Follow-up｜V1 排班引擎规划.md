# 多渠道客户外联系统｜V1 排班引擎规划

## 1. 文档目标

规划客户被单个或批量选中后，系统如何生成、校验和按日排布 Follow-up Task，并确保五个渠道不超过人工配置的每日容量。

## 2. 已确认的基础约束

- 执行渠道：Email、LinkedIn、SMS、WhatsApp、Phone。
- 任务只安排在周一至周五。
- 目标工作日容量不足时，任务自动顺延到下一个工作日，直到找到可用容量。
- `Scheduled At` 仅记录计划执行日期，不包含小时和分钟。
- 每条 Follow-up Task 只占用所属 Channel 当日的一个容量名额。
- 每位联系人默认可以一次生成多个渠道任务；由人工选择一个或多个目标渠道，每个选中渠道生成一条候选 Task。
- 同一客户的多渠道任务默认每个工作日只安排 1 个渠道；选择 5 个渠道时默认分布在至少 5 个工作日。
- 每个渠道的 `Daily Max` 由人工在 ChannelCapacityDB 中直接维护。
- Channel Daily Max 是每个渠道每个工作日不可突破的全局硬上限，不按照具体资源账号拆分。
- 排班只按 Channel Daily Max 计算渠道总容量，不再要求人工选择 Capacity Allocation Mode。
- 不设置 Owner Quota；同一 Owner 可占用的任务数量不单独限制。
- 所有 Owner 的任务总数不得超过对应 Channel 的 Daily Max。
- 单个创建、批量创建和自动创建使用同一套容量检查规则。
- Task Priority 的含义固定为：P0 用于人工优先任务，P1 用于 Active Follow-up，P2 用于 Initial Outreach。
- Creation Method 为 Manual 的 Task 自动设置为 P0；Automated Task 不允许使用 P0。
- Follow-up TaskDB 不为排班引擎增加额外字段。

## 3. 引擎职责边界

排班引擎负责：

1. 接收人工单选、人工批量选择或自动流程提交的任务创建请求。
2. 检查客户、联系人、渠道和任务状态是否满足创建条件。
3. 读取每个渠道当前的 Daily Max。
4. 统计目标日期该渠道的总占用数量。
5. 将任务排入最早有剩余渠道容量的工作日。
6. 在正式创建前重新检查渠道总容量，避免并发操作造成超额。
7. 将最终结果写入 Follow-up TaskDB。

排班引擎不负责：

- 保存客户和联系人主数据；
- 保存实际发送、接收或通话内容；
- 决定实际发送时刻；
- 维护具体渠道账号的额度。

## 4. 核心输入

| Input | 来源 | 说明 |
| --- | --- | --- |
| Target Clients | 人工选择或系统输入 | 一个或多个目标客户 |
| Target Contacts | Follow-up ContactDB | 本轮需要执行外联的联系人 |
| Selected Channels | 人工选择 | 从 Email / LinkedIn / SMS / WhatsApp / Phone 中选择一个或多个渠道 |
| Preferred Start Date | 人工输入或系统默认 | 希望开始排班的日期 |
| Owner | Follow-up Client 或人工指定 | 实际执行负责人 |
| Follow-up Client Priority | Follow-up Client 或人工指定 | P0 / P1 / P2；仅作为同一 Task Priority 内的第二排序条件 |
| Creation Method | 系统判定 | Automated / Manual |
| Template | 可选 | 关联 Follow-up TemplateDB |

## 5. 容量模型

### 5.1 渠道总容量

```
Capacity Key = Scheduled Date + Channel
```

```
Channel Allocated = 当日该 Channel 下 Task Status 不为 Cancelled 的任务数量
Channel Available = max(0, Channel Daily Max - Channel Allocated)
```

Channel Daily Max 是排班引擎必须遵守的全局硬上限。

### 5.2 容量占用状态

占用容量的状态：

```
Pending
In Progress
Completed
Failed
```

不占用容量的状态：

```
Cancelled
```

TaskDB 现有的 Channel、Scheduled At 和 Task Status 已足够完成渠道容量计算；Owner 仅用于记录实际执行负责人，不参与容量上限计算。

## 6. V1 排班流程

### 6.1 目标联系人选择规则

系统不根据 Contact Order 自动选择联系人。每个被选中的客户需要由系统操作人员人工选择本次要触达的 Follow-up Contact。

- 人工可以为同一客户选择一个或多个目标联系人。
- 只有被人工选中的联系人会进入候选任务生成流程。
- Contact Order 仅作为人工选择时的参考信息，不作为系统自动选择规则。
- 系统不自动从 Primary 降级到 Secondary，也不自动使用 Backup。
- 如果未选择任何目标联系人，该客户进入 Needs Review，不写入 Follow-up TaskDB。
- 被选中的联系人仍需通过可联系性校验；如果联系人 Follow-up Status 为 Completed 或 Terminated，缺少目标渠道所需的有效联系方式，或存在禁止继续联系的规则，则进入 Needs Review。

### 6.2 多渠道任务生成规则

- 人工为联系人选择一个或多个目标渠道。
- 每个选中渠道生成一条独立的候选 Follow-up Task；未选择的渠道不生成任务。
- 如果任一选中渠道缺少有效联系方式或存在禁止继续联系的规则，则整位联系人进入 Needs Review，该联系人的所有候选任务均不写入 TaskDB。
- 系统不自动跳过不可用渠道，也不自动替换为未选择的渠道。
- 每条候选任务根据所属 Channel 的剩余容量和同一客户每日渠道限制，寻找从 Preferred Start Date 开始的最早可用工作日。
- 同一 Follow-up Client 默认在同一工作日只安排 1 个渠道任务；计算时包含该客户当天已经存在且 Task Status 不为 Cancelled 的任务。
- 如果目标日期已经安排了该客户的一个渠道，即使其他渠道仍有容量，剩余候选任务也必须自动顺延到下一个工作日。
- 选择几个渠道，默认就至少分布在几个工作日；选择 5 个渠道时默认分布在至少 5 个工作日。
- 该限制按照客户维度计算，不因联系人或 Owner 不同而重新计算。

### 6.3 Task Priority 规则

#### P0 — Manual Priority

- Creation Method 为 Manual 的 Task 自动设置为 P0，不需要人工再次选择 Priority。
- P0 仅用于需要 Owner 人工编辑、审核或亲自执行的外联任务。
- Automated Task 不允许使用 P0。
- P0 在当日渠道容量中优先于 P1 和 P2。

#### P1 — Active Follow-up

- 用于 Follow-up Contact Status 为 In Progress 的持续跟进任务。
- 联系人已经开始实际推进，任务延期可能影响跟进连续性。
- 系统可以根据联系人状态和历史任务自动判定为 P1。

#### P2 — Initial Outreach

- 用于 Follow-up Contact Status 为 Not Contacted 的首次外联任务。
- P2 在容量不足时优先顺延，用于填充 P0、P1 分配后的剩余渠道容量。
- 系统可以根据联系人状态和历史任务自动判定为 P2。

同一日期、同一渠道内的排序规则：

```
第一层：Task Priority，P0 → P1 → P2
第二层：Follow-up Client Priority，P0 → P1 → P2
第三层：原始候选任务顺序
```

容量不足时优先顺延 P2，其次顺延 P1，P0 最后顺延。Task Priority 不直接复制 Follow-up Client Priority；客户级 Priority 只作为同一 Task Priority 内的第二排序条件。

### 6.4 排班流程

```
接收选择结果
    ↓
人工选择目标联系人和目标渠道
    ↓
按照人工选择的联系人和渠道分别生成候选任务
    ↓
校验所有选中联系人和渠道；任一联系人或渠道不可用则对应联系人进入 Needs Review
    ↓
资格与重复检查
    ↓
按照优先级排序
    ↓
从 Preferred Start Date 开始查找工作日
    ↓
读取 Channel Daily Max
    ↓
统计 Channel Allocated
    ↓
计算 Channel Available
    ↓
检查该客户当日是否已经安排渠道任务
    ↓
渠道容量可用且客户当日尚无渠道任务：排入当日
渠道容量不足或客户当日已有渠道任务：自动尝试下一个工作日
    ↓
生成预览结果，包括各日期、渠道、Owner 和同一客户的渠道分布
    ↓
用户确认
    ↓
重新校验 Channel 容量
    ↓
创建 Task
```

## 7. 待讨论事项

- 重复任务的判定标准。
- 批量预览页面需要显示哪些信息。
- 用户确认前是否允许手动调整日期、渠道和 Owner。
- 客户回复后，未来 Pending Task 的取消规则。

## 8. V1 输出

排班完成后，每条成功创建的 Task 至少写入：

- Follow-up Contact
- Owner
- Creation Method
- Template（可选）
- Scheduled At
- Priority：Manual Task 自动写入 P0；Automated Task 根据联系人状态写入 P1 或 P2
- Channel
- Task Status = Pending
- Notes（仅在需要记录中文异常或人工说明时填写）

无法通过资格、联系人或渠道校验的候选任务不写入 TaskDB，而是在预览或结果页面中返回具体原因。