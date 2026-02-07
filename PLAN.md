# Marketing site landing page

## Requirements

- Use skills in <repo-root>/.cursor/skills/
- Build marketing site landing page for emtesseract.com based on style of logo.png
- Feel: cartoony and minimal and clear and clean
- Light and dark mode
- Vibes: relaxed and fun, retro gaming, playful
- Read existing emtesseract.com live web site for *content*
- Base landing page content on existing site *content*
- Hosted at emtesseract.com
- Hosted by Cloudflare Pages

## Implementation (current)

**Design:** Retro arcade / playful — bold borders, offset shadows, colored accents. Avoids generic “bleh” minimalism.

**Typography:** Syne (headings), DM Sans (body)

**Structure:**

- `index.html` — semantic HTML, theme toggle, content from live site (game dev company)
- `style.css` — main styles, light/dark via `[data-theme]`
- `assets/css/variables.css` — design tokens for both themes
- `logo.png` — site logo
- `404.html` — custom 404 with theme support

**Theme:** Toggle in header; respects `prefers-color-scheme` and persists in `localStorage` (key: `emtesseract-theme`).

**Content:** Hero, About (3 pillars), Featured Games (6 cards), Get in Touch, footer.

## Deployment

- **Platform:** Cloudflare Pages
- **Build command:** (empty) or `exit 0`
- **Build output directory:** `/`
- **Custom domain:** emtesseract.com (set in Cloudflare Dashboard)
- **No CNAME file** — domain configured in Cloudflare, not GitHub Pages

**Wrangler CLI:** `npm run deploy` or `npx wrangler pages deploy .` (not `wrangler versions upload`, which is for Workers)
