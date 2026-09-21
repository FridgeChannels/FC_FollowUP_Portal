# Quo 电话回写匹配

约定 `POST /api/webhooks/quo` 如何把一通电话挂到 Follow-up Task。  
Phone 主路径是 Quo webhook + Call Review；[`POST /api/replies`](./Follow-up｜Reply%20回写接口.md) 的 Phone 仅作补充，不走本规则。

**实现状态：** 任务线（Call ID / 拨打记录）已上线。电话线（对方号码 → 未关闭 Phone Task）为已定方案，尚未实现。实现时按本文拆模块，不要把两套规则写进同一个函数。

---

## 1. 业务前提

1. KeyPerson 手机号不重复：一个号码只对应一个人。
2. 同一 KeyPerson 不能同时挂在多个品牌的 Follow-up Contact 上。
3. 同一客户、同一联系人，同一时间只能有一条 Phone Task；不存在多条同时进行的 Phone Task。
4. 一个 Contact 可以有多条不同渠道的 Task，但同一时间没有两条进行中的任务。
5. 一条 Phone Task 下可以打多次电话。是否为同一通电话，只看 Quo `callId`。

以上保证：对方号码在「当前未关闭 Phone Task」集合里至多命中一条。实现仍须 fail-closed（0 条或多条都不写）。

---

## 2. 两条匹配线

任务线与电话线是互补关系，**禁止写在一起**。匹配逻辑必须独立、互不 import、互不影响。只有任务线拿不到 Task ID 时，才调用电话线。

| | 任务线（现有） | 电话线（新增） |
| --- | --- | --- |
| 何时用 | 已有 Task ID 或可从 Call ID / 拨打记录得到 | 任务线给不出 Task ID |
| 身份来源 | Conversation `QUO_CALL:<callId>`，或门户「Call with Quo」记下的 `taskId` | webhook **对方号码** |
| 负责 | 认「这一通 call / 这一次点击」属于哪条 Task | 仅第一次找到当前未关闭的那条 Phone Task |
| 不负责 | 按 KeyPerson 手机号查 Notion | 判断是不是同一通 call（那是 `callId` 的事） |

模式：**责任链 + 独立 Resolver**。Webhook 只经过一个编排层，顺序固定：

```
Webhook
  └─ Orchestrator（只决定顺序，不含匹配规则）
        ├─ 1. TaskIdentityResolver     // 任务线，独立模块
        └─ 2. OpenPhoneTaskResolver    // 仅当 1 没有 taskId 才调用，独立模块
              └─ 命中后共用 upsert（写库，不是匹配）
```

编排层唯一规则：**任务线有 Task ID → 结束；没有 → 才调用电话线。**

禁止：

- 两条线互相 import
- 共用「怎么找 Task」的函数
- 电话线去查 `QUO_CALL:` 或拨打记录
- 任务线去查 KeyPerson 手机号

可以共用：输入/输出契约、`upsertQuoCallActivity`、无业务含义的数字清洗（若抽取，不得把匹配策略绑进去）。

`matchedBy` 只用于日志，互斥三值：`callId` | `dial-attempt` | `phone`。不要用它分支业务。

---

## 3. 一次 webhook 怎么走

| 情况 | 走哪条 | 原因 |
| --- | --- | --- |
| 同一 `callId` 已挂过 Task | 任务线 | 多次 call 共存时，用 Call ID 认「这一通」 |
| 点过 Call with Quo，拨打记录还在 | 任务线 | 已有 Task ID，电话线不准抢 |
| 没点按钮、也还没有 Conversation | 电话线 | 这才是「拿不到任务 ID」 |
| 电话线挂上并写了 `QUO_CALL:<id>` | 之后全走任务线 | 电话线只做首次挂接 |
| 两条线都未命中 | 不写 Conversation | 与现状一致，不改成冷进线 |

同一 `callId` 的后续事件（recording / transcript / summary）经常没有号码。第一次用号码（若走到电话线），之后必须用 `callId`。

---

## 4. 任务线（现有，保持原样）

内部两步仍属同一条线，不必拆给电话线：

1. 按 `Message ID = QUO_CALL:<callId>` 找 Conversation；若带 Follow-up Task 且能读到该 Task → `matchedBy: callId`。即使该 Task 后来 Completed，同一通 call 的后续事件仍更新这条 Conversation。
2. 否则查本地拨打记录（门户点击时写入的 `taskId` + 号码 + 30 分钟窗口）→ `matchedBy: dial-attempt`。

拨打记录里用号码，只是把 webhook 对上那次点击，**不是**按 Notion 联系人手机号找 Task。

---

## 5. 电话线（新增）

仅当任务线没有 Task ID。

### 5.1 查哪些 Task

1. 只查 Follow-up Task：`Channel = Phone`，且 `Task Status` ∉ {`Completed`, `Failed`, `Cancelled`}。  
   Pending、In Progress、Unqualified 重开后的 Pending 都算。
2. 号码仍以 KeyPerson 为准，经现有任务映射读取 `contactPhone`。  
   **不**在 Task 表另存归一化号码（见 §7）。
