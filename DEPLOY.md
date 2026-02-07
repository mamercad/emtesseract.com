# Deployment

This site deploys to Cloudflare Pages as **emtesseract-com**.

## One-time setup

### 1. Create the Pages project

```bash
npx wrangler pages project create emtesseract-com
```

When prompted, set **Production branch** to `main`.

### 2. Add custom domain (optional)

In Cloudflare Dashboard → **Workers & Pages** → **emtesseract-com** → **Custom domains**:

- Add `emtesseract.com`

## Deploy methods

### Automatic (Cloudflare Git integration)

Push to `main` → Cloudflare deploys automatically. Build command: `exit 0` (or blank). Build output directory: `/`.

### Manual (Wrangler)

```bash
npm run deploy
```

or:

```bash
npx wrangler pages deploy . --project-name=emtesseract-com
```

Requires `wrangler login` first if not authenticated.

## Config reference

| File | Purpose |
|------|---------|
| `wrangler.toml` | Project name, output dir, compatibility date |
| `package.json` | `npm run deploy` script |
