#!/usr/bin/env bash
# Install Postgres and create emtesseract_ops database for local hosting.
# Idempotent — safe to run multiple times.
#
# Usage: ./scripts/setup-postgres.sh
#
# Creates user emtesseract and database emtesseract_ops with trust auth
# (no password for localhost). Override via env:
#   EMTESSERACT_DB_USER  (default: emtesseract)
#   EMTESSERACT_DB_NAME  (default: emtesseract_ops)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_USER="${EMTESSERACT_DB_USER:-emtesseract}"
DB_NAME="${EMTESSERACT_DB_NAME:-emtesseract_ops}"

# ── Detect OS ────────────────────────────────────────────────

install_postgres() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    case "$ID" in
      ubuntu | debian)
        sudo apt-get update -qq
        sudo apt-get install -y postgresql postgresql-client
        ;;
      *)
        echo "Unsupported OS: $ID. Install postgresql manually." >&2
        exit 1
        ;;
    esac
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    command -v brew &>/dev/null || { echo "Homebrew required" >&2; exit 1; }
    brew install postgresql@16 2>/dev/null || brew install postgresql
  else
    echo "Unsupported OS. Install postgresql manually." >&2
    exit 1
  fi
}

# ── Ensure running ───────────────────────────────────────────

start_postgres() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
  else
    sudo systemctl start postgresql 2>/dev/null || true
    sudo systemctl enable postgresql 2>/dev/null || true
  fi
}

# ── Create user and database ─────────────────────────────────

create_user_and_db() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    PSQL_CMD="psql postgres"
  else
    PSQL_CMD="sudo -u postgres psql"
  fi

  # Create user (ignore error if exists)
  $PSQL_CMD -v ON_ERROR_STOP=0 -c "CREATE USER $DB_USER;" 2>/dev/null || true

  # Create database (ignore error if exists)
  $PSQL_CMD -v ON_ERROR_STOP=0 -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
}

# ── Main ─────────────────────────────────────────────────────

echo "Installing Postgres..."
install_postgres

echo "Starting Postgres..."
start_postgres

# Wait for postgres to be ready
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if command -v pg_isready &>/dev/null && pg_isready -q 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "Creating user '$DB_USER' and database '$DB_NAME'..."
create_user_and_db

echo ""
echo "✓ Postgres ready."
echo ""
echo "Add to .env:"
echo "  DATABASE_URL=postgresql://${DB_USER}@localhost:5432/${DB_NAME}"
echo ""
echo "Then run: npm run migrate"
