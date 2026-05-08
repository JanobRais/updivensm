# UpdiveNSM — O'rnatish va Ishlatish Qo'llanmasi

## Mundarija

1. [Talablar](#1-talablar)
2. [Papka tuzilmasi](#2-papka-tuzilmasi)
3. [Birinchi marta o'rnatish](#3-birinchi-marta-ornatish)
4. [Har kunlik ishlatish](#4-har-kunlik-ishlatish)
5. [Konfiguratsiya](#5-konfiguratsiya)
6. [Qurilma qo'shish](#6-qurilma-qoshish)
7. [Monitoring qanday ishlaydi](#7-monitoring-qanday-ishlaydi)
8. [Portlar va xizmatlar](#8-portlar-va-xizmatlar)
9. [Muammolarni hal qilish](#9-muammolarni-hal-qilish)
10. [Yangilash](#10-yangilash)
11. [Make buyruqlari jadvali](#11-make-buyruqlari-jadvali)

---

## 1. Talablar

| Dastur | Minimum versiya | Tekshirish |
|--------|----------------|------------|
| Docker Desktop | 24.x | `docker --version` |
| Docker Compose | v2.x | `docker compose version` |
| Node.js | 18.x | `node --version` |
| npm | 9.x | `npm --version` |
| Git | har qanday | `git --version` |
| Make | har qanday | `make --version` |

> **Windows foydalanuvchilar uchun:** Make o'rnatish uchun — [chocolatey](https://chocolatey.org/) orqali `choco install make` yoki Git Bash ishlatish mumkin.

---

## 2. Papka tuzilmasi

```
updive nsm/
├── updive-back/          ← Backend (Laravel + LibreNMS)
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── Makefile          ← Barcha buyruqlar shu yerda
│   ├── docker/
│   │   ├── nginx.conf
│   │   ├── supervisord.conf
│   │   ├── entrypoint.sh
│   │   └── updive-nsm.cron
│   └── ...
│
└── updive-front/         ← Frontend (React + Vite)
    └── ui-app/
        ├── src/
        ├── dist/         ← Build natijasi (konteyner shu joydan o'qiydi)
        └── ...
```

> **Muhim:** Barcha `make` buyruqlari `updive-back/` papkasidan ishga tushiriladi.

---

## 3. Birinchi marta o'rnatish

### 3.1 Kodni clone qilish

```bash
git clone <repository-url> "updive nsm"
cd "updive nsm/updive-back"
```

### 3.2 `.env` faylini sozlash

```bash
cp .env.example .env
```

`.env` faylini oching va quyidagilarni tekshiring:

```env
APP_KEY=base64:...          # bo'sh bo'lsa keyingi qadamda generatsiya qilinadi
DB_HOST=db
DB_DATABASE=updive_nsm
DB_USERNAME=updive
DB_PASSWORD=updive_pass
REDIS_HOST=redis
TZ=Asia/Tashkent
```

> **APP_KEY:** Agar bo'sh bo'lsa — keyingi qadamda `make install` avtomatik generatsiya qiladi.

### 3.3 O'rnatish (bitta buyruq)

```bash
make install
```

Bu buyruq avtomatik bajaradi:
1. React frontendni build qiladi (`npm install` + `npm run build`)
2. Docker imagelarni quriladi
3. MariaDB, Redis, App konteynerlarini ishga tushiradi
4. Ma'lumotlar bazasi tayyor bo'lishini kutadi
5. Migrationlarni ishga tushiradi
6. Default ma'lumotlarni seed qiladi

O'rnatish 3–7 daqiqa oladi (internet tezligiga qarab).

### 3.4 Muvaffaqiyatli o'rnatishni tekshirish

```
  UpdiveNSM ready at http://localhost:8091
  Default login: admin / admin
```

Brauzerda `http://localhost:8091` ni oching. Login sahifasi ko'rinishi kerak.

---

## 4. Har kunlik ishlatish

### Ishga tushirish

```bash
cd "updive nsm/updive-back"
make up
```

### To'xtatish

```bash
make down
```

### Qayta ishga tushirish

```bash
make restart
```

### Loglarni ko'rish

```bash
make logs           # App umumiy loglari
make logs-worker    # Queue worker loglari (polling)
```

---

## 5. Konfiguratsiya

### 5.1 Vaqt zonasi

Default: **Asia/Tashkent**. O'zgartirish uchun `docker-compose.yml` va `Dockerfile` da `TZ=` qiymatini o'zgartiring, keyin:

```bash
make build    # Imageni qayta quriladi
```

### 5.2 Ma'lumotlar bazasi

| Parametr | Qiymat |
|----------|--------|
| Host | `localhost:3307` (tashqaridan) |
| Database | `updive_nsm` |
| Username | `updive` |
| Password | `updive_pass` |
| Root password | `root_pass` |

Tashqi dastur (DBeaver, TablePlus) bilan ulashish uchun port `3307`.

### 5.3 Redis

```
Host: localhost
Port: 6381
```

### 5.4 Polling intervali

Default: har **5 daqiqada** barcha qurilmalar so'rovlanadi.

`updive-back/routes/console.php` da o'zgartirish mumkin:

```php
Schedule::command('device:poll all --dispatch')->everyFiveMinutes();
```

### 5.5 Metrics saqlash muddati

```
Raw data:    2 soat saqlash
Hourly (1h): 2 kun saqlash
Daily (1d):  365 kun saqlash
```

O'zgartirish uchun `app/Console/Commands/AggregateMetrics.php`:

```php
private int $rawKeepHours  = 2;    // Raw: 2 soat
private int $hourKeepDays  = 2;    // 1h: 2 kun
private int $dayKeepDays   = 365;  // 1d: 1 yil
```

---

## 6. Qurilma qo'shish

### 6.1 UI orqali (tavsiya etiladi)

1. Dashboard → **Add Device** tugmasini bosing
2. **Hostname / IP** kiriting
3. SNMP versiyasini tanlang (`v2c` ko'p hollarda ishlaydi)
4. Community string kiriting (default: `public`)
5. **Test Connection** — 6 ta diagnostic qadam bajaradi:
   - Ping — host yetib borish mumkinmi?
   - UDP 161 — SNMP port ochiqmi?
   - SNMP Community — community string to'g'rimi?
   - sysDescr — qurilma ma'lumotlarini olish
   - OS Detection — qurilma turi aniqlanadi
6. Test muvaffaqiyatli bo'lsa → **Add Device**

### 6.2 Ping-only qurilma (SNMP yo'q)

Agar qurilma SNMP qo'llab-quvvatlamasa:

1. **Ping only (no SNMP)** checkboxni belgilang
2. **OS Type** kiriting (`ping` yoki `generic`)
3. **Add Device**

### 6.3 SNMPv3 qurilma

1. SNMP `v3` tugmasini bosing
2. Auth Level tanlang:
   - `noAuthNoPriv` — faqat username
   - `authNoPriv` — username + parol
   - `authPriv` — username + parol + shifrlash
3. Tegishli maydonlarni to'ldiring

---

## 7. Monitoring qanday ishlaydi

### Arxitektura

```
Cron (har daqiqa)
    ↓
schedule:run
    ↓
device:poll all --dispatch
    ↓
Redis Queue (poller)
    ↓ ↓ ↓ ↓
W1 W2 W3 W4    ← 4 ta parallel worker
(har biri 1 qurilma, 30 soniya timeout)
    ↓
SNMP polling (LibreNMS)
    ↓
DB yangilanadi (CPU, Memory, Port traffic)
    ↓
metrics:collect (har daqiqa)
    ↓
updive_metrics jadval (raw)
    ↓
metrics:aggregate (har soat)
    ↓
1h → 1d aggregation
```

### Queue holatini ko'rish

```bash
make poll-status
```

Natija:

```
Queue: poller
Pending jobs: 0
Failed jobs: 0
Workers: 4 active
```

---

## 8. Portlar va xizmatlar

| Port | Xizmat | Tavsif |
|------|--------|--------|
| `8091` | UpdiveNSM UI | Asosiy veb interfeys |
| `5176` | Frontend Dev Server | Development uchun (ixtiyoriy) |
| `3307` | MariaDB | Tashqi DB ulanish |
| `6381` | Redis | Tashqi Redis ulanish |
| `16101–16105` | SNMP Simulatorlar | Faqat dev/test uchun |

### Dev serverni ishga tushirish (ixtiyoriy)

Frontend kodni o'zgartirish paytida hot-reload uchun:

```bash
make up-dev    # SNMP simulatorlar bilan
```

Yoki alohida:

```bash
cd "updive nsm/updive-front/ui-app"
npm run dev    # http://localhost:5176 da ishlaydi
```

---

## 9. Muammolarni hal qilish

### 9.1 Sahifa ochmaydi (`http://localhost:8091`)

```bash
# Konteyner holatini tekshiring
docker compose ps

# Barcha konteynerlar Running bo'lishi kerak:
# updive-nsm-app    Running
# updive-nsm-db     Running
# updive-nsm-redis  Running
```

Agar App `Exited` holida bo'lsa:

```bash
make logs    # Xatoni ko'ring
make up      # Qayta ishga tushiring
```

### 9.2 "502 Bad Gateway"

PHP-FPM yoki nginx xatosi. Tekshirish:

```bash
make logs
# php-fpm yoki nginx xatosini qidiring
```

Hal qilish:

```bash
make restart
```

### 9.3 Qurilma qo'shilmaydi ("SNMP error")

1. **Test Connection** tugmasini bosing — qaysi qadam xato ekanini ko'rasiz
2. Eng ko'p uchraydigan muammolar:
   - Firewall UDP 161 portni bloklaydi
   - Community string noto'g'ri (`public` emas boshqa narsa)
   - SNMP xizmat qurilmada o'chirilgan

### 9.4 Grafiklar ko'rsatmaydi

Metrics ma'lumotlar yig'ilmayapti. Tekshirish:

```bash
make poll-status           # Queue holatini ko'ring
make logs-worker           # Worker loglarini ko'ring
```

Agar qurilmalar pollingga tushmayapti:

```bash
docker compose exec --user www-data app php artisan device:poll all --dispatch
# Keyin 1 daqiqa kuting va sahifani yangilang
```

### 9.5 Ma'lumotlar bazasi xatosi

```bash
make migrate    # Pending migrationlarni qo'llang
```

Agar jiddiy xato bo'lsa:

```bash
make shell      # Container ichiga kiring
php artisan migrate:status    # Qaysi migrationlar qo'llanmagan
```

### 9.6 Frontend o'zgarmaydi (kesh muammosi)

```bash
make build-ui    # Frontendni qayta build qiling
```

Brauzerda `Ctrl+Shift+R` (hard refresh).

### 9.7 Loglarni tozalash

```bash
make shell
truncate -s 0 storage/logs/laravel.log
truncate -s 0 storage/logs/worker.log
```

---

## 10. Yangilash

### Kod yangilanishida

```bash
cd "updive nsm"
git pull

cd updive-back
make build-ui    # Agar frontend o'zgarsa
make migrate     # Agar yangi migrationlar bo'lsa
make restart     # App qayta ishga tushadi
```

### Dockerfile yoki supervisord.conf o'zgarsa

Docker imageni qayta quriladi:

```bash
make build    # ~3-5 daqiqa
```

### To'liq qayta o'rnatish (ma'lumotlar tozalanadi!)

```bash
make down
docker compose down -v    # Volume ham o'chadi (DB tozalanadi!)
make install
```

> **Diqqat:** `-v` flag ma'lumotlar bazasini to'liq o'chiradi.

---

## 11. Make buyruqlari jadvali

| Buyruq | Tavsif |
|--------|--------|
| `make install` | Birinchi marta o'rnatish (UI build + up) |
| `make up` | Xizmatlarni ishga tushirish |
| `make down` | Xizmatlarni to'xtatish |
| `make restart` | App konteynerini qayta ishga tushirish |
| `make build` | Docker imageni qayta qurilish |
| `make build-ui` | React frontendni build qilish |
| `make logs` | App loglarini ko'rish |
| `make logs-worker` | Queue worker loglarini ko'rish |
| `make migrate` | Migrationlarni qo'llash |
| `make seed` | Alert qoidalarini yuklash |
| `make poll-status` | Polling queue holatini ko'rish |
| `make shell` | Container ichiga kirish (bash) |
| `make tinker` | PHP REPL (artisan tinker) |

---

## Tez boshlash (Quick Start)

```bash
# 1. Kodni oling
git clone <url> "updive nsm"
cd "updive nsm/updive-back"

# 2. O'rnating
make install

# 3. Oching
# http://localhost:8091
# Login: admin / admin
```

---

*UpdiveNSM — Laravel + LibreNMS + React asosidagi tarmoq monitoring tizimi*
