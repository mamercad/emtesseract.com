# Deployment

This site deploys to **Cloudflare Workers** (static assets) as **emtesseract-com**.

## One-time setup

### 1. Create the Worker (if needed)

The first `wrangler deploy` creates the Worker. No separate project create step.

### 2. Add custom domain

In Cloudflare Dashboard → **Workers & Pages** → **emtesseract-com** → **Settings** → **Domains & routes**:

- Add custom domain `emtesseract.com`

**Note:** Custom domains require the zone's nameservers to be on Cloudflare.

### 3. Migrating from Pages

If you had a Pages project:

- Disable or delete it in the Cloudflare dashboard
- This is a separate Workers project; custom domain must be configured on the Worker

## Deploy

```bash
npx wrangler deploy
```

Or:

```bash
npm run deploy
```

Requires `wrangler login` first if not authenticated.

## Preview (local)

```bash
npx wrangler dev
```

Default: <http://localhost:8787> (Workers uses 8787; Pages used 8788)

## Config reference

| File | Purpose |
|------|---------|
| `wrangler.toml` | Worker name, assets dir, 404 handling |
| `.assetsignore` | Excluded from upload (node_modules, config files, etc.) |
