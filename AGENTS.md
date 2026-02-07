# AGENTS.md

Guidance for AI agents working on the emTesseract site.

## Project Overview

Static marketing/landing page for **emTesseract** — family game development company. Single HTML file + CSS, no build step. Deployed via Cloudflare Pages (custom domain: emtesseract.com).

## Structure

```
emtesseract.com/
├── index.html          # Main page
├── style.css           # All styles
├── logo.png            # Site logo
├── 404.html            # Custom 404 (theme-aware)
├── wrangler.toml       # Cloudflare Pages config
├── package.json        # npm scripts (deploy, preview)
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

## Conventions

- **CSS:** Variables in `:root` and `assets/css/variables.css`; BEM-like class names; mobile-first
- **Theme vars:** Use semantic tokens (e.g. `var(--text-100)`, `var(--accent)`, `var(--bg-card)`)
- **Assets:** SVG preferred; PNG for logo/photos
- **Test:** 1920×1080 and mobile viewport

## Deployment (Cloudflare Pages)

**Git integration:** Build command (empty) or `exit 0`; build output directory `/`.

**Wrangler CLI (direct upload):**

```bash
npm install
npm run deploy
# or: npx wrangler pages deploy .
```

Requires `wrangler.toml` with `name` and `pages_build_output_dir`. Project must exist in Cloudflare (create via `npx wrangler pages project create emtesseract` if needed).

**Custom domain:** Configure in Cloudflare Dashboard → Pages project → Custom domains.

**Note:** `wrangler versions upload` is for Workers, not Pages. For static Pages use `wrangler pages deploy`.

## Preview

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```
