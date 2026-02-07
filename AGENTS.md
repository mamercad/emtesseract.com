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
├── wrangler.toml       # Cloudflare Pages config
├── package.json        # npm scripts (deploy, preview)
├── DEPLOY.md           # Deployment guide
├── assets/
│   └── css/variables.css  # Design tokens (light/dark)
├── .cursor/            # Cursor rules and skills
└── .vscode/            # Tasks, settings
```

## Design

- **Typography:** Syne (headings), DM Sans (body)
- **Theme:** Light and dark mode via `[data-theme]`; toggle in header; persists in `localStorage` (key: `emtesseract-theme`)
- **Palette:** Retro arcade — cream/blue (light), stone/cyan (dark); bold borders, offset shadows
- **Hero layout:** Logo and text side-by-side (stacked on mobile)

## Lint & Test

```bash
npm run lint   # markdownlint + stylelint
npm run test   # html-validate (HTML5)
```

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
```