3. 在内存里按 §6 与 webhook 对方号码比较。
4. 命中恰好 1 条 → 返回该 Task（`matchedBy: phone`）。0 条或 ≥2 条 → 未匹配，不写库。

Qualified / Cancelled / Failed 之后的新电话：电话线不会挂到已关闭 Task。若还要再打，须先有一条新的未关闭 Phone Task，或再走任务线（重新点拨打）。

### 5.2 用哪个 webhook 号码

只用 **对方号码**：去电用被叫 / external，来电用主叫 / external。

不要用工作区号码（如 `QUO_FROM_NUMBER`），也不要把 `from`、`to`、全部 `participants` 放进同一集合去比。这与任务线的 `callPhones()` 不同，电话线自己取数。

不读、不比 `DEV_CALL_PHONE`。测试号覆盖属于任务线（拨打记录）。

没有时间窗；只看任务是否未关闭。

---

## 6. 内存归一化比较

电话线自有规则，**不要复用**任务线 `normalizeDialPhone`，也 **不要复用** Inbound 回复的后缀包含。

### 6.1 比什么

- 左边：§5.2 的对方号码。
- 右边：该条未关闭 Phone Task 的 `contactPhone`。
- 任一侧为空、或归一化后无效 → 不匹配。

### 6.2 怎么归一化

对每一侧单独做，顺序固定：

1. 去掉分机：从 `ext` / `x` / `分机` 处截断，只保留前面。
2. 只留数字：去掉 `+`、空格、括号、横线等。
3. 去掉国际字冠 `00`：若以 `00` 开头且后面还有国家码，去掉这对 `00`。
4. 美国/加拿大国家码：若结果是 **11 位且以 `1` 开头**，去掉这个 `1`。其它长度不要去掉开头的 `1`。
5. 有效性：结果必须是 **10 位数字**（NANP）。不是 10 位 → 本侧无效。

| 原始 | 归一化后 |
| --- | --- |
| `+1 (415) 555-0182` | `4155550182` |
| `14155550182` | `4155550182` |
| `415-555-0182` | `4155550182` |
| `0014155550182` | `4155550182` |
| `+1 415 555 0182 x99` | `4155550182` |
| `+44 20 7946 0958` | 无效（不是 10 位 NANP） |

当前跟进号按美加号码处理。若以后有非 NANP，再加「去数字后的 E.164 全等」，不要用后缀去凑。

### 6.3 怎么判定命中

- **全等**：两边归一化结果相同才算同一号。
- **不做** `endsWith` / `contains` / 后 7 位。
- 未关闭 Phone Task 集合里：恰好 1 条才命中；0 或 ≥2 视为未匹配。

契约一句话：对方号码与未关闭 Phone Task 的联系人号码，按 NANP 10 位归一化后全等，且全局恰好一条。

---

## 7. 不把号码写入 Task 表

创建 Phone Task 时，**不**把归一化号码写入 Follow-up Task。

联系方式只存在 KeyPerson；Task / Follow-up Contact 不重复保存。电话线的瓶颈是格式，不是跨表跳数。未关闭 Phone Task 受渠道日容量约束，集合很小：先按 Channel + 未关闭状态查 Task，再在内存里比号码。KeyPerson 改号立即生效，也无需回填存量任务。

仅当未关闭 Phone Task 量大到不能拉列表、或 Notion 查询成为明确瓶颈时，再考虑 Task 上的匹配索引列（仍不是主数据，改 KeyPerson 时须同步未关闭 Phone Task）。那是优化，不是本方案的前置。

---

## 8. 实现时的模块边界

尚未实现。落地时建议：

| 模块 | 职责 |
| --- | --- |
| 任务线 Resolver | 现有 Call ID + 拨打记录，原样迁出或就地改名 |
| 电话线 Resolver | 只做对方号码 → 未关闭 Phone Task + §6 |
| Orchestrator | 先任务线，没有 `taskId` 再电话线 |
| upsert | 两条线命中后共用写库 |

单测分开：任务线不准 mock KeyPerson 手机号查询；电话线不准 mock 拨打记录。编排只测「有 Task ID 就不调用电话线」。

---

## 9. 相关文档

- [Reply 回写接口](./Follow-up｜Reply%20回写接口.md) — Phone 补充路径；Quo Call ID 不要当作 `threadId`
- [Inbound 回写接口](./Follow-up｜Inbound%20回写接口.md) — 无已发 Task 的冷进线；Phone **不支持**仅凭号码全局查找。本电话线命中的是未关闭 Phone Task，不是冷进线
- [V1 数据架构规划](./Follow-up｜V1%20数据架构规划.md) §11.1 / §11.4 — 联系方式不在 Task/Contact 上重复保存
- [Thread ID 与 CP 挂靠规则](./Follow-up｜Thread%20ID%20与%20CP%20挂靠规则.md)
- [Test FridgeChannel Peter 五渠道人工测试清单](./Follow-up｜Test%20FridgeChannel%20Peter%20五渠道人工测试清单.md) §10
