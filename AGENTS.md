# AGENTS.md

Guidance for AI agents working on the emTesseract site.

## Project Overview

Static marketing/landing page for **emTesseract** — family game development company. Single HTML file + CSS, no build step. Deployed via Cloudflare Workers (static assets; custom domain: emtesseract.com).

## Structure

```text
emtesseract.com/
├── index.html          # Main page
├── style.css           # All styles
├── logo.png            # Site logo
├── 404.html            # Custom 404 (theme-aware)
├── stage/              # Ops dashboard (multi-agent system)
│   ├── index.html      # Stage page
│   ├── roundtables.html # Watch agent conversations
│   ├── stage.css       # Stage-specific styles
│   ├── app.js          # Signal feed, missions, Supabase client
│   ├── config.js       # Supabase URL + anon key (edit for your project)
│   └── config.example.js
├── workers/            # Node.js workers (heartbeat, proposal-service)
├── tests/             # Unit + integration (utils, llm, proposal-service)
├── migrations/         # Supabase SQL migrations (ops_*)
├── plans/              # AGENTS_AT_WORK.md (tutorial reference)
├── wrangler.toml       # Cloudflare Workers config
├── package.json        # npm scripts (deploy, preview)
├── assets/
│   └── css/variables.css
├── .cursor/
└── .vscode/
```

## Design

- **Typography:** Syne (headings), DM Sans (body)
- **Theme:** Light and dark mode via `[data-theme]`; toggle in header; persists in `localStorage` (key: `emtesseract-theme`)
- **Palette:** Retro arcade — cream/blue (light), stone/cyan (dark); bold borders, offset shadows
- **Hero layout:** Logo and text side-by-side (stacked on mobile)

## Lint & Test

```bash
npm run lint    # markdownlint + stylelint
npm run test    # html-validate + unit tests
npm run test:unit         # Unit tests only (utils, llm, format-config)
npm run test:integration  # Integration tests (requires DATABASE_URL)
npm run test:all          # Full suite + integration
```

**Unit tests** (no DB): `tests/unit/*.test.mjs` — utils, llm, format-config, bluesky-format.
**Integration tests** (need Postgres): `tests/integration/*.test.mjs` — proposal-service (includes post_bluesky, scan_bluesky gates), db, artifacts, policy. Skip when `DATABASE_URL` unset.

**AI agents verifying Stage API:** Use **terminal commands** (`curl`), not web fetch. Web fetch runs from an isolated server that cannot reach private hosts (localhost, `boomer`, etc.). Terminal commands run in the user's environment, so `curl` can reach `boomer`:

```bash
curl -s http://boomer:8788/api/ops_agents | jq '.data[] | {id, display_name}'
```

## "Ship it"

When the user says **"ship it"**, it means: **update docs, refactor, clean, lint, test, commit to the branch, and push the branch.**

Run this workflow:

1. **Update docs** — Ensure AGENTS.md, README, plans, and any new/changed behavior are documented
2. **Refactor** — Simplify and improve code where appropriate
3. **Clean** — Remove dead code, unused imports, debug logs, temporary files
4. **Lint** — `npm run lint` (fix any issues)
5. **Test** — `npm run test` (and `npm run test:integration` if `DATABASE_URL` is set)
6. **Commit** — Commit all changes to the current branch with a clear message
7. **Push** — Push the branch to origin

Do not deploy (Cloudflare/Boomer) unless explicitly asked. "Ship it" means prepare and push the branch.

## Ops Link Visibility (LAN probe)

The Stage link in the main nav is hidden by default and shown only when the Ops API is reachable (i.e., when the user is on the LAN and Boomer is available). A client-side probe fetches `/api/ops_agents` (same-origin when on Boomer, or `http://boomer:8788/api/ops_agents` when on emtesseract.com). On success, the link is revealed. The API server sends CORS headers to allow the cross-origin probe from emtesseract.com. No login required when on the LAN. See `docs/STAGE_UI.md` for setup.

## Conventions

- **CSS:** Variables in `:root` and `assets/css/variables.css`; BEM-like class names; mobile-first
- **Theme vars:** Use semantic tokens (e.g. `var(--text-100)`, `var(--accent)`, `var(--bg-card)`)
- **Assets:** SVG preferred; PNG for logo/photos
- **Test:** 1920×1080 and mobile viewport

## make deploy — Do the Needful

`make deploy` must always **do the needful**: a single command that brings the system to a fully deployed state with no manual steps.

**On Boomer (ops host):** Runs `deps → migrate → seed → deploy-files → install`:
- `npm install`
- DB migrations (`npm run migrate`)
- Seed agents and triggers (`npm run seed`)
- Generate systemd units, copy to `/etc/systemd/system/`, enable and restart services

**Prerequisites:** `DATABASE_URL` in `.env`, `sudo` for systemctl. Run `git pull` before `make deploy` if deploying from a fresh clone or after remote changes.

**Rule for agents:** When adding features that affect deploy (new workers, migrations, seed data), ensure `make deploy` still runs end-to-end. Never require manual steps that could be automated.

## Deployment (Cloudflare Workers)

**Static assets only** — no Worker script; `[assets]` in `wrangler.toml` serves the site.

```bash
npm run deploy
# or: npx wrangler deploy
```

**Custom domain:** Configure in Cloudflare Dashboard → Workers & Pages → emtesseract-com → Domains & routes.

## Preview

```bash
python3 -m http.server 8000
# Open http://localhost:8000
# Stage: http://localhost:8000/stage/
```

## Stage (Ops Dashboard)

`/stage/` shows the multi-agent ops system: signal feed (events), missions list, agent avatars.

**Local hosting (recommended):** API server serves Stage and `/api/ops_*` endpoints. Edit `stage/config.js` with `apiUrl` (empty = same origin). See `SETUP.md` and `docs/LOCAL_POSTGRES.md`.

**Supabase (alternative):** Set Supabase URL and anon key in config; run migrations; configure RLS.

The Stage link in the main nav is shown only when the Ops API is reachable (LAN probe). See "Ops Link Visibility (LAN probe)" above.
