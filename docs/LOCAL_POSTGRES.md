# Local Postgres on Boomer

Run emTesseract entirely on Boomer—no Supabase, no cloud.

## 1. Install Postgres on Boomer

```bash
sudo apt update
sudo apt install postgresql postgresql-client
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## 2. Create database and user

```bash
sudo -u postgres psql -c "CREATE USER emtesseract WITH PASSWORD 'your-secure-password';"
sudo -u postgres psql -c "CREATE DATABASE emtesseract_ops OWNER emtesseract;"
```

## 3. Configure .env

```bash
# Local Postgres
DATABASE_URL=postgresql://emtesseract:your-secure-password@localhost:5432/emtesseract_ops

# Ollama (same machine)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder-next-32k
```

## 4. Run migrations

```bash
cd /path/to/emtesseract.com
npm install
npm run migrate
```

Migration 015 (RLS) is skipped automatically when `DATABASE_URL` does not contain `supabase`—local Postgres does not have the `anon` role.

## 5. Seed trigger rule

```bash
psql "$DATABASE_URL" -c "
INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
VALUES (
  'Proactive analyze',
  'proactive_analyze_ops',
  '{\"target_agent\": \"observer\", \"steps\": [{\"kind\": \"analyze\", \"payload\": {\"topic\": \"ops_health\"}}]}'::jsonb,
  5,
  true
);
"
```

## 6. Run workers and API

```bash
cd workers && npm install && npm run heartbeat &
cd workers && npm run worker &
cd .. && npm run api &
```

Or with systemd/supervisor for production.

## 7. Stage dashboard

The API server serves both static files and the `/api/ops_*` endpoints. Open:

- `http://localhost:8788` — home
- `http://localhost:8788/stage/` — ops dashboard

To access from another machine, set `apiUrl` in `stage/config.js` to `http://boomer:8788` (or Boomer's IP).

## Ports

| Service   | Port  |
|----------|-------|
| Postgres | 5432  |
| Ollama   | 11434 |
| Stage API| 8788  |

## Troubleshooting

- **Connection refused:** Ensure Postgres is running (`sudo systemctl status postgresql`).
- **Authentication failed:** Check `pg_hba.conf` allows local connections for your user.
- **Migrations fail:** Ensure `psql` is installed (`sudo apt install postgresql-client`).
