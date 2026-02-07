# AGENTS.md

Guidance for AI agents working on the emTesseract site.

## Project Overview

Static marketing/landing page for **emTesseract** — AI OCR & data extraction product. Single HTML file + CSS, no build step. Deployed via Cloudflare Pages (CNAME: emtesseract.com).

## Structure

```
emtesseract.com/
├── index.html          # Main page
├── style.css           # All styles
├── assets/
│   ├── css/variables.css
│   ├── svg/            # Icons, patterns, UI elements
│   ├── png/            # Backgrounds, textures, social
│   └── json/palette.json
└── CNAME               # GitHub Pages custom domain
```

## Conventions

- **CSS**: Variables in `:root`; BEM-like class names; mobile-first
- **Fonts**: Chakra Petch (headings), Public Sans (body)
- **Theme**: Dark navy/blue palette; CSS vars in `style.css`
- **Assets**: SVG preferred; PNG for photos/textures

## Preview

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```
