# Local Postgres on Boomer

Run emTesseract entirely on Boomer—no Supabase, no cloud.

## 1. Install Postgres on Boomer

```bash
npm run setup-postgres
```

Or manually:

```bash
sudo apt update
sudo apt install postgresql postgresql-client
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo -u postgres psql -c "CREATE USER emtesseract;"
sudo -u postgres psql -c "CREATE DATABASE emtesseract_ops OWNER emtesseract;"
```

**Note:** If your `pg_hba.conf` requires password auth for localhost, run:
`sudo -u postgres psql -c "ALTER USER emtesseract WITH PASSWORD 'your-password';"`
Then add to `.env`: `PGPASSWORD=your-password` (migrate uses it; no typing).

## 2. Configure .env

```bash
# Local Postgres (trust auth — no password)
DATABASE_URL=postgresql://emtesseract@localhost:5432/emtesseract_ops

# Ollama (same machine)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder-next-32k
```

## 3. Run migrations

```bash
cd /path/to/emtesseract.com
npm install
npm run migrate
```

Migration 015 (RLS) is skipped automatically when `DATABASE_URL` does not contain `supabase`—local Postgres does not have the `anon` role.

## 4. Seed agents and trigger rules

```bash
npm run seed
```

This seeds the bootstrap observer trigger so the system can self-start. See [SEED_TRIGGERS.md](SEED_TRIGGERS.md).

## 5. Run workers and API

```bash
cd workers && npm install && npm run heartbeat &
cd workers && npm run worker &
cd .. && npm run api &
```

Or with systemd for production:

```bash
make deploy
```

This does: deps → migrate → seed → install (systemd). Uses `systemctl restart` so services pick up new code on re-deploy.

## 6. Stage dashboard

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
