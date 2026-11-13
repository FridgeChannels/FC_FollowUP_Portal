# Signals｜LinkedIn 入库与 Notion 绑定

把 LinkedIn 动态写入 Supabase 后，Portal `/signals` 即可展示，并挂到对应 Notion 品牌。

Portal **不会**自己抓取 LinkedIn。只要按本文写入，程序即可正常使用。

---

## 流程（端到端）

```
1. 在 Notion 找到品牌的 Follow-up Client 页面 ID
2. 写入 Supabase 表 public.system_notifications
   （type = linkedin.updated，brand_id = 该页面 ID）
3. Portal 读该表 → 用 brand_id 去 Notion 取品牌名/负责人
4. 有权限的 AM / Admin 打开 /signals 看到这条 LinkedIn Signal
```

不要往 Notion 写 Signals 数据。Notion 只提供品牌身份（`brand_id`）。

---

## 1. 写哪张表

```
public.system_notifications
```

---

## 2. 和 Notion 怎么绑（最容易错）

| 字段 | 必须等于 | 说明 |
| --- | --- | --- |
| `brand_id` | Notion **Follow-up Client** 页面 ID | 唯一绑定键 |
| `body.contactId`（可选） | 该品牌下 **Follow-up Contact** 页面 ID，或对应 **Key Person** 页面 ID | 仅联系人面板需要 |

### `brand_id` 硬性要求

1. 必须是 **FC3.0-Follow-up-ClientDB** 里某个品牌页的 page id（不是 ClientDB，不是 Contact，不是 Key Person）。
2. **必须带连字符**，且与 Notion API 返回的 `page.id` **完全一致**。  
   正确：`8b04a997-c66f-40dd-8f23-7234450f3c58`  
   错误：`8b04a997c66f40dd8f237234450f3c58`（能入库，但事件挂不上品牌，`/signals` 看不到）
3. 该页面须已分享给 Portal 使用的 Notion Integration；未分享则品牌解析失败。

从 Notion 浏览器地址复制时，把末尾 32 位十六进制按 UUID 插入连字符：

```
8b04a997c66f40dd8f237234450f3c58
→ 8b04a997-c66f-40dd-8f23-7234450f3c58
```

### 两种业务场景

| 场景 | `brand_id` | `body.contactId` |
| --- | --- | --- |
| 品牌官号动态 | Follow-up Client ID | 不填 |
| 关键人动态（只要出现在 `/signals`） | 所属 Follow-up Client ID | 可不填 |
| 关键人动态 + Brand Detail 联系人 LinkedIn 区块 | 同上 | **必填** Contact 或 Key Person ID |

---

## 3. 每行必填列

| 列 | 必填 | 值 |
| --- | --- | --- |
| `type` | 是 | 固定 `linkedin.updated` |
| `brand_id` | 是 | 带连字符的 Follow-up Client 页面 ID |
| `title` | 是 | 页面上显示的摘要，建议 `LinkedIn update · <一句话>` |
| `body` | 是 | JSON **文本**（见下一节） |
| `dedupe_key` | 是 | 全局唯一；建议 `linkedin.updated:{brand_id}:{帖子URL去query后}` |
| `owner_id` | 否 | 固定 `null` |
| `deep_link` | 建议 | `/signals?brand={brand_id}` |
| `read_at` | 否 | 新事件保持 `null` |
| `created_at` | 否 | 默认 `now()`（发现/入库时间） |

`dedupe_key` 有唯一约束：重复插入会被忽略，可安全重试。

---

## 4. `body` JSON（决定这条能不能显示）

`body` 必须是合法 JSON 字符串。程序解析后校验；**下面三项缺一，整行会被丢弃，页面上看不到**：

| 字段 | 类型 | 要求 |
| --- | --- | --- |
| `relevant` | 布尔 | 必须是 `true`（不能是 `"true"`） |
| `sourceUrl` | 字符串 | 以 `http://` 或 `https://` 开头的完整 URL |
| `publishedAt` | 字符串 | 可解析的 ISO-8601 时间 |

强烈建议同时带上：

| 字段 | 说明 |
| --- | --- |
| `occurredAt` | Signal 时间；不填则用行的 `created_at` |
| `evidence` | 证据/相关性说明 |
| `highPriority` | `true` / `false` |
| `targetType` | `brand_official` 或 `key_person` |
| `targetName` | 监控对象名称 |
| `targetLinkedInUrl` | 公司页或个人主页（元数据，不是帖子 URL） |
| `contactId` | 要挂联系人面板时填写 |

### `sourceUrl` 建议

- 用 LinkedIn **帖子**直链（含 `/posts/`、`/feed/update/`、`/pulse/`、`/activity-` 等）。
- 不要用个人主页 `/in/...` 或公司主页 `/company/...` 充当帖子链接。
- 去掉 `?trk=` 等 query，保证与 `dedupe_key` 一致、可幂等。

### `body` 示例（品牌官号）

