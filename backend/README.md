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

## Connect a Facebook Page (OAuth, Dev Mode)

The OAuth Page-connect flow lets you connect your Facebook Page by logging in via Facebook — no manual token copying required.

> **Note:** This flow works **right now in Facebook App Development Mode** because you are the app admin. Meta App Review for Advanced Access (`pages_manage_posts`) is a **Phase 5 deliverable** — it is not required for the Dev-Mode connect flow.

### Prerequisites

1. Go to [https://developers.facebook.com/apps](https://developers.facebook.com/apps) and create a Facebook App (or reuse an existing one). **Keep it in Development Mode** — do NOT submit for App Review.
2. Add the **Facebook Login** product to your app.
3. Under **Facebook Login → Settings → Valid OAuth Redirect URIs**, register:
   ```
   http://localhost:3000/api/settings/fb-oauth/callback
   ```
4. Copy these values into `backend/.env` (this file is gitignored — **never commit it**):
   ```
   FB_APP_ID=<your App ID from App Settings → Basic>
   FB_APP_SECRET=<your App Secret — NEVER commit, log, or share this>
   FB_OAUTH_REDIRECT_URI=http://localhost:3000/api/settings/fb-oauth/callback
   ```

See `backend/.env.example` for a documented template.

### Connecting via OAuth

1. Start the backend: `bun run dev`
2. Open in your browser: `http://127.0.0.1:3000/api/settings/fb-oauth/authorize`
3. Facebook login page appears → log in and approve the permissions.
4. Facebook redirects back to the callback URL → the backend validates the CSRF state, exchanges the code for a user token, resolves the Page access token, encrypts it (AES-256-GCM), and stores it.
5. Verify the connection:
   ```bash
   curl http://127.0.0.1:3000/api/settings
   # Returns: {"fbConnected":true,"pageName":"Your Page Name",...}
   ```

### Notes

- **Security:** `FB_APP_SECRET` is used server-side only and is **never logged, returned, or committed**. The Page access token is encrypted at rest and never returned by any endpoint in plaintext.
- **CSRF protection:** A one-time CSRF `state` is generated at `/authorize` and validated at `/callback`. The state store is in-process and is wiped on server restart. If `/callback` returns a `state_mismatch` error (e.g., after restarting the server mid-flow), simply re-open `/authorize` to start a fresh flow.
- **Manual fallback:** The manual token-paste endpoint `POST /api/settings/fb-connect` remains available as a fallback (see above).
- **App Review:** The `pages_manage_posts` permission (required for publishing) is a **Phase 5 deliverable**. The current scopes (`pages_show_list`, `pages_read_engagement`, `business_management`) work without App Review in Development Mode.

---

## API Endpoints (Phase 1)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check + DB connectivity |
| `POST` | `/api/settings/fb-connect` | Connect Facebook Page via manual token paste (verify + encrypt + store) |
| `GET` | `/api/settings` | Get settings + FB connection status |
| `GET` | `/api/settings/fb-oauth/authorize` | Start OAuth Page-connect flow (Dev Mode) |
| `GET` | `/api/settings/fb-oauth/callback` | OAuth callback: validate CSRF state, exchange code, encrypt + store Page token |

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
| `FB_APP_ID` | — (optional) | Facebook App ID (required for OAuth flow only) |
| `FB_APP_SECRET` | — (optional) | Facebook App Secret — **never commit, log, or share** (OAuth flow only) |
| `FB_OAUTH_REDIRECT_URI` | — (optional) | Callback URL registered Facebook-side (OAuth flow only) |

See `.env.example` for a template.
