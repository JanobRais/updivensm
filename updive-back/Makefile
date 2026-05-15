# UpdiveNSM — Management Commands
# Usage: make <target>

COMPOSE = docker compose
APP     = $(COMPOSE) exec --user www-data app php artisan

.PHONY: install up down restart build build-ui logs shell \
        migrate seed poll-status alerts-test

# ── Setup ──────────────────────────────────────────────────────────

## First-time install: build frontend + start all services
install: build-ui up
	@echo ""
	@echo "  UpdiveNSM ready at http://localhost:8091"
	@echo "  Default login: admin / admin"
	@echo ""

## Build React frontend (run after any UI changes)
build-ui:
	cd ../updive-front/ui-app && npm install && npm run build

## Rebuild Docker image and restart (after backend Dockerfile changes)
build:
	$(COMPOSE) build app
	$(COMPOSE) up -d app

# ── Services ───────────────────────────────────────────────────────

## Start services (db, redis, app)
up:
	$(COMPOSE) up -d app db redis

## Start with SNMP simulators (for dev/testing)
up-dev:
	$(COMPOSE) up -d

## Stop all services
down:
	$(COMPOSE) down

## Restart the app container (picks up config changes)
restart:
	$(COMPOSE) restart app

# ── Monitoring ─────────────────────────────────────────────────────

## Follow app logs (Ctrl+C to exit)
logs:
	$(COMPOSE) logs -f app

## Follow queue worker logs only
logs-worker:
	$(COMPOSE) exec app tail -f /opt/updive-nsm/storage/logs/worker.log

## Show poller queue status
poll-status:
	$(APP) poller:status

# ── Database ───────────────────────────────────────────────────────

## Run pending database migrations
migrate:
	$(APP) migrate --force

## Seed alert rules and default data
seed:
	$(APP) db:seed --class=AlertRulesSeeder --force

# ── Shell access ───────────────────────────────────────────────────

## Open bash shell in app container
shell:
	$(COMPOSE) exec --user www-data app bash

## Open artisan tinker (PHP REPL)
tinker:
	$(APP) tinker

## Show help
help:
	@grep -E '^##' Makefile | sed 's/## //'
