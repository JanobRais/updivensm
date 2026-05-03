# UpdiveNSM — Project Overview

> LibreNMS asosidagi tarmoq monitoring tizimi. Docker'da ishlaydigan SNMP simulator switchlar bilan to'liq ishlab chiqilgan.

---

## Arxitektura

```
updive-nsm-app   (Laravel + LibreNMS)  → http://localhost:8080
updive-nsm-db    (MariaDB 10.11)
updive-nsm-redis (Redis)
snmp-switch-01   (tandrup/snmpsim)     → UDP 16101
snmp-switch-02   (tandrup/snmpsim)     → UDP 16102
snmp-switch-03   (tandrup/snmpsim)     → UDP 16103
snmp-switch-04   (tandrup/snmpsim)     → UDP 16104
snmp-switch-05   (tandrup/snmpsim)     → UDP 16105

React UI (Vite)  → http://localhost:5173
```

---

## Virtual Switchlar

| Container      | sysName         | Model             | Joylashuv              | Uplink    |
|----------------|-----------------|-------------------|------------------------|-----------|
| snmp-switch-01 | sw-tas-acc-01   | Cisco Catalyst 2960-X | Toshkent (mustaqil) | —         |
| snmp-switch-02 | sw-sam-acc-01   | Cisco Catalyst 3750-X | Samarqand Access    | —         |
| snmp-switch-03 | sw-sam-fl1-01   | Cisco Catalyst 2960S  | Samarqand 1-qavat   | sw-sam-acc-01 Gi1/0/4 |
| snmp-switch-04 | sw-sam-fl2-01   | Cisco Catalyst 2960S  | Samarqand 2-qavat   | sw-sam-acc-01 Gi1/0/5 |
| snmp-switch-05 | sw-sam-mgmt-01  | Cisco Catalyst 2960C  | Samarqand MGMT      | sw-sam-acc-01 Gi1/0/6 |

- **SNMP**: community `public`, v2c, port 161
- **snmprec fayl joyi**: `updive-back/snmpsim/data/switch-XX/public.snmprec`
- **Port soni**: switch-01/02/03/04 → 8 port, switch-05 → 6 port

---

## LLDP Topologiyasi

Switch-02 (SW-SAM-ACC-01) → switch-03/04/05 ni downlink portlarida LLDP e'lon qiladi:

```
switch-02 Gi1/0/4  ←→  switch-03 Gi0/24  (SW-SAM-FL1-01)
switch-02 Gi1/0/5  ←→  switch-04 Gi0/24  (SW-SAM-FL2-01)
switch-02 Gi1/0/6  ←→  switch-05 Gi0/12  (SW-SAM-MGMT-01)
```

LibreNMS `links` jadvaliga avtomatik to'ldiriladi (`device:discover` dan keyin).

**snmprec da LLDP OID tartibi**: `1.0.8802.x` OIDlar fayl boshida bo'lishi shart (1.3.6.1.x dan oldin, leksikografik tartib).

---

## Backend — Qo'shilgan API Endpointlar

Fayl: `updive-back/routes/api.php`

```
GET  /api/v0/device_relationships     — parent→child hostname juftlari (topologiya uchun)
GET  /api/v0/devices/{hostname}/processors  — CPU ma'lumotlari
GET  /api/v0/devices/{hostname}/mempools    — RAM ma'lumotlari
```

Standart LibreNMS endpointlar (ishlatilayotganlari):
```
GET  /api/v0/devices/{hostname}/links       — LLDP qo'shnilari
PATCH /api/v0/devices/{hostname}            — field/data juftligi bilan yangilash
```

### API v1 (Laravel Form Request)
```
POST /api/v1/alert-rules   — yangi alert qoidasi yaratish (validatsiya bilan)
```

### API v2 (to'liq alert boshqaruvi)
```
GET/POST /api/v2/alerts, /api/v2/alerts/{id}/ack|unack|mute|unmute
POST     /api/v2/alerts/bulk/ack|unack|mute
GET/POST/PUT/DELETE/PATCH /api/v2/alert-rules, /api/v2/alert-rules/{id}/toggle
GET      /api/v2/alert-log, /api/v2/alerts/stats, /api/v2/alerts/grouped
```

---

## Backend — Avtomatik Polling

Fayl: `updive-back/routes/console.php`

```php
Schedule::command('device:poll all')    ->everyFiveMinutes();
Schedule::command('device:discover all')->hourly();
```

Container ichida ishga tushirish:
```bash
docker exec -u www-data updive-nsm-app php artisan schedule:work &
```

> **Muhim**: Container restart bo'lsa bu jarayon to'xtaydi. Supervisor yoki entrypoint'ga qo'shilmagan.

---

## Frontend — Sahifalar

Fayl joylari: `updive-front/ui-app/src/pages/`

### Dashboard.jsx
- Stat kartalar: devices, alerts, ports, uptime
- **Network Topology SVG**: `device_relationships` API orqali haqiqiy ierarxiya
  - Level 1: parent'i yo'q qurilmalar (CORE ga ulangan)
  - Level 2: parent'i bor qurilmalar (to'g'ri parent'ga ulangan)
