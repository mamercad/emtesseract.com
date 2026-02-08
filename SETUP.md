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

```bash
./migrations/migrate.sh
```

If that fails (Supabase REST limits), run each `migrations/*.sql` manually in Supabase Dashboard → SQL Editor.

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

## 5. Stage dashboard (optional)

Edit `stage/config.js`:

```javascript
window.STAGE_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-anon-key",
};
```

Configure RLS in Supabase so the anon key can `SELECT`:

- `ops_agent_events`
- `ops_missions`
- `ops_mission_steps`
- `ops_agents`

For realtime: Database → Replication → enable `ops_agent_events`.

Then open `/stage/` locally or after deploy.

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
