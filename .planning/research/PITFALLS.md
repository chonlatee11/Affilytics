# Pitfalls Research

**Domain:** Self-hosted browser-extension + local backend affiliate product analytics tool
**Researched:** 2026-06-23
**Confidence:** HIGH (MV3, FB Graph API, Ollama, SQLite sections verified against official docs and multiple sources; scoring model pitfalls MEDIUM from community/practitioner sources)

---

## Critical Pitfalls

### Pitfall 1: Content Script Fetch to Localhost Blocked by Mixed-Content Rules

**What goes wrong:**
The content script runs injected inside an HTTPS page (e.g., `https://shopee.co.th/...`). A direct `fetch("http://localhost:3000/api/products/capture")` from within that HTTPS context is a mixed-content request. Chrome treats it as an insecure resource loaded from a secure page and blocks the request silently with a console error. The extension appears to work (the button responds), but nothing ever reaches the backend.

**Why it happens:**
MV3 content scripts are now subject to the CORS and mixed-content rules of the host page they run inside, not the extension origin. This was a deliberate Chromium security tightening in MV3. Developers who worked with MV2 (where content scripts could bypass CORS) are caught off-guard.

**How to avoid:**
Never issue the `fetch` from the content script directly. The content script should collect data from the DOM and call `chrome.runtime.sendMessage(data)` to pass it to the background service worker. The service worker is an extension context — it is not subject to the host page's mixed-content rules — and issues the `fetch("http://localhost:3000/...")` from there. Also declare `"host_permissions": ["http://localhost/*", "http://127.0.0.1/*"]` in `manifest.json` or the fetch will silently fail even from the service worker.

**Warning signs:**
- Extension button click shows no network activity in DevTools Network tab on the product page
- Console error on the product page: `Mixed Content: The page at https://... requested an insecure XMLHttpRequest endpoint http://localhost/...`
- Backend never receives requests despite extension appearing functional

**Phase to address:** Phase 2 — Browser Extension (foundational architecture decision; wrong choice here breaks the entire data pipeline)

---

### Pitfall 2: MV3 Service Worker Shuts Down and Loses State After ~5 Minutes

**What goes wrong:**
The background service worker terminates when idle. Any global variables (e.g., cached settings, pending retry queues, in-memory state) are wiped on shutdown. If the service worker is processing a message when Chrome decides to shut it down, the operation is silently abandoned. Event listeners registered inside async callbacks (promises, `setTimeout`) may not be registered when the worker next wakes, causing missed events.

**Why it happens:**
MV3 replaced persistent background pages with service workers to reduce memory pressure. The 5-minute idle termination is a Chrome-enforced constraint, not configurable by the extension.

**How to avoid:**
- Store all persistent state in `chrome.storage.local` (not global variables)
- Register all `chrome.runtime.onMessage` listeners at the top level of the service worker script (not inside async callbacks or `then()` handlers)
- Replace `setTimeout`/`setInterval` with `chrome.alarms` API for any timed operations
- Never use `return true` in `onMessage` for synchronous responses; always `return true` if `sendResponse` will be called asynchronously (otherwise the message port closes before response arrives)

**Warning signs:**
- Extension works the first time after load, then stops responding after ~5 minutes of inactivity
- `chrome.storage.local` data is present but the service worker "forgets" in-memory config on second use
- Event handlers not firing on the second request after idle period

**Phase to address:** Phase 2 — Browser Extension (core architecture; must be right from day one)

---

### Pitfall 3: DOM Selectors Break Silently on Shopee/Lazada/TikTok SPA Navigation

**What goes wrong:**
Content scripts that use `DOMContentLoaded` or `window.onload` fire before the SPA (React) framework renders the actual product data. The script reads empty or wrong values from DOM nodes that exist in the HTML shell but haven't been populated yet by async API calls. Worse, within-SPA navigation (clicking between products without a full page reload) does not trigger `DOMContentLoaded` again, so the parser never re-runs on subsequent products.

