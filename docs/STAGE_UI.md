# Stage UI — Ops Dashboard

Stage is the frontend for emTesseract Ops. It shows agent activity, missions, and the workflow board.

## Pages

| Page | Path | Purpose |
|------|------|---------|
| Stage | `/stage/` | Signal feed, mission cards, Give task form |
| Swimlane | `/stage/swimlane.html` | Kanban-style workflow (Proposal → Approved → In progress → Done) |
| Chat | `/stage/chat.html` | Chat with agents (async; [docs/CHAT.md](CHAT.md)) |
| Roundtables | `/stage/roundtables.html` | Watch agent-to-agent conversations (transcripts) |

## Architecture

- **Vanilla JS** — No framework. `stage/app.js` (main), `stage/swimlane.js` (board), `stage/chat.js` (chat), `stage/roundtables.js` (agent conversations), `stage/shared.js` (utils).
- **API** — Fetches from `/api/ops_*` endpoints. Configure `apiUrl` in `stage/config.js` when API runs elsewhere.
- **Config** — `stage/config.js` (gitignored). Copy from `config.example.js`.

## Stage link on main site

The Stage link in the main nav (`index.html`) is hidden by default and shown only when the Ops API is reachable (LAN-only). A client-side probe fetches `/api/ops_agents` (same-origin when on Boomer/localhost:8788) or `http://boomer:8788/api/ops_agents` (when on emtesseract.com). On success, the link is revealed. The API server sends CORS headers (`Access-Control-Allow-Origin: *`) so the cross-origin probe from emtesseract.com works when the user is on the LAN. Requires `boomer` to resolve (DNS or `/etc/hosts`) when visiting emtesseract.com from the LAN.

## Chat API

- **POST /api/chat** — Send message: `{ agent_id, content, session_id? }`. Creates session if new; returns `{ session_id, assistant_message_id }` immediately. LLM runs in background, response written to DB.
- **GET /api/chat/session/:id** — All messages for a session (used for polling).
- **GET /api/chat/sessions?agent_id=X** — Recent sessions for an agent.

## Roundtables API

- **GET /api/roundtables** — List roundtables (id, format, topic, participants, status, created_at, completed_at).
- **GET /api/roundtables/:id** — Single roundtable with full `history` transcript.

**Chat flow:** Client sends → gets `session_id` → polls GET session every 2s until assistant message has `status: done` or `failed`. Polling pauses when tab is hidden; resumes on focus. History persists in DB; user can leave and return to see completed responses.

## Data Refresh

**Flicker-free incremental updates:**

- **Feed** — Appends new events at top. Full replace only when filters change.
- **Missions** — Diffs by ID; updates existing cards in place.
- **Swimlane** — Diffs by ID; updates/moves cards between lanes in place.

**Polling:**

- Feed: 10s
- Missions: 20s
- Step stats: 15s
- Swimlane: 15s
- Chat: 2s (while waiting for assistant response)

**Visibility** — Polling pauses when the tab is hidden (Page Visibility API); resumes when visible.

## Step Stats (Ollama tasks)

- **GET /api/ops_step_stats** — Returns `{ ollama, crawl, bluesky }` each with `{ queued, running, today }`.
- **Ollama** = analyze + write_content steps (LLM-backed).
- **Crawl** = crawl steps (no LLM).
- **Bluesky** = post_bluesky steps (domain worker for Bluesky social).
- **Header** — Stage header shows compact stats: queued, running, completed today. Polls every 15s.

## Key Features

- **Task IDs** — Short ID (8 chars) in mission cards, swimlane cards, feed items. Full ID in tooltip.
- **Swimlane counts** — Column headers show count: `Proposal (2)`, `Done (3)`.
- **Give task** — Manual proposal creation (agent, title, kind, topic). Kinds: analyze, write_content, crawl, post_bluesky.
- **Roundtables** — List completed agent conversations; click to view full transcript.

## Files

```
stage/
├── index.html      # Stage main page
├── swimlane.html   # Workflow board page
├── chat.html       # Chat with agents
├── roundtables.html # Watch agent conversations
├── app.js          # Feed, missions, Give task
├── swimlane.js     # Workflow board logic
├── chat.js         # Chat UI, /api/chat
├── roundtables.js  # Roundtables list + transcript
├── shared.js       # escapeHtml, formatTime, installVisibilityPolling
├── stage.css       # Styles
├── config.js       # apiUrl (gitignored)
└── config.example.js
```
