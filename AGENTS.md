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

**Unit tests** (no DB): `tests/unit/*.test.mjs` — pure logic for utils, llm, format-config.
**Integration tests** (need Postgres): `tests/integration/*.test.mjs` — proposal-service, db. Skip when `DATABASE_URL` unset.

## Conventions

- **CSS:** Variables in `:root` and `assets/css/variables.css`; BEM-like class names; mobile-first
- **Theme vars:** Use semantic tokens (e.g. `var(--text-100)`, `var(--accent)`, `var(--bg-card)`)
- **Assets:** SVG preferred; PNG for logo/photos
- **Test:** 1920×1080 and mobile viewport

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

`/stage/` shows the multi-agent ops system: signal feed (events), missions list, agent avatars. Requires Supabase:

1. Edit `stage/config.js` with your Supabase URL and anon key
2. Run migrations in `migrations/`
3. Configure RLS for `ops_agent_events`, `ops_missions`, `ops_mission_steps`, `ops_agents`
4. For realtime: enable Replication for `ops_agent_events` in Supabase

See `SETUP.md` for step-by-step setup. See `plans/AGENTS_AT_WORK.md` for the full system architecture.