Additionally, Shopee updates its CSS selectors and page structure regularly (several times per year). Hard-coded selectors become stale without any error — they simply silently return `null` or empty strings.

**Why it happens:**
All three platforms (Shopee, Lazada, TikTok Shop) are React-based SPAs. Product data is fetched asynchronously after the shell HTML loads. DOM event timing that worked for static pages fails for SPAs.

**How to avoid:**
- Use `MutationObserver` to wait for specific product-data elements to appear before reading them. Pair with a timeout (e.g., 10 seconds) to disconnect the observer and report partial results rather than hanging.
- For SPA navigation, listen for `pushState`/`replaceState` overrides or `popstate` events to detect route changes and re-trigger parsing.
- Keep all CSS selectors in `extension/parsers/selectors.config.json` — never hard-code them in parser logic. The config can be updated without rebuilding and redeploying the extension.
- When a selector returns `null`, set the field to `null`/empty (not crash). All fields are nullable; the user fills gaps manually.
- Add a visible "fields found / fields missing" count in the extension popup so the operator knows immediately if parsing was partial.

**Warning signs:**
- Extension captures price as `null` or `0` on a live Shopee product page
- Captured product names are truncated or show stale data from the previous product
- Chrome DevTools shows the selector is queried before the element appears in the DOM

**Phase to address:** Phase 2 — Browser Extension (Shopee parser); Phase 7 — Lazada/TikTok parser expansion

---

### Pitfall 4: Facebook App Review Gate Blocks Public Publishing

**What goes wrong:**
When the Meta app is in Development Mode, posts made via the Graph API are only visible to app admins and test users — they are invisible to the public even on your own Page. Developers test successfully (they are the app admin so they see the posts), ship to "production", and discover that real posts are invisible to followers until the app goes Live. Going Live requires App Review for `pages_manage_posts`, which takes 5–15 business days and can be rejected.

**Why it happens:**
Meta's two-tier access model (Standard Access vs. Advanced Access) requires App Review for permissions that write data, even for self-use on your own Page in Live Mode. The distinction between Development Mode (immediate but private) and Live Mode (requires review) is poorly surfaced in the developer dashboard.

**How to avoid:**
- Submit the Meta app for review with the `pages_manage_posts` permission request before planning any public publishing milestone. Start this process at least 2–3 weeks before the intended launch of Phase 5 (Facebook Publishing).
- In the review submission, include a screencast showing the exact user flow: operator captures product → approves draft → triggers publish → post appears on the Page. Missing any step is a common rejection reason.
- During development, the app admin (operator) can test the full flow in Development Mode by verifying posts appear on the Page when logged in as the Page admin — just note they are not public yet.
- Never call `pages_manage_posts` with a short-lived user token. Exchange it for a long-lived user token, then derive the non-expiring Page access token from that.

**Warning signs:**
- Posts succeed (Graph API returns an `fbPostId`) but are invisible to followers
- The app is still in Development Mode when you intend to reach real audience
- App review was started at the same time as development (too late)

**Phase to address:** Phase 5 — Facebook Publishing; submit for App Review at the end of Phase 4 so approval arrives before Phase 5 ships

---

### Pitfall 5: Confusing Page Access Token Expiry with Data Access Expiry

