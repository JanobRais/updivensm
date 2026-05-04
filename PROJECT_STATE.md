# UpdiveNSM — Loyiha holati

> Yangi AI uchun: bu faylni o'qi, oldingi suhbatlarni o'qishning hojati yo'q.

---

## Tizim arxitekturasi

| Qatlam | Texnologiya | URL |
|--------|-------------|-----|
| Frontend | React + Vite | `http://localhost:5173` |
| Backend | Laravel (LibreNMS fork) | `http://localhost:8080` |
| DB | MariaDB 10.11 | `updive-nsm-db:3306` |
| Redis | Redis alpine | `updive-nsm-redis:6379` |
| SNMP simulyator | snmpsim × 5 | portlar 16101–16105 |

### Docker konteynerlar
```
updive-nsm-app   → Laravel (port 8080→80)
updive-nsm-db    → MariaDB
updive-nsm-redis → Redis
snmp-switch-01..05 → snmpsim (virtual Cisco switches)
```

**Artisan ishlatish:** `docker compose exec -u www-data -w /opt/updive-nsm app php artisan <cmd>`

---

## Backend — API qatlamlari

### `/api/v0` — LibreNMS Legacy API
- Asosan `LegacyApiController` → `api_functions.inc.php` fayl require qiladi
- **Muhim:** Barcha custom routelar legacy routelardan OLDIN yoki `can:global-read` guruhiga kiritilishi kerak, aks holda named route priority oladi

### `/api/v1` — Alert API (AlertV1Controller)
- Alert rules CRUD (Form Request validatsiya bilan)
- Alert log, transports

### `/api/v2` — Alert API v2 (AlertV2Controller)
- Alerts: index, show, stats, active, grouped
- Actions: ack, unack, mute, unmute (single + bulk)
- Alert rules CRUD + toggle
- Alert transports CRUD
- Alert log

---

## Custom qo'shilgan endpointlar

### `/api/v0` ichida (custom closurelar)

```
GET  /api/v0/device_relationships       → parent/child topology
GET  /api/v0/services                   → services + devices JOIN (custom, legacy o'rnini bosdi)
POST /api/v0/services                   → yangi service qo'shish
PATCH /api/v0/services/{id}             → service tahrirlash
DELETE /api/v0/services/{id}            → service o'chirish
GET  /api/v0/eventlog                   → full filter + pagination (from,to,device,type,severity,search)
GET  /api/v0/devices/{hostname}/processors → processor ma'lumotlari
GET  /api/v0/devices/{hostname}/mempools   → mempool ma'lumotlari
GET  /api/v0/system/stats               → [admin] tizim statistikasi
GET  /api/v0/metrics/objects            → [admin] unique object ro'yxati
GET  /api/v0/metrics                    → [admin] metric tarixiy qiymatlar (auto resolution)
GET/PATCH /api/v0/config                → [admin] LibreNMS config
GET/POST/PATCH/DELETE /api/v0/users     → [admin] foydalanuvchilar CRUD
GET/POST/DELETE /api/v0/users/{id}/tokens → [admin] API tokenlar
```

### Routing muhim xatoligi (hal qilingan)
`GET /api/v0/services` legacy `list_services` named route bilan to'qnashardi.
**Yechim:** Legacy routeni custom closure bilan almashtirildi (name saqlab qolindi):
```php
// api.php, can:global-read guruhida:
Route::get('services', function(\Illuminate\Http\Request $req) {
    // DB query bilan services + devices join
})->name('list_services');
```

---

## Custom jadval — `updive_metrics`

