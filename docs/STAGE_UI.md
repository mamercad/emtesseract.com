# Stage UI — Ops Dashboard

Stage is the frontend for emTesseract Ops. It shows agent activity, missions, and the workflow board.

## Pages

| Page | Path | Purpose |
|------|------|---------|
| Stage | `/stage/` | Signal feed, mission cards, Give task form |
| Swimlane | `/stage/swimlane.html` | Kanban-style workflow (Proposal → Approved → In progress → Done) |
| Chat | `/stage/chat.html` | Chat with agents (Ollama; uses agent system_directive) |

## Architecture

- **Vanilla JS** — No framework. `stage/app.js` (main), `stage/swimlane.js` (board), `stage/chat.js` (chat), `stage/shared.js` (utils).
- **API** — Fetches from `/api/ops_*` endpoints. Configure `apiUrl` in `stage/config.js` when API runs elsewhere.
- **Config** — `stage/config.js` (gitignored). Copy from `config.example.js`.

## Chat API

- **POST /api/chat** — Send message: `{ agent_id, content, session_id? }`. Creates session if new; returns `{ session_id, message }` with background LLM processing.
- **GET /api/chat/session/:id** — Messages for a session.
- **GET /api/chat/sessions?agent_id=** — Recent sessions for an agent.

## Data Refresh

**Flicker-free incremental updates:**

- **Feed** — Appends new events at top. Full replace only when filters change.
- **Missions** — Diffs by ID; updates existing cards in place.
- **Swimlane** — Diffs by ID; updates/moves cards between lanes in place.

**Polling:**

- Feed: 10s
- Missions: 20s
- Swimlane: 15s

**Visibility** — Polling pauses when the tab is hidden (Page Visibility API); resumes when visible.

## Key Features

- **Task IDs** — Short ID (8 chars) in mission cards, swimlane cards, feed items. Full ID in tooltip.
- **Swimlane counts** — Column headers show count: `Proposal (2)`, `Done (3)`.
- **Give task** — Manual proposal creation (agent, title, kind, topic).

## Files

```
stage/
├── index.html      # Stage main page
├── swimlane.html   # Workflow board page
├── chat.html       # Chat with agents
├── app.js          # Feed, missions, Give task
├── swimlane.js     # Workflow board logic
├── chat.js         # Chat UI, /api/chat
├── shared.js       # escapeHtml, formatTime, installVisibilityPolling
├── stage.css       # Styles
├── config.js       # apiUrl (gitignored)
└── config.example.js
```