**What goes wrong:**
A Page Access Token generated from a long-lived User token does not have a time-based expiry ("Expires: Never" in the Token Debugger). However, Data Access expires after approximately 90 days. When Data Access lapses, the token appears valid in the debugger but all Graph API calls return a `190` or `102` error code. The operator then misdiagnoses this as a token bug and regenerates the wrong thing (the token itself, which doesn't need regeneration).

**Why it happens:**
Meta's token system has two separate concepts — token validity (the credential) and data access permission (whether the token is authorized to touch certain data). The Token Debugger shows token expiry prominently but buries data access expiry.

**How to avoid:**
- Generate the non-expiring Page Access Token correctly: short-lived user token → long-lived user token (60-day) → Page access token (derived, no time expiry). Document this flow in the settings onboarding.
- Store the `data_access_expiration_time` field from the Graph API response (not just the token). Use it to proactively alert the operator at 80 days: "Re-authorize to maintain Facebook posting — data access expires in 10 days."
- Build a health-check endpoint (`GET /api/settings/fb-status`) that calls `GET /me?access_token=...` and returns current token validity + data access expiry.
- Never expose the raw token in any API response or log. Encrypt at rest (see Security Mistakes section).

**Warning signs:**
- Facebook posts suddenly fail with `OAuthException` error code `190` after working for months
- Token Debugger shows "Expires: Never" but posting fails
- It has been ~90 days since the operator last re-authorized

**Phase to address:** Phase 5 — Facebook Publishing (token setup and health-check); Phase 1 — Backend Foundation (design encrypted storage schema upfront)

---

### Pitfall 6: Scoring Model Returns Meaningless Results Until Commission Is Entered

**What goes wrong:**
Commission % is the highest-weight input in the scoring formula, but it must be manually entered by the operator after capture. Products freshly captured from the extension score near 0 because `commissionPct` defaults to 0. The operator sees a table full of zero-score items, assumes the scoring is broken, and loses confidence in the tool before they understand the workflow.

Additionally, score normalization relies on `maxSalesCount` across all products in the DB. If the DB contains only 2–3 captured products, sales normalization is distorted (one product with 100 sales scores 1.0, another with 90 sales scores 0.9 — but both would score much lower once the DB has products with 100,000 sales).

**Why it happens:**
The scoring formula was designed for a mature dataset. Early in usage (fewer than ~20 products), the normalization denominators are volatile and the required manual inputs are absent.

**How to avoid:**
- Show a distinct "incomplete" state (grey score pill, or "N/A — enter commission") for products where commission % = 0 or unset, so the operator understands these are not scored yet.
- Cap or percentile-rank sales normalization rather than using raw max. An alternative: use platform-sourced category average as a soft cap (e.g., "1000 sales = median; 10,000+ = top decile").
- Add a "score breakdown" popover on the dashboard so operators can see which inputs drove the score — building trust in the formula.
- In Phase 3 (Dashboard), include a first-run guide: "Enter commission % to activate scoring."

**Warning signs:**
- All products in the table show 0 or near-0 score on first use
- Adding a product with abnormally high sales causes all other products' scores to drop suddenly
- Operator feedback: "the scores don't make sense"

**Phase to address:** Phase 3 — Frontend Dashboard (UX for incomplete scores); Phase 2 — Backend scoring design (normalization strategy)

---

### Pitfall 7: Ollama Cold-Start Blocks the First Caption Request

**What goes wrong:**
Ollama unloads models from memory after 5 minutes of inactivity by default. The first caption draft request after an idle period triggers a model reload that takes 15–60 seconds on CPU. The HTTP request from the backend times out (default Node/fetch timeout is often 30s). The fallback to template is not triggered because the timeout was not set correctly — it just hangs or throws an uncaught error.

Additionally, if `OLLAMA_REQUEST_TIMEOUT` is not set, the default is 30 seconds — too short for CPU inference on a 7B model (which can take 45–90 seconds).

**Why it happens:**
Ollama's default configuration is tuned for interactive chat use, not server-side batch drafting from an application with arbitrary call timing.

**How to avoid:**
- Set `OLLAMA_KEEP_ALIVE=24h` in the Ollama environment so the model stays loaded all day on a single-operator machine.
- In `ollamaService.ts`, set an explicit fetch timeout of 120 seconds for the `/api/generate` or `/api/chat` call.
- Wrap the Ollama call in a try/catch with an `AbortController` timer. On timeout or any error, log the reason and fall through to the template generator. Never let Ollama failure surface as an unhandled error to the frontend.
- Use the quantized Q4 variant of Qwen 2.5 (`qwen2.5:7b-instruct-q4_K_M` or smaller) to keep CPU inference under 45 seconds per caption.
- Drafting is a background task — the frontend should show a "drafting..." spinner rather than waiting synchronously.

**Warning signs:**
- First draft request after a gap takes forever; subsequent ones are fast
- Backend logs show Ollama call hanging with no response within 30s
- `draftService.ts` sometimes returns null or undefined draft without logging why

**Phase to address:** Phase 4 — Caption Drafting (service design); implement fallback before enabling Ollama

---

### Pitfall 8: SQLite Write Contention Between API Requests and In-Process Cron

**What goes wrong:**
The in-process cron scheduler (for scheduled Facebook posts) holds a write transaction while posting and updating `PublishedPost` records. Simultaneously, the frontend operator saves commission changes (`PUT /api/products/:id/extra`), also requiring a write. SQLite serializes writes; the second writer receives `SQLITE_BUSY` and the error is not caught, causing an unhandled promise rejection that crashes Elysia's request handler and returns a 500 to the user with no retry.

**Why it happens:**
`bun:sqlite` is synchronous and uses SQLite's default locking. Without WAL mode, a write blocks all other connections entirely. Even with WAL mode, concurrent writes still contend — WAL allows readers to proceed but writers still queue. Without a `busy_timeout`, the second writer fails immediately instead of retrying.

**How to avoid:**
- Enable WAL mode immediately after opening the DB: `db.run("PRAGMA journal_mode = WAL")`.
- Set a busy timeout: `db.run("PRAGMA busy_timeout = 5000")` (5 seconds; long enough to absorb bursts without hanging indefinitely).
- Begin all write transactions in immediate mode to acquire the write lock upfront and avoid mid-transaction upgrade conflicts.
- After the cron job completes its batch of writes, run `db.run("PRAGMA wal_checkpoint(TRUNCATE)")` to prevent WAL file unbounded growth.
- Keep cron write transactions short: fetch scheduled posts, attempt FB publish, write result — one transaction per post, not one for the entire batch.

**Warning signs:**
- `Error: SQLITE_BUSY: database is locked` in backend logs
- Dashboard edits occasionally return HTTP 500 with no obvious cause
- WAL file (`.db-wal`) growing to hundreds of MB over time

**Phase to address:** Phase 1 — Backend Foundation (DB setup); Phase 5 — Facebook Publishing (cron integration)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code CSS selectors in parser logic | Faster to implement | Every DOM update requires rebuilding and reloading extension; impossible to hotfix without redeploy | Never — selectors belong in `selectors.config.json` from day one |
| Fetch from content script directly (not via service worker) | One fewer message-passing hop | Broken on all HTTPS product pages; silent failure; must refactor entire data pipeline | Never in MV3 |
| Skip WAL mode and busy_timeout | Simpler DB setup | `SQLITE_BUSY` crashes appear unpredictably under cron + API concurrent writes | Never — add both in Phase 1 schema setup |
| Store FB token as plaintext in SQLite | Simpler code | Token exposed in DB file if machine is accessed; violates NFR-4 | Never — encrypt at rest from Phase 1 |
| Use short-lived User token for FB posting | Simpler OAuth flow | Posts stop working after 1–2 hours; constant re-auth interrupts the operator | Never — derive non-expiring Page token during setup |
| Set Ollama as required dependency (no template fallback) | Simpler service code | Caption drafting unusable if Ollama is down or slow; blocks operator workflow | Never — template fallback must be implemented before Ollama integration |
| Normalize scores against global max (volatile early) | Simple formula implementation | Scores are meaningless and unstable with fewer than ~20 products; early adopter frustration | Acceptable for Phase 2 internal dev, but must be addressed before Phase 3 dashboard launch |
| Skip App Review while developing FB integration | Faster iteration | Posts are invisible to followers; operator discovers this after "shipping" | Acceptable during Phase 5 dev, but review must be submitted before claiming Phase 5 complete |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Facebook Graph API | Using `publish_pages` permission (deprecated). Old tutorials are pervasive on the web | Use `pages_manage_posts` (current, required permission for posting) |
| Facebook Graph API | Storing a short-lived User access token directly as the posting credential | Exchange: short-lived user token → long-lived user token → non-expiring Page access token |
| Facebook Graph API | Ignoring `X-App-Usage` and `X-Page-Usage` response headers | Read these headers in `publishService.ts` and back off (exponential) if usage > 80% |
| Facebook Graph API | Assuming 25 posts/day is the only rate limit | Calls-per-hour (200/user/hour, ~600/app/minute) also applies; a retry storm can exhaust hourly quota |
| Ollama API | Calling `POST /api/generate` without a timeout | Use `AbortController` with 120s timeout; fall back to template on abort |
| Ollama API | Not checking if `ollama serve` is running before making requests | Add a health-check `GET http://localhost:11434/` at startup; log and flag if Ollama is unavailable |
| MV3 Extension | `chrome.runtime.sendMessage` from content script with async `sendResponse` without `return true` | Always `return true` from `onMessage` if the response will be sent asynchronously |
| MV3 Extension | Using `setInterval` in service worker for a periodic heartbeat | Use `chrome.alarms.create()` instead; `setInterval` is cancelled when the worker sleeps |
| bun:sqlite | Opening DB connection without WAL mode pragma | Always run `db.run("PRAGMA journal_mode=WAL")` and `db.run("PRAGMA busy_timeout=5000")` on connection open |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Ollama model cold-start on every caption request | First draft request after idle takes 30–60s; API timeout; fallback not triggered | `OLLAMA_KEEP_ALIVE=24h`; model stays loaded all day | After any 5-minute idle period |
| Scoring recalculation on every GET /products request | Dashboard load time grows linearly with number of products | Cache computed score in `ProductExtra.score` column; only recalculate when inputs change (commission update, weight setting change) | With 100+ products and frequent dashboard refreshes |
| `MutationObserver` never disconnected on SPA navigation | Memory leak in content script; CPU usage rises over time in long browser sessions | Always call `observer.disconnect()` when the target element is found, or on a timeout | After 30+ minutes of browsing without page reload |
| WAL file grows unbounded | Disk space consumed; read performance degrades | Run `PRAGMA wal_checkpoint(TRUNCATE)` after cron batch writes | After ~100 posts/days of operation without checkpoint |
| Synchronous bun:sqlite blocking Elysia event loop | API response times spike during DB-heavy cron writes | Keep write transactions short; use `BEGIN IMMEDIATE`; WAL mode enables reader concurrency | During scheduled-post cron batches if transactions are long |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing FB access token as plaintext in SQLite | Token readable by anyone with filesystem access to the DB file | Column-level encryption using `node:crypto` AES-256-GCM; key loaded from env var `FB_TOKEN_KEY`, never hardcoded |
| Deriving encryption key from a hardcoded string in source code | Key is committed to git; all deployed instances share the same key | Load from `process.env.FB_TOKEN_KEY`; generate a random 32-byte key on first run and persist to a local `.env` not tracked by git |
| Logging the raw FB access token in Elysia request/response logs | Token in log files → potential credential exposure | Redact the `accessToken` field in all log statements before output; never serialize the PageSettings object directly |
| Extension communicating with any origin beyond localhost | Malicious page could relay data to an attacker-controlled server | Restrict `host_permissions` to `http://localhost/*` and `http://127.0.0.1/*` only; add `content_security_policy` in manifest |
| Storing app secret client-side or in extension bundle | Extension code is readable; app secret extracted → used to generate fake tokens | App secret lives only in backend `.env`; the token-exchange endpoint is server-side only |
| SQLite DB file world-readable | Any local process can read product data, affiliate links, draft content | Set `chmod 600` on the `.db`, `.db-wal`, and `.db-shm` files; create them under a `data/` directory with restricted permissions |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual distinction between "scored" and "awaiting commission" products | Operator thinks the scoring system is broken; fills in commission and is confused why score doesn't change | Show a grey badge "Enter commission to score" vs. a coloured score badge; trigger re-score immediately on commission save |
| Ollama failure surfaces as a generic error or silent empty draft | Operator doesn't know why draft is blank; tries clicking again; wastes time | Show "Generated via template (Ollama unavailable)" inline in the draft editor; never show an empty draft without explanation |
| Extension popup shows "Captured!" but fields are missing | Operator trusts the data is complete and doesn't check before scoring | Show a "fields captured" summary: "6/8 fields captured — price and discount missing; fill in manually." |
| Draft approval queue has no indication of scheduling conflicts | Multiple drafts approved for the same slot; rate guard fires and blocks them silently | Show "daily limit: 3/3 posts scheduled" counter in the approval queue; grey out the schedule button when limit is reached |
| Facebook post failure is swallowed silently | Operator thinks the post went live; checks Facebook the next day and finds nothing | Surface failed post status prominently in the dashboard ("1 post failed to publish — retry or check FB status"); push to operator notification area |

---

## "Looks Done But Isn't" Checklist

- [ ] **Extension data capture:** Often missing the service-worker message-passing layer — verify by opening DevTools on the HTTPS product page and confirming no mixed-content errors appear and the network tab on the backend side shows the POST request arriving
- [ ] **Localhost fetch from extension:** Often missing `host_permissions` declaration — verify `manifest.json` includes `"http://localhost/*"` and `"http://127.0.0.1/*"` in `host_permissions`, not just `permissions`
- [ ] **Facebook publishing:** Often "works in development" but posts are invisible — verify the Meta app is in Live Mode (not Development Mode) and `pages_manage_posts` has Advanced Access granted before claiming Phase 5 complete
- [ ] **FB token pipeline:** Often only short-lived token is stored — verify the stored token is a Page access token (derived from a long-lived user token) by checking its type in Meta's Token Debugger; also verify `data_access_expiration_time` is stored alongside it
- [ ] **Ollama fallback:** Often wired up but never tested — verify by stopping `ollama serve` and triggering caption generation; confirm the response contains a template-generated draft with a "template fallback" label, not an error
- [ ] **SQLite WAL + busy_timeout:** Often configured in application setup but the pragma string is wrong — verify with `db.prepare("PRAGMA journal_mode").get()` returning `"wal"` in integration tests
- [ ] **#ad disclosure:** Often appended to the template but stripped when operator edits the draft — verify the edit UI re-validates disclosure presence on save and warns if `#ad` or equivalent is absent
- [ ] **Score normalization:** Often volatile with a small dataset — verify by adding a product with 10x the sales of all others and checking that existing product scores don't collapse to near-zero

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Mixed-content fetch (wrong architecture built) | HIGH | Refactor content script to use message passing to service worker; all DOM parsing stays in content script, all network calls move to service worker; test full roundtrip |
| FB App Review rejection | MEDIUM | Read rejection reason carefully; address specific missing screencast step or permission justification; resubmit; allow another 5–15 business day window |
| FB Page token invalidated (data access expiry) | LOW | Operator re-runs the OAuth connect flow in Settings; a new long-lived user token is exchanged for a new Page token; previous posts are unaffected |
| Ollama inference timeout without fallback | MEDIUM | Add `AbortController` timeout + fallback code path; test manually; deploy as a hotfix |
| SQLite BUSY errors under load | MEDIUM | Add `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000`; requires DB migration or DB recreation if existing DB is in default journal mode |
| Selector breaks after platform DOM update | LOW | Update `selectors.config.json` with new CSS paths found via DevTools on the product page; reload extension; no rebuild required |
| Scoring model produces meaningless results early | LOW | Add "incomplete" state for unscored products in the frontend; add normalization cap; no data loss |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Content script fetch blocked by mixed content | Phase 2 — Browser Extension | POST captured data while on HTTPS product page; no mixed-content errors in DevTools console |
| MV3 service worker loses state after idle | Phase 2 — Browser Extension | Kill and restart the service worker from `chrome://extensions`; extension still works on next button click |
| SPA DOM timing race condition (Shopee) | Phase 2 — Browser Extension | Capture product data on 10 different Shopee products; verify all selector hits/misses are logged accurately |
| SPA selector staleness (Lazada/TikTok) | Phase 7 — Parser Expansion | Parser integration tests against recorded HTML snapshots; `selectors.config.json` in version control |
| Facebook App Review gate | Phase 5 — FB Publishing (prep at Phase 4 end) | Meta app dashboard shows Live Mode + Advanced Access granted for `pages_manage_posts` before Phase 5 ships publicly |
| Page Access Token vs. Data Access expiry confusion | Phase 5 — FB Publishing | Health-check endpoint returns token status + data access expiry date; alert fires at 80 days |
| Scoring meaningless until commission entered | Phase 3 — Frontend Dashboard | Dashboard shows "N/A — enter commission" badge; score updates immediately on commission save |
| Ollama cold-start timeout / silent failure | Phase 4 — Caption Drafting | Stop `ollama serve`; trigger draft; confirm template fallback appears with label within 5 seconds |
| SQLite BUSY under cron + API concurrency | Phase 1 — Backend Foundation | WAL and busy_timeout set in DB init; integration test: simultaneous write from cron simulator and API produces no errors |
| Encryption key management | Phase 1 — Backend Foundation | `FB_TOKEN_KEY` loaded from env; `process.env` check throws at startup if missing; raw token never appears in logs |
| #ad disclosure stripped on edit | Phase 4 — Caption Drafting | Unit test: save a draft with `#ad` removed; verify validation error returned; check final published caption always contains disclosure |

---

## Sources

- [Chromium Extensions: Changes to Cross-Origin Requests in Content Scripts (MV3)](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/)
- [Chrome for Developers: Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome for Developers: Migrate to Service Workers (MV3)](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- [Chromium Issue: ServiceWorker shuts down every 5 minutes](https://issues.chromium.org/issues/40733525)
- [Meta for Developers: Access Token Guide](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/)
- [Meta for Developers: Generate Long-Lived Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/)
- [Meta for Developers: Graph API Rate Limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)
- [Meta for Developers: Permissions Reference](https://developers.facebook.com/docs/permissions/)
- [Meta for Developers: Access Levels (Standard vs. Advanced)](https://developers.facebook.com/docs/graph-api/overview/access-levels/)
- [Ollama Slow Inference Fix (2026) — aimadetools](https://www.aimadetools.com/blog/ollama-slow-inference-fix)
- [Ollama API Timeout Fix — aimadetools](https://www.aimadetools.com/blog/ollama-api-timeout-fix/)
- [SQLite WAL Mode — Official Documentation](https://sqlite.org/wal.html)
- [Bun SQLite — Official Documentation](https://bun.com/docs/runtime/sqlite)
- [The Write Stuff: Concurrent Write Transactions in SQLite — Oldmoe's blog](https://oldmoe.blog/2024/07/08/the-write-stuff-concurrent-write-transactions-in-sqlite/)
- [Shopee Scraping Guide: Anti-Bot (Pixelscan, 2026)](https://pixelscan.net/blog/shopee-scraping-guide/)
- [How to Scrape Shopee — Bluetick Consultants](https://www.bluetickconsultants.com/how-to-scrape-shopee-at-scale-advanced-anti-bot-bypass-guide/)
- [FTC Disclosures 101 for Social Media Influencers](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers)
- [FTC Affiliate Disclosure Rules 2026 — Automateed](https://www.automateed.com/ftc-disclosure-rules-for-affiliates)
- [SQLite Encryption and Secure Storage — sqliteforum](https://www.sqliteforum.com/p/sqlite-encryption-and-secure-storage)
- [Best Practices for Securing SQLite — blackhawk.sh](https://blackhawk.sh/en/blog/best-practices-for-securing-sqlite/)

---
*Pitfalls research for: self-hosted affiliate product analytics tool (browser extension + Bun/Elysia backend + SQLite + Ollama + Facebook Graph API)*
*Researched: 2026-06-23*
