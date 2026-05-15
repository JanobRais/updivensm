# UpdiveNSM — O'rnatish Qo'llanmasi

## Talablar

| Dastur | Versiya | Tekshirish |
|--------|---------|-----------|
| Docker | 24+ | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| Git | istalgan | `git --version` |
| Node.js | 18+ | `node --version` (faqat lokal dev uchun) |
| Make | istalgan | `make --version` (ixtiyoriy, qulaylik uchun) |

> Node.js faqat frontend ni lokal build qilish uchun kerak.
> Docker orqali build qilsangiz Node.js talab qilinmaydi.

---

## 1. Kodni yuklab olish

```bash
git clone https://github.com/sizning-repo/updive-nsm.git
cd updive-nsm
```

---

## 2. Konfiguratsiya

### 2.1 Backend `.env` fayl

```bash
cp updive-back/.env.example updive-back/.env
```

`.env` faylini oching va quyidagilarni to'ldiring:

```env
# APP_KEY — majburiy, bo'sh qoldirmang
APP_KEY=                        # quyida avtomatik generatsiya qilinadi

APP_ENV=production
APP_DEBUG=false                 # production da har doim false

# Ma'lumotlar bazasi (docker-compose env bilan mos bo'lishi shart)
DB_HOST=db
DB_PORT=3306
DB_DATABASE=updive_nsm
DB_USERNAME=updive
DB_PASSWORD=YOUR_STRONG_PASSWORD

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Timezone
APP_TIMEZONE=Asia/Tashkent
```

### 2.2 Docker Compose parollari

`updive-back/docker-compose.yml` faylida DB parollarini `.env` dagi bilan mos qiling:

```yaml
app:
  environment:
    - DB_PASSWORD=YOUR_STRONG_PASSWORD      # .env dagi bilan bir xil

db:
  environment:
    - MYSQL_ROOT_PASSWORD=YOUR_ROOT_PASS
    - MYSQL_PASSWORD=YOUR_STRONG_PASSWORD   # .env dagi bilan bir xil
```

---

## 3. Birinchi marta o'rnatish

```bash
cd updive-back
```

### Variant A — Make bilan (tavsiya etiladi)

```bash
make install
```

Bu buyruq quyidagilarni avtomatik bajaradi:
1. React frontend ni build qiladi
2. Docker image larni yaratadi
3. Konteynerlarni ishga tushiradi

### Variant B — Qo'lda

```bash
# 1. Frontend build
cd ../updive-front/ui-app
npm install
npm run build
cd ../../updive-back

# 2. Docker image larni yaratish va ishga tushirish
docker compose build
docker compose up -d app db redis

# 3. APP_KEY generatsiya
docker compose exec --user www-data app php artisan key:generate

# 4. Migratsiyalar
docker compose exec --user www-data app php artisan migrate --force

# 5. Default ma'lumotlar (alert qoidalari va boshqalar)
docker compose exec --user www-data app php artisan db:seed --class=AlertRulesSeeder --force
```

---

## 4. Frontend konteyner (ixtiyoriy)

Frontend ni alohida Docker konteynerda ishga tushirish uchun:

```bash
docker compose up -d frontend
```

> **Eslatma:** Backend (`app` servisi) ham frontend fayllarini serve qila oladi
> (`updive-front/ui-app/dist` → `/opt/updive-nsm/ui`).
> Alohida frontend konteyner kerak bo'lmasa, faqat `make up` yetarli.

---

## 5. Kirish

O'rnatish tugagandan so'ng:

| Xizmat | Manzil |
|--------|--------|
| Web interfeys | http://localhost:8091 |
| Frontend (alohida) | http://localhost:5176 |

**Default login:**
- Login: `admin`
- Parol: `admin`

> Birinchi kirishdan so'ng parolni o'zgartiring!

---

## 6. Portlar

| Port | Xizmat | Tavsif |
|------|--------|--------|
| 8091 | Backend | Asosiy web interfeys |
| 5176 | Frontend | Alohida React konteyner |
| 3307 | MariaDB | DB ga to'g'ridan-to'g'ri ulanish uchun |
| 6381 | Redis | Queue va cache |

---

## 7. Foydali buyruqlar

```bash
# Konteynerlarni ishga tushirish
make up

# To'xtatish
make down

# Qayta ishga tushirish
make restart

# Loglarni ko'rish
make logs

# Queue worker loglarini ko'rish
make logs-worker

# Poller holati
make poll-status

# DB migratsiya
make migrate

# Shell (konteyner ichiga kirish)
make shell

# Frontend ni qayta build qilish (UI o'zgarishlaridan so'ng)
make build-ui

# Barcha buyruqlar
make help
```

---

## 8. Yangilash

```bash
git pull

cd updive-back

# Frontend qayta build
make build-ui

# Backend image yangilash
make build

# Migratsiyalar (yangi versiyada bo'lishi mumkin)
make migrate
```

---

## 9. Muammolarni hal qilish

### Konteyner ishga tushmaydi

```bash
docker compose logs app
```

### "APP_KEY not set" xatosi

```bash
docker compose exec --user www-data app php artisan key:generate
docker compose restart app
```

### DB ulanish xatosi

```bash
# DB konteyner ishlayaptimi?
docker compose ps

# DB loglarini ko'rish
docker compose logs db

# DB ga ulanishni tekshirish
docker compose exec app php artisan tinker
# >>> DB::connection()->getPdo()
```

### Frontend ko'rinmaydi (404)

```bash
# dist/ papka mavjudligini tekshirish
ls updive-front/ui-app/dist/

# Yo'q bo'lsa, qayta build
make build-ui
make restart
```

### Queue worker ishlamaydi

```bash
# Supervisor holatini tekshirish
docker compose exec app supervisorctl status

# Worker ni qayta ishga tushirish
docker compose exec app supervisorctl restart all
```

---

## 10. Xizmatlar arxitekturasi

```
Internet / Brauzer
       │
       ▼
  ┌─────────────────────────────┐
  │  updive-nsm-app (:8091)     │
  │  ┌────────┐  ┌───────────┐  │
  │  │ nginx  │  │  PHP-FPM  │  │
  │  └───┬────┘  └───────────┘  │
  │      │  Supervisor          │
  │      │  ├─ 4 poller workers │
  │      │  ├─ 2 metrics workers│
  │      │  ├─ 2 alerts workers │
  │      │  └─ scheduler        │
  └──────┼──────────────────────┘
         │
    ┌────┴────┐      ┌──────────┐
    │  MariaDB│      │  Redis   │
    │  (:3307)│      │  (:6381) │
    └─────────┘      └──────────┘
```
