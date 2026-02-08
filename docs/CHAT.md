# Chat — Async Agent Conversations

Stage chat UI for human-in-the-loop conversations with emTesseract agents. Uses the same Ollama models as roundtables; responses run in the background so you can leave and return.

## Flow

1. User selects agent, sends message.
2. API inserts user message + pending assistant row, returns `session_id` immediately.
3. LLM runs in background (`setImmediate`), writes response to DB when done.
4. Client polls `GET /api/chat/session/:id` every 2s until assistant message has `status: done` or `failed`.
5. Polling pauses when tab is hidden; resumes on focus.
6. History persists in DB; returning to chat loads from server.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Send message. Body: `{ agent_id, content, session_id? }`. Returns `{ session_id, assistant_message_id }`. |
| GET | `/api/chat/session/:id` | All messages for session. Used for polling. |
| GET | `/api/chat/sessions?agent_id=X` | Recent sessions for agent (optional; client uses localStorage for session mapping). |

## Tables

- **ops_chat_sessions** — `id`, `agent_id`, `created_at`
- **ops_chat_messages** — `id`, `session_id`, `role`, `content`, `status`, `created_at`
  - `role`: `user` \| `assistant`
  - `status`: `pending` \| `done` \| `failed`

## Verify Async Works

1. **Manual:** Send a message, leave immediately (e.g. to Stage). Wait 30–60s. Return to Chat, select same agent. Response should appear.
2. **DB:** `psql "$DATABASE_URL" -c "SELECT role, LEFT(content,40), status, created_at FROM ops_chat_messages ORDER BY created_at DESC LIMIT 10;"`
3. **Network:** DevTools → Network; send message; observe polling to `/api/chat/session/<uuid>` every 2s. Navigate away; polling stops. Return; select agent; single fetch loads session with completed response.

## Config

- `stage/config.js` — `apiUrl` (empty = same origin). Chat requires API server (Boomer); static Cloudflare deployment has no `/api/chat`.
