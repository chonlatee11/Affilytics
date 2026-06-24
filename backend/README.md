# Affilytics Backend

Local Elysia + Bun backend for the Affilytics affiliate analytics tool.

Binds to `127.0.0.1:3000` — only accessible from the local machine (not exposed to LAN).

## Quick Start

### 1. Install dependencies

```bash
cd backend
bun install
```

### 2. Generate encryption key (first time only)

```bash
bun run setup
```

This creates a `.env` file with a randomly generated `BUN_ENCRYPTION_KEY`.
The key encrypts your Facebook Page access token at rest.
**Never commit `.env` to version control — it is gitignored.**

### 3. Start the backend

```bash
bun run dev
```

### 4. Verify the server is running

```bash
curl http://127.0.0.1:3000/health
# Expected: {"status":"ok","db":"connected"}
```

---

## Connect your Facebook Page

Paste your Facebook Page access token from the [Graph API Explorer](https://developers.facebook.com/tools/explorer/):

```bash
curl -X POST http://127.0.0.1:3000/api/settings/fb-connect \
  -H 'Content-Type: application/json' \
  -d '{"pageId":"YOUR_PAGE_ID","accessToken":"YOUR_PAGE_TOKEN"}'
# Expected: {"ok":true,"pageName":"Your Page Name","dataAccessExpiresAt":null}
```

Then verify connection:

```bash
curl http://127.0.0.1:3000/api/settings
# Returns: {"fbConnected":true,"pageName":"Your Page Name",...}
```

---

## API Endpoints (Phase 1)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check + DB connectivity |
| `POST` | `/api/settings/fb-connect` | Connect Facebook Page (verify + encrypt + store) |
| `GET` | `/api/settings` | Get settings + FB connection status |

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `setup` | `bun run setup` | Generate encryption key into `.env` (run once) |
| `dev` | `bun run dev` | Start with hot-reload |
| `test` | `bun test` | Run all tests |
| `migrate:generate` | `bun run migrate:generate` | Generate new SQL migration from schema changes |
| `migrate:run` | `bun run migrate:run` | Apply pending migrations |

---

## Security Notes

- **`BUN_ENCRYPTION_KEY`** — AES-256-GCM key for encrypting FB tokens; stored in `.env` (gitignored)
- **`DATABASE_URL`** — SQLite file path (default: `data/affilytics.db`, also gitignored)
- The backend binds to `127.0.0.1` only — not accessible from other devices on the network
- Facebook access tokens are encrypted at rest; never returned by the API in plaintext

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BUN_ENCRYPTION_KEY` | — (required) | 64-char hex key for AES-256-GCM; generate with `bun run setup` |
| `DATABASE_URL` | `data/affilytics.db` | SQLite database file path |

See `.env.example` for a template.