```json
{
  "relevant": true,
  "sourceUrl": "https://www.linkedin.com/posts/northstar_product-launch-activity-1234567890",
  "publishedAt": "2026-11-13T00:00:00.000Z",
  "occurredAt": "2026-11-13T00:00:00.000Z",
  "evidence": "Official post mentions a new product line.\nAuthor: Northstar\nTarget: Northstar",
  "targetType": "brand_official",
  "targetName": "Northstar",
  "targetLinkedInUrl": "https://www.linkedin.com/company/northstar/",
  "highPriority": false
}
```

### `body` 示例（关键人 + 联系人面板）

```json
{
  "relevant": true,
  "sourceUrl": "https://www.linkedin.com/posts/ada-lovelace_product-launch-activity-123",
  "publishedAt": "2026-11-13T00:00:00.000Z",
  "occurredAt": "2026-11-13T00:00:00.000Z",
  "evidence": "Key person announced a product initiative.\nAuthor: Ada Lovelace\nTarget: Ada Lovelace",
  "targetType": "key_person",
  "targetName": "Ada Lovelace",
  "targetLinkedInUrl": "https://www.linkedin.com/in/ada-lovelace/",
  "contactId": "REPLACE_WITH_CONTACT_OR_KEY_PERSON_PAGE_ID",
  "highPriority": true
}
```

`contactId` 同样建议使用 **带连字符** 的 Notion page id。

---

## 5. 写入方式（二选一）

### 方式 A：直接插表（推荐交给数据方）

```sql
INSERT INTO public.system_notifications (
  type,
  brand_id,
  owner_id,
  title,
  body,
  deep_link,
  dedupe_key
) VALUES (
  'linkedin.updated',
  '8b04a997-c66f-40dd-8f23-7234450f3c58',  -- 换成真实 Follow-up Client ID（必须带连字符）
  NULL,
  'LinkedIn update · Published a company update relevant to outreach.',
  $${
    "relevant": true,
    "sourceUrl": "https://www.linkedin.com/posts/northstar_hello-activity-1234567890",
    "publishedAt": "2026-11-13T00:00:00.000Z",
    "occurredAt": "2026-11-13T00:00:00.000Z",
    "evidence": "Official post mentions a new product line.\nAuthor: Northstar\nTarget: Northstar",
    "targetType": "brand_official",
    "targetName": "Northstar",
    "targetLinkedInUrl": "https://www.linkedin.com/company/northstar/",
    "highPriority": false
  }$$,
  '/signals?brand=8b04a997-c66f-40dd-8f23-7234450f3c58',
  'linkedin.updated:8b04a997-c66f-40dd-8f23-7234450f3c58:https://www.linkedin.com/posts/northstar_hello-activity-1234567890'
)
ON CONFLICT (dedupe_key) DO NOTHING;
```

### 方式 B：Webhook

```
POST {BASE_URL}/api/webhooks/linkedin-signals
Authorization: Bearer <REPLY_INGEST_TOKEN>
Content-Type: application/json
```

```json
{
  "findings": [
    {
      "brandId": "8b04a997-c66f-40dd-8f23-7234450f3c58",
      "brandName": "Northstar",
      "targetType": "brand_official",
      "targetId": null,
      "targetName": "Northstar",
      "targetLinkedInUrl": "https://www.linkedin.com/company/northstar/",
      "authorName": "Northstar",
      "postUrl": "https://www.linkedin.com/posts/northstar_hello-activity-1234567890",
      "publishedAt": "2026-11-13T08:00:00+08:00",
      "summary": "Published a company update relevant to outreach.",
      "evidence": "Official post mentions a new product line.",
      "relevant": true,
      "priority": "normal"
    }
  ]
}
```

Webhook 额外校验：

- `brandId` 同上，**必须带连字符**
- `relevant` 必须是布尔 `true`
- `postUrl` 必须是帖子直链（个人/公司主页会被拒绝）
- `targetType=key_person` 时 `targetId` 必填
- **不会**自动写入 `body.contactId`；要挂联系人面板请用方式 A，或入库后补字段

成功时表行形状与方式 A 一致（品牌级 Signal）。

---

## 6. 验收清单

1. 表中有行：`type = 'linkedin.updated'`，`brand_id` 为带连字符的 Follow-up Client ID。  
2. 用有权限的 **Account Manager / Admin**（Caller 看不到 Signals）打开：

   ```
   /signals?brand={brand_id}
   ```

3. 应看到 LinkedIn 类型 Signal；页面 Sources 中 LinkedIn 为 Connected。  
4. 表有数据但页面没有该品牌：  
   - `brand_id` 是否带连字符且与 Notion page id 一致  
   - 是否真是 Follow-up Client 页  
   - Notion Integration 是否已共享该页  
   - 当前账号是否有该品牌权限  
5. 有品牌但看不到这条：  
   - `body` 是否合法 JSON  
   - `relevant` / `sourceUrl` / `publishedAt` 是否齐全且类型正确  

---

## 7. 行为说明（避免误判）

- 同一 `dedupe_key` 只保留一条。  
- 内容高度相似的 LinkedIn 事件约 **7 天**内不会反复当作「新」Signal，但仍可在 History 看到。  
- 不要改这条事件的 `read_at` 来表示已读；已读由系统另存。  
- 不要用其它 `type` 冒充 LinkedIn Signal。  
- 插入成功后，页面通常几秒内通过轮询刷新；也可手动刷新 `/signals`。
