# emTesseract — Makefile
# Run from project root. Uses just/make for common tasks.

PROJECT_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
USER := $(shell whoami)

.PHONY: deploy deploy-files install deps migrate status stop

# Deploy to Boomer: deps → migrate → install (chained).
# Requires: sudo (for systemctl)
deploy: install

# Install node deps
deps:
	npm install

# Run DB migrations (depends on deps)
migrate: deps
	npm run migrate

# Install services (requires sudo). Prereqs: deploy-files, migrate
install: deploy-files migrate
	sudo cp build/systemd/emtesseract-*.service /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable emtesseract-heartbeat emtesseract-worker emtesseract-api
	sudo systemctl start emtesseract-heartbeat emtesseract-worker emtesseract-api
	@echo "Services enabled and started"

# Generate systemd unit files from templates
deploy-files:
	@mkdir -p build/systemd
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-heartbeat.service.in > build/systemd/emtesseract-heartbeat.service
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-worker.service.in > build/systemd/emtesseract-worker.service
	sed 's|@PROJECT_ROOT@|$(PROJECT_ROOT)|g;s|@USER@|$(USER)|g' \
		systemd/emtesseract-api.service.in > build/systemd/emtesseract-api.service
	@echo "Generated build/systemd/*.service"

# Show service status
status:
	@systemctl is-active emtesseract-heartbeat emtesseract-worker emtesseract-api 2>/dev/null || true
	@sudo systemctl status emtesseract-heartbeat emtesseract-worker emtesseract-api --no-pager 2>/dev/null || true

# Stop services
stop:
	sudo systemctl stop emtesseract-heartbeat emtesseract-worker emtesseract-api
	@echo "Services stopped"