- Recent Events, Top Talkers

### DeviceDetails.jsx
- URL: `/#device-details/{hostname}`
- **SwitchPanel komponenti**: Dark chassis, portlar rangli (yashil=up, qizil=down, kulrang=admin-down)
  - Port soni ≤12 → 1 qator; >12 → 2 qator (48-port uchun 2×24)
  - Port o'lchami: `flex:1`, `minWidth:24`, `maxWidth:56`
  - LLDP qo'shni ulangan portlar: **sariq border + glow**, ostida qisqa hostname
- **PortDetail komponenti**: Bosib tanlangan port uchun to'liq ma'lumot
  - Traffic: In/Out rate, Utilization %
  - Barcha maydonlar: ifIndex, Speed, MTU, MAC, errors, discards...
  - Agar LLDP link bo'lsa: `⬡ SW-SAM-FL1-01 — Gi0/24` badge
- Tablar: Overview, Interfaces, CPU, Memory, Alerts, Eventlog, Graphs

### AllPages.jsx → DevicesPage
- Jadval ustunlari: Hostname (sysName + hostname), IP, **sysObjectID**, OS, Status, Uptime
- **sysObjectID**: indigo badge, hover'da to'liq OID
- `sysName` bo'lsa ustun bo'yicha ko'rsatiladi, hostname kichik matn sifatida
- **Edit modal** (`EditDeviceModal`):
  - Read-only: Hostname, Current IP, sysObjectID, Hardware, OS, Version
  - Tahrirlash: Display Name, **Override IP** (`overwrite_ip`), Community, SNMP Version, Port, Purpose, Notes
  - `PATCH /api/v0/devices/{hostname}` orqali har bir maydon alohida saqlanadi
- **sysObjectID ni edit qilish imkoni yo'q** — polling'da qurilmadan qayta o'qiladi, foydasiz

### AlertsPage.jsx
- Active/acknowledged/muted alertlarni ko'rsatish
- Ack, Unack, Mute amallar (v2 API)
- Bulk select + bulk actions

### AlertRulesPage.jsx
- Alert qoidalari ro'yxati (v2 API)
- Yangi qoida yaratish (v1 API — Form Request validatsiya)
- Toggle enable/disable, delete

---

## Frontend — API Client

Fayl: `updive-front/ui-app/src/api.js`

- `api` (axios) → `/api/v0` — asosiy LibreNMS API
- `apiV1` (axios) → `/api/v1` — Form Request endpointlar
- `apiV2` (axios) → `/api/v2` — kengaytirilgan alertlar
- **30 soniyalik in-memory cache** (`CACHE` Map, TTL=30000ms)
- `invalidateCache(prefix)` — prefiks bo'yicha cache tozalash

---

## snmprec Fayl Formati

```
OID|type|value
```

| Type kodi | Ma'nosi         |
|-----------|-----------------|
| `2`       | Integer         |
| `4`       | OctetString (ASCII) |
| `4x`      | OctetString (HEX) |
| `64`      | Counter32       |
| `65`      | Gauge32         |
| `66`      | TimeTicks       |
| `70`      | Counter64       |

**Muhim qoidalar**:
1. OIDlar fayl ichida o'sish tartibida bo'lishi shart
2. `1.0.8802.x` (LLDP) OIDlar `1.3.6.1.x` dan OLDIN keladi
3. ifOperStatus: `1`=up, `2`=down; ifAdminStatus: `1`=up, `2`=down

---

## Qurilma Qo'shish (LibreNMS)

```bash
# Container ichida
docker exec -u www-data updive-nsm-app \
  php artisan device:add snmp-switch-03 --v2c --community public

# Darhol discover + poll
docker exec -u www-data updive-nsm-app php artisan device:discover snmp-switch-03
docker exec -u www-data updive-nsm-app php artisan device:poll snmp-switch-03

# UI orqali ham qo'shish mumkin: /#devices → + Add Device
```

---

## Muhim Fayllar

| Fayl | Vazifa |
|------|--------|
| `updive-back/docker-compose.yml` | Barcha containerlar konfiguratsiyasi |
| `updive-back/routes/api.php` | API routelar (v0/v1/v2) |
| `updive-back/routes/console.php` | Cron scheduler |
| `updive-back/snmpsim/data/switch-XX/public.snmprec` | Virtual switch SNMP ma'lumotlari |
| `updive-front/ui-app/src/api.js` | Frontend API client + cache |
| `updive-front/ui-app/src/pages/DeviceDetails.jsx` | Switch panel + port detail |
| `updive-front/ui-app/src/pages/Dashboard.jsx` | Topologiya + dashboard |
| `updive-front/ui-app/src/pages/AllPages.jsx` | Devices/Ports/Alerts ro'yxatlari |
| `updive-front/ui-app/vite.config.js` | Vite proxy konfiguratsiyasi |
