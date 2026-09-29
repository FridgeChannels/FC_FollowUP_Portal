# Sample Tap 访问同步（第三方）

检测 Sample 页访问，调用入库接口。接口会按 `posthogEventUuid` 幂等，可安全重试。

---

## 1. 同步逻辑

### 触发条件

从 PostHog（或等价数据源）取事件，同时满足：

1. `event = '$pageview'`
2. `properties.$pathname` 匹配 `/p/{SN}`  
   - 例：`/p/93H68D44ER`  
   - `SN` = pathname 去掉前缀 `/p/` 后的整段（保留大小写）

可选辅助：`$current_url` 主机为 `tap.fridgechannels.com`（以 pathname 为准即可）。

### 字段映射

| 来源 | 请求字段 | 必填 |
| --- | --- | --- |
| pathname 解析出的 SN | `sn`（顶层） | 是 |
| `uuid` | `events[].posthogEventUuid` | 是（幂等键，勿自造） |
| `timestamp` | `events[].occurredAt` | 是（ISO-8601，建议 UTC） |
| `properties.$device_id` | `events[].deviceId` | 强烈建议 |
| `distinct_id` | `events[].distinctId` | 否 |
| `properties.$pathname` | `events[].pathname` | 建议 |
| `properties.$current_url` | `events[].url` | 建议 |
| `properties.$geoip_city_name` | `events[].geoCity` | 否 |
| `properties.$geoip_country_name` | `events[].geoCountry` | 否 |
| `properties.$browser` | `events[].browser` | 否 |
| `properties.$os` | `events[].os` | 否 |
| `properties.$referrer` | `events[].referrer` | 否（`$direct` 可原样传） |

`brandId` 可选，一般不传。

### 内部设备（忽略通知）

将自家设备的 PostHog `$device_id` 写入表 `sample_internal_devices` 后，入库会标记 `is_internal=true` 并跳过 Slack 通知：

```sql
INSERT INTO sample_internal_devices (device_id, label)
VALUES ('01a0…', 'Peter iPhone')
ON CONFLICT (device_id) DO UPDATE
SET label = EXCLUDED.label, updated_at = now();
```

Portal Sample 页默认只读缓存；PostHog 回填由 webhook / cron 负责。打开页面最多按 `SAMPLE_PAGE_SYNC_STALE_MINUTES`（默认 360）在后台调度同步，设 `0` 可关闭页面触发同步。

### 推荐流程

```
新 $pageview
  → pathname 匹配 /^\/p\/(.+)$/
  → sn = 捕获组
  → 按上表组 payload
  → POST 入库接口
  → 2xx：用 posthogEventUuid 记为已同步
  → 网络 / 5xx：指数退避重试（同一 uuid 可重复 POST）
  → 401 / 400：告警，检查 token 与 payload
```

同一 `sn` 可批量：`events` 一次放多条。每条 PV 单独 POST 也可以。

---

## 2. 接口调用

```
POST {BASE_URL}/api/webhooks/sample-tap
Authorization: Bearer <REPLY_INGEST_TOKEN>
Content-Type: application/json
```

Token 与现有 Reply / Inbound 回写接口相同。

### Body

```json
{
  "sn": "93H68D44ER",
  "events": [
    {
      "posthogEventUuid": "01234567-89ab-cdef-0123-456789abcdef",
      "occurredAt": "2026-09-29T04:00:00.000Z",
      "deviceId": "018f…",
      "distinctId": "…",
      "pathname": "/p/93H68D44ER",
      "url": "https://tap.fridgechannels.com/p/93H68D44ER",
      "geoCity": "Tokyo",
      "geoCountry": "Japan",
      "browser": "Mobile Safari",
      "os": "iOS",
      "referrer": "$direct"
    }
  ]
}
```

### 成功响应（200）

```json
{
  "ok": true,
  "sn": "93H68D44ER",
  "brandId": "…",
  "received": 1,
  "upserted": 1,
  "notified": 1,
  "experience": "asin_plus"
}
```

以 `ok: true` 且 HTTP 2xx 视为同步成功。`received` / `upserted` 可用于对账。

### 错误

| HTTP | 处理 |
| --- | --- |
| 401 | Token 错误，勿盲重试 |
| 400 | Payload 不合法，检查 `sn` / `posthogEventUuid` / `occurredAt` |
| 5xx / 网络 | 可重试 |

---

## 3. curl 示例

```bash
curl -sS -X POST "$BASE_URL/api/webhooks/sample-tap" \
  -H "Authorization: Bearer $REPLY_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sn": "93H68D44ER",
    "events": [{
      "posthogEventUuid": "third-party-test-001",
      "occurredAt": "2026-09-29T04:00:00.000Z",
      "deviceId": "test-device-001",
      "pathname": "/p/93H68D44ER",
      "url": "https://tap.fridgechannels.com/p/93H68D44ER",
      "geoCity": "Tokyo",
      "geoCountry": "Japan",
      "browser": "Mobile Safari",
      "os": "iOS",
      "referrer": "$direct"
    }]
  }'
```