```sql
CREATE TABLE updive_metrics (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id    INT UNSIGNED NOT NULL,
  metric_type  VARCHAR(50)  NOT NULL,  -- cpu, mem, port_in, port_out, uptime
  object_id    INT UNSIGNED NULL,      -- port_id (traffic uchun)
  object_name  VARCHAR(128) NULL,      -- ifName (port nomi)
  value        DOUBLE       NOT NULL,
  unit         VARCHAR(20)  NULL,
  collected_at TIMESTAMP    NOT NULL,
  INDEX idx_dev_type_time (device_id, metric_type, collected_at),
  INDEX idx_obj_type_time (object_id, metric_type, collected_at),
  INDEX idx_collected_at  (collected_at)
);
```

**Collector:** `php artisan metrics:collect` — har 5 daqiqada (scheduler orqali)
- `port_in` / `port_out` → `ifInOctets_rate` / `ifOutOctets_rate` (portlardan)
- `cpu` → `processor_usage` (processors jadvalidan)
- `mem` → `mempool_perc` (mempools jadvalidan, mempool_deleted=0)
- `uptime` → devices.uptime (status=1 bo'lganlar)

**Auto resolution** (`GET /api/v0/metrics` da):
- ≤ 24h → `raw` (har 5 daqiqa nuqta)
- 24h–7d → `hour` (soatlik AVG/MIN/MAX)
- > 7d → `day` (kunlik AVG/MIN/MAX)

---

## Frontend — sahifalar

### Mavjud sahifalar (`src/pages/`)

| Fayl | Route | Tavsif |
|------|-------|--------|
| `Dashboard.jsx` | `#dashboard` | Umumiy ko'rinish, stat kartalar, graflar |
| `DeviceDetails.jsx` | `#device-details/{hostname}` | Qurilma tafsilotlari (7 tab) |
| `AllPages.jsx` | turli | Devices, Ports, Logs, Pollers, BGP, va boshqalar |
| `AlertsPage.jsx` | `#alerts` | V2 API bilan alerts (ack/unack/mute/bulk) |
| `AlertRulesPage.jsx` | `#alert_rules` | Alert qoidalar CRUD |
| `LogsPage.jsx` | `#logs` | Zabbix uslubidagi event log (filter, pagination) |
| `MetricsPage.jsx` | `#metrics` | Metric tarix (single chart + dashboard rejim) |
| `ServicesPage.jsx` | `#services` | Services CRUD (status badge, enable/disable) |
| `UsersPage.jsx` | `#users` | Foydalanuvchilar CRUD + API tokenlar |
| `SettingsPage.jsx` | `#settings` | System info, config, alert transports |
| `SystemPage.jsx` | `#system` | Runtime stats, DB jadvallar, poller holati |

### `DeviceDetails.jsx` tablari
1. **Overview** — Switch front panel (port ranglari: yashil/qizil/kulrang/sariq=neighbor), port detail
2. **Interfaces** — Port jadval + detail panel
3. **CPU** — Processor usage progress barlar
4. **Memory** — Mempool usage progress barlar
5. **Alerts** — Qurilmaga tegishli alertlar
6. **Eventlog** — Qurilma event logi
7. **Metrics** — SQL metrics 2×2 grid (CPU, Memory, Traffic In, Traffic Out) + stats karta
8. **Graphs** — RRD graflar `/graph.php` orqali

### `MetricsPage.jsx` rejimlari
- **Single Chart** — bitta metric, bitta object, full LineChart + data jadval
- **Dashboard** — barcha 5 metric turi bir vaqtda 2×2 gridda, port selector

---

## Frontend — API funksiyalari (`src/api.js`)

```js
// 3 ta axios instance:
api    → baseURL: '/api/v0'
apiV1  → baseURL: '/api/v1'
apiV2  → baseURL: '/api/v2'

// Asosiy funksiyalar (v0, 30s cache bilan):
getDevices, getAlerts, getPollers, getServices, getBgp, getOspf,
getVrf, getVlans, getDeviceGroups, getPortGroups, getLocations,
getBills, getPortSecurity, getPorts, getDeviceRelationships, getLogs

// Write (v0, cache yo'q):
addDevice, deleteDevice, updateDevice
createService, updateService, deleteService

// Per-device (v0, hostname bo'yicha cache):
getDeviceDetails, getDevicePorts, getDeviceProcessors,
getDeviceMempools, getDeviceEventlog, getDeviceAlerts,
getDeviceHealth, getInventory, getDeviceLinks

// Metrics (v0, admin):
getMetrics({ device_id, metric_type, object_id, from, to, resolution, limit })
getMetricObjects({ device_id, metric_type })

// Config, Users, Tokens (v0, admin)
getConfig, updateConfig
getUsers, getUser, createUser, updateUser, deleteUser
getUserTokens, createToken, deleteToken

// V1 — Alert Rules:
createAlertRuleV1(form)

// V2 — Alerts:
getAlertsV2, getAlertStatsV2, getAlertDetailV2, getAlertsGrouped, getAlertLogV2
ackAlertV2, unackAlertV2, muteAlertV2, unmuteAlertV2
bulkAckV2, bulkUnackV2, bulkMuteV2
getAlertRulesV2, getAlertRuleV2, createAlertRuleV2, updateAlertRuleV2,
deleteAlertRuleV2, toggleAlertRuleV2
getTransportsV2, getTransportV2, createTransportV2, updateTransportV2, deleteTransportV2
```

---

## Muhim texnik yechimlar

### 1. Graph URLlar
```
✓ /graph.php?type=device_processor&device={device_id}&from=-1d&to=now&width=600&height=200
✓ /graph.php?type=port_bits&id={port_id}&from=-1d&to=now&width=600&height=200
✗ /graph  ← Laravel routedan o'tadi → 500 xato
```

### 2. Alert rules `extra` JSON muammosi
237 ta qoidada `"invert":"false"` (string) edi → PHP `(bool)"false" = true` → noto'g'ri alert.
**Tuzatildi:** Hamma qoidalarda boolean `false` ga o'zgartirildi.

### 3. V2 API disabled rule filtri
```php
->whereHas('rule', fn($r) => $r->where('disabled', 0))
```
Aks holda o'chirilgan qoidalar alertlari ham ko'rinardi.

### 4. Services routing konflikti
Named route `list_services` (legacy) custom unnamed routeni yutib olardi.
**Yechim:** Custom closureni xuddi shu nom bilan `can:global-read` guruhida ro'yxatdan o'tkazish.

---

## Komponentlar (`src/components/`)

### `Charts.jsx` eksportlari
```js
Icon          → inline SVG icon (name prop)
StatCard      → dashboard stat kartasi
Badge         → status badge (ok/warning/critical/active)
TableCard     → sarlavha + tbody wrapper
TD            → table cell
PageHeader    → sahifa boshi (title, desc, action)
BarChartSVG   → ustunli SVG grafik
MiniAreaSVG   → mini area SVG grafik
LineChart     → to'liq chiziqli SVG grafik (MetricsPage uchun)
```

### Mavjud ikonkalar
dashboard, devices, alerts, ports, logs, pollers, activity, database, bgp,
services, inventory, users, settings, chevronRight, bell, search, refresh,
download, filter, arrowUp, arrowDown, menu, close, cpu, wifi, server,
network, eye, checkCircle, xCircle, clock, home, map, **edit, plus, trash, eyeOff, x**

### `Layout.jsx` eksportlari
- `Sidebar` — yon panel (collapsible, nav guruhlar)
- `TopBar` — yuqori panel (breadcrumb, search, notification)

---

## Navbatdagi mumkin bo'lgan ishlar

- `#poller_groups`, `#device_groups`, `#ospf`, `#vrf`, `#vlans`, `#inventory`, `#bills`, `#locations`, `#arp`, `#bgp` sahifalarini API bilan ulash
- `metrics:collect` schedulerni real poller bilan sinxronlashtirish
- Alert notification (Telegram/Slack transport sozlash UI)
- RRD graflarini `/graph.php` orqali barcha sahifalarda to'g'ri ko'rsatish
