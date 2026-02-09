# Bluesky Domain Worker

Posts to and reads from Bluesky via the AT Protocol. Replaces X/Twitter for emTesseract social presence.

## Setup

1. **Create Bluesky account** — [bsky.app](https://bsky.app)

2. **Create app password** — Settings → App passwords → Create new
   - Name it (e.g. `emtesseract-ops`)
   - Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

3. **Add to `.env`**:
   ```
   BLUESKY_HANDLE=yourhandle.bsky.social
   BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   ```

4. **Deploy** — `make deploy` includes the Bluesky worker. If creds are missing, worker logs a warning and skips (no crash).

## Step kinds

### post_bluesky (write)

- **Payload**: `{ text: "post content" }` — max 300 chars (Bluesky limit)
- **Gate**: `bluesky_daily_quota` policy (default: 5/day)
- **Auto-approve**: Included in `auto_approve.allowed_step_kinds`

### scan_bluesky (read)

- **Payload**: `{ mode: "feed" | "mentions" | "both" }` — what to fetch
  - `feed` — our author feed (our posts + engagement)
  - `mentions` — posts that mention or reply to us
  - `both` — feed + mentions
- **Gate**: `scan_bluesky_policy` (default: 10 scans/day)
- **Result**: Stores markdown in `ops_artifacts`; step result includes `artifact_id`

## Usage

- **Give task** — Select "Post to Bluesky" or "Scan Bluesky (read)", enter payload, submit
- **Triggers** — "Proactive Bluesky post" and "Proactive Bluesky scan" (disabled by default)
- **Programmatic** — Create proposals with `post_bluesky` or `scan_bluesky` steps

## Policies

- `bluesky_daily_quota`: `{ "limit": 5 }` — posts per day
- `scan_bluesky_policy`: `{ "enabled": true, "max_scans_per_day": 10 }` — read scans per day

## Testing

- **Unit**: `tests/unit/bluesky-format.test.mjs` — feed/notification formatting (no API)
- **Integration**: `tests/integration/proposal-service.test.mjs` — post_bluesky/scan_bluesky gates (requires DATABASE_URL + migrations)
