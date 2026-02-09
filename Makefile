# emTesseract — Makefile
# Run from project root. Uses just/make for common tasks.

PROJECT_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
USER := $(shell whoami)

.PHONY: deploy deploy-files install deps migrate seed status stop

# Deploy to Boomer: deps → migrate → seed → install (chained).
# Requires: sudo (for systemctl)
deploy: install

# Install node deps
deps:
	npm install

# Run DB migrations (depends on deps)
migrate: deps
	npm run migrate

# Seed agents and trigger rules (bootstrap observer). Idempotent. Depends on migrate.
seed: migrate
	npm run seed

# Install services (requires sudo). Prereqs: deploy-files, migrate, seed
# Restart ensures services pick up new code on re-deploy.
install: deploy-files seed
	sudo cp build/systemd/emtesseract-*.service /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable emtesseract-heartbeat emtesseract-worker emtesseract-content emtesseract-crawl emtesseract-roundtable emtesseract-api
	sudo systemctl restart emtesseract-heartbeat emtesseract-worker emtesseract-content emtesseract-crawl emtesseract-roundtable emtesseract-api
	@echo "Services enabled and restarted"

# Generate systemd unit files from templates
deploy-files:
	@mkdir -p build/systemd
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-heartbeat.service.in > build/systemd/emtesseract-heartbeat.service
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-worker.service.in > build/systemd/emtesseract-worker.service
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-roundtable.service.in > build/systemd/emtesseract-roundtable.service
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-api.service.in > build/systemd/emtesseract-api.service
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-content.service.in > build/systemd/emtesseract-content.service
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-crawl.service.in > build/systemd/emtesseract-crawl.service
	@echo "Generated build/systemd/*.service"

# Show service status
status:
	@systemctl is-active emtesseract-heartbeat emtesseract-worker emtesseract-content emtesseract-crawl emtesseract-roundtable emtesseract-api 2>/dev/null || true
	@sudo systemctl status emtesseract-heartbeat emtesseract-worker emtesseract-content emtesseract-crawl emtesseract-roundtable emtesseract-api --no-pager 2>/dev/null || true

# Stop services
stop:
	sudo systemctl stop emtesseract-heartbeat emtesseract-worker emtesseract-content emtesseract-crawl emtesseract-roundtable emtesseract-api
	@echo "Services stopped"
