# emTesseract Ops — Setup Guide

Step-by-step to get the multi-agent system running.

---

## 1. Environment variables (`.env`)

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

**MVP uses Ollama on Boomer.** Add:

```bash
# ── Supabase (required) ─────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Ollama (MVP: local LLM) ─────────────────────────────────
# When running ON Boomer (same machine as Ollama):
OLLAMA_BASE_URL=http://localhost:11434

# When running elsewhere, point to Boomer:
# OLLAMA_BASE_URL=http://boomer:11434

OLLAMA_MODEL=llama3.2
```

**Get Supabase keys:** Dashboard → Project Settings → API.

**Ollama on Boomer:** `ollama serve` and `ollama pull llama3.2` (or another model).

---

## 2. Run migrations

**Option A — psql (recommended):**

1. Supabase Dashboard → Project Settings → Database → **Connection string** → **URI**
2. Add to `.env`: `DATABASE_URL=postgresql://...`
3. Install psql: `sudo apt install postgresql-client` (Ubuntu/Debian)
4. Run: `./migrations/migrate.sh`

**Option B — SQL Editor:** Run each `migrations/*.sql` manually in Supabase → SQL Editor.

---

## 3. Seed trigger rules

Migration 005 already seeds `ops_policy`. You only need to add at least one trigger so the heartbeat creates proposals. Run in Supabase SQL Editor:

```sql
-- One proactive trigger (observer runs every ~5 min)
INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
VALUES (
  'Proactive analyze',
  'proactive_analyze_ops',
  '{"target_agent": "observer", "steps": [{"kind": "analyze", "payload": {"topic": "ops_health"}}]}'::jsonb,
  5,
  true
);
```

Run once; duplicate `name` will error if you run again.

---

## 4. Run the heartbeat

```bash
cd workers
npm install
npm run heartbeat
```

Runs every 5 minutes. Triggers fire → proposals → missions → steps (queued).

---

## 5. Stage dashboard

**1. Run RLS migration** (allows anon key to read ops tables):

```bash
./migrations/migrate.sh
```

Or run `migrations/015_ops_rls_stage.sql` manually in Supabase SQL Editor.

**2. Edit `stage/config.js`** with your Supabase URL and anon key:

```javascript
window.STAGE_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-anon-key",
};
```

Get values from Supabase Dashboard → Project Settings → API (Project URL, anon public).

**3. Enable Realtime** (optional, for live event feed): Supabase Dashboard → Database → Replication → enable `ops_agent_events`.

**4. Open Stage:** `http://localhost:8787/stage/` (wrangler dev) or deploy and visit `https://emtesseract.com/stage/`.

---

## 6. Step worker (Ollama on Boomer)

Run the step worker on Boomer (or wherever Ollama runs):

```bash
cd workers
npm install
npm run worker
```

Uses `OLLAMA_BASE_URL` from `.env`. If worker and Ollama are on the same machine, `http://localhost:11434`. If worker runs elsewhere, use `http://boomer:11434` (or Boomer's IP).

**On Boomer:** ensure `ollama serve` is running and `ollama pull llama3.2` (or your chosen model).

---

## Quick checklist

| Step | Command / action |
|------|------------------|
| .env | Copy `.env.example`, add Supabase + Ollama URL |
| Migrations | `./migrations/migrate.sh` |
| Seed | Run SQL above in Supabase |
| Ollama | On Boomer: `ollama serve`, `ollama pull llama3.2` |
| Heartbeat | `cd workers && npm run heartbeat` |
| Step worker | `cd workers && npm run worker` (on Boomer) |
| Stage | Edit `stage/config.js`, set RLS |

---

## Troubleshooting

- **Heartbeat fails:** Check `.env` is loaded (workers read from project root).
- **No proposals:** Ensure `ops_trigger_rules` has at least one row with `enabled = true`.
- **Stage empty:** Check RLS; anon key needs `SELECT` on ops tables.
- **Steps never run:** Step worker must be running; Ollama must be reachable at `OLLAMA_BASE_URL`.
- **Ollama connection refused:** Ensure `ollama serve` on Boomer; if worker is remote, use `http://boomer:11434` or Boomer's IP.
