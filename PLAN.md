# emTesseract marketing site

## Requirements

- Use skills in <repo-root>/.cursor/skills/
- Build marketing site landing page for emtesseract.com based on style of logo.png
- Feel: cinematic, expressive, minimal, and clear
- Designless warm-monochrome system with a single molten-orange accent (`#FF4719`)
- Explicit System / Light / Dark modes with faithful light and dark variants
- Vibes: independent studio, creative tools, restrained character
- Read existing emtesseract.com live web site for *content*
- Base landing page content on existing site *content*
- Hosted at emtesseract.com
- Hosted by Cloudflare Workers

## Implementation (current)

**Design:** Editorial studio index using Designless principles: warm monochrome first, one accent for active/focus states, structure over decoration, oversized typography, precise metadata, diagrammatic product art, and a curated Neon Mary gallery. Avoids generic SaaS cards and a center-stacked hero.

**Typography:** Space Grotesk (display/body), DM Mono (metadata)

**Color modes:** `System` follows `prefers-color-scheme`; `Light` and `Dark` are explicit overrides and persist in `localStorage` under `emtesseract-theme`.

**Structure:**

- `index.html` — semantic studio landing page with Designless Cloud, Neon Mary, games, and contact
- `style.css` — responsive editorial layout and interaction states
- `assets/css/variables.css` — dark-first design tokens
- `assets/images/neon-mary-blade-runner.png` — curated Neon Mary showcase
- `logo.png` — site logo
- `404.html` — custom 404 with theme support

**Product focus:** Designless Cloud is the only current product presented. Existing games remain a small archive of experiments rather than competing products.

**Content:** Studio hero, Designless Cloud product focus, Neon Mary feature, compact game archive, open contact channel, footer.

## Deployment

- **Platform:** Cloudflare Workers (static assets)
- **Custom domain:** emtesseract.com (set in Cloudflare Dashboard)
- **No CNAME file** — domain configured in Cloudflare

**Wrangler CLI:** `npm run deploy` or `npx wrangler deploy`
