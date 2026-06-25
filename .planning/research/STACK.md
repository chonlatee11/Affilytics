# Stack Research

**Domain:** Self-hosted affiliate product analytics tool (browser extension + local backend + dashboard)
**Researched:** 2026-06-23
**Confidence:** HIGH (all versions verified against npm registry and Context7 live docs)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | 1.3.14 | Runtime, package manager, bundler, test runner | Native SQLite, native fetch, faster startup than Node; single binary deployment; no npm install for prod |
| Elysia | 1.4.29 | HTTP API framework (backend) | Bun-native, AOT-compiled TypeScript validation via TypeBox (18x faster than Zod), end-to-end type safety with zero extra packages |
| Drizzle ORM | 0.45.2 | SQLite ORM + migrations | Thin layer over `bun:sqlite`; type-safe SQL-like query builder; negligible overhead (~0.04%); `drizzle-kit` handles migrations cleanly |
| WXT | 0.20.26 | Chrome extension bundler/framework | Vite-powered HMR, file-based entrypoints, MV3-first, TypeScript-native, cross-browser; active maintainers; beats Plasmo on build size (5MB → 500KB) and reliability |
| Next.js | 16.2.9 | Frontend dashboard | App Router + React Server Components; best-in-class DX for a localhost dashboard; Tailwind works out of the box |
| Tailwind CSS | 4.3.1 | Dashboard styling | Utility-first; zero-runtime CSS; pairs naturally with shadcn/ui for table/form primitives |
| Recharts | 3.9.0 | Dashboard charts | SVG-based React components; `use client` compatible with App Router; safe default for score trend charts and result tracking |
| Ollama JS (`ollama`) | 0.6.3 | Local LLM client | Official Ollama library; async/await + streaming; abort() for timeout management; no extra HTTP client needed |
| croner | 10.0.1 | In-process cron scheduler | TypeScript-native, DST-aware, error recovery; 600K+ weekly downloads; runs in-process with no Redis/Mongo dependency |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@elysiajs/cors` | 1.4.2 | CORS for localhost | Required on every route — extension's `fetch` to `localhost:3000` is cross-origin from the extension's own origin |
| `@elysiajs/swagger` | 1.3.1 | OpenAPI docs auto-gen | Free during development; useful when debugging extension→backend contract |
| `drizzle-kit` | 0.31.10 | Schema migrations CLI | `drizzle-kit push` for dev, `drizzle-kit generate` + `migrate` for tracked production migrations |
| `@webext-core/messaging` | 3.0.2 | Type-safe extension messaging | Replaces raw `browser.runtime.sendMessage`; prevents runtime messaging errors between content script, background, popup |
| Node.js `crypto` (built-in) | — | Facebook token encryption at rest | AES-256-GCM field-level encryption on the `accessTokenEnc` column; no extra package; key from `BUN_ENCRYPTION_KEY` env var |
| TypeScript | 6.0.3 | Type safety across all layers | All three layers (extension, backend, frontend) share types via a `packages/shared` workspace |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `bun test` | Unit + integration tests | Built-in test runner; no Jest needed; faster |
| `drizzle-kit studio` | Visual DB browser | `bunx drizzle-kit studio` — useful for inspecting SQLite during development |
| Chrome DevTools | Extension debugging | Right-click extension popup → Inspect; check Network tab for `POST localhost:3000/api/products/capture` |
| WXT HMR | Extension hot-reload | `bun run dev` inside `extension/`; `Alt+R` shortcut auto-registered for manual reloads |

---

## Installation

```bash
# Backend
cd backend
bun init
bun add elysia @elysiajs/cors @elysiajs/swagger drizzle-orm
bun add -D drizzle-kit typescript @types/node

# Scheduler + Ollama client
bun add croner ollama

# Extension (scaffolded by WXT)
cd extension
bunx wxt@latest init --template vanilla
bun add @webext-core/messaging

# Frontend
cd frontend
bunx create-next-app@latest . --typescript --tailwind --app
bun add recharts
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Drizzle ORM | Raw `bun:sqlite` | bun:sqlite alone has no migrations, no type inference on query results; Drizzle adds these for ~0.04% overhead |
| Drizzle ORM | Prisma | Prisma requires a separate engine binary and codegen step; heavier for single-file SQLite on a local machine |
| WXT | Plasmo | Plasmo uses a custom Parcel bundler (slowest), is in maintenance mode, React-only, and produces 10x larger bundles |
| WXT | CRXJS | CRXJS is a Vite plugin not a framework; minimal abstraction means more setup; maintenance concerns in 2025-2026 |
| WXT | Plain Vite | WXT wraps Vite with extension-specific conventions (manifest gen, HMR, background/content/popup entrypoints) saving significant boilerplate |
| croner | node-cron | node-cron is less TypeScript-native; croner is DST-aware and has better error recovery; same in-process model |
| Raw `fetch` for FB API | facebook-nodejs-business-sdk | The SDK is large and targets the Marketing/Ads API; for simple Page post publishing, raw `fetch` to `graph.facebook.com/v22.0/{page_id}/feed` is 3 lines and has zero overhead |
| Node `crypto` (built-in) | SQLCipher | SQLCipher requires a native module fork of better-sqlite3; `bun:sqlite` doesn't support SQLCipher; field-level AES-256-GCM on the single sensitive column (accessTokenEnc) is simpler and sufficient |
| Recharts | Apache ECharts | ECharts is overkill for score trend lines and bar charts at <1000 data points; Recharts is smaller and easier in React |
| Recharts | Chart.js / react-chartjs-2 | Canvas rendering has no advantage at this data scale; Recharts SVG integrates cleanly with Tailwind theming |
| Tailwind CSS | CSS Modules | Tailwind + shadcn/ui provides ready-made table, form, and badge components that match this dashboard's UX needs |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `better-sqlite3` | Does not work with Bun's native runtime; requires Node.js `node_modules` binding | `bun:sqlite` (via `drizzle-orm/bun-sqlite`) |
| `Prisma` | Requires binary query engine download; codegen; much heavier than Drizzle for a local SQLite file | Drizzle ORM |
| `Plasmo` extension framework | Custom Parcel bundler (slowest), React-only, maintenance slowing, 10x larger bundles vs WXT | WXT |
| `node-fetch` or `axios` | Bun has native `fetch` built-in; adding another HTTP client is redundant weight | Native `fetch` (globally available in Bun) |
| `facebook-nodejs-business-sdk` | Large; designed for Ads/Marketing API; overkill for simple page feed posting | Raw `fetch` to `https://graph.facebook.com/v22.0/{pageId}/feed` |
| `Zod` for Elysia validation | Elysia has its own TypeBox-based `t` validator built-in with AOT compilation; mixing Zod duplicates validation and slows routes | Elysia's built-in `t` (TypeBox) |
| `jsonwebtoken` | Not needed — this is a single-operator local tool; no multi-user session management required | No auth needed; extension communicates to localhost only |
| `SQLCipher` / `@journeyapps/sqlcipher` | Requires native Node.js binding incompatible with Bun's SQLite; adds complexity for one sensitive column | Node.js built-in `crypto`, AES-256-GCM on the `accessTokenEnc` column only |

---

## Stack Patterns by Layer

**Backend (Elysia + Bun + Drizzle):**
- Single `src/index.ts` entry point; Elysia plugins for CORS and Swagger
- Schema defined in `db/schema.ts` using Drizzle's SQLite column builders
- All route handlers are typed end-to-end: Elysia infers body/response types from `t.Object()` schemas
- Scheduler (`croner`) registered at app startup in `index.ts`; fires `publishService.runPendingPosts()` on cron tick

**Extension (WXT + TypeScript):**
- `entrypoints/content.ts` — injects overlay UI on Shopee/Lazada/TikTok product pages
- `entrypoints/background.ts` — service worker; relays messages from content script to backend `fetch`
- `entrypoints/popup.ts` — popup UI; shows capture status
- Selectors stored in `parsers/selectors.config.json` outside the compiled bundle so they can be edited without a rebuild
- `@webext-core/messaging` for typed content↔background↔popup communication
- Use `world: 'ISOLATED'` (default) for content scripts — no need for `MAIN` world access

**Frontend (Next.js App Router):**
- All API calls go to `http://localhost:3000/api` via a thin `lib/api.ts` fetch wrapper
- Charts must be in `'use client'` components — Recharts uses browser APIs
- Use `shadcn/ui` for table/form/badge primitives; pair with Recharts for trend/comparison charts
- No server-side data fetching for dashboard data — all client-side polling/fetch since the backend is localhost

**Facebook Token Encryption:**
```typescript
// Store: encrypt before INSERT
import { createCipheriv, randomBytes, createDecipheriv } from 'crypto'
const KEY = Buffer.from(process.env.BUN_ENCRYPTION_KEY!, 'hex') // 32-byte hex key
const iv = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', KEY, iv)
const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
const tag = cipher.getAuthTag()
const stored = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
```

**Ollama Caption Generation with Timeout Fallback:**
```typescript
import { Ollama } from 'ollama'
const ollama = new Ollama({ host: 'http://127.0.0.1:11434' })
const TIMEOUT_MS = 30_000

async function generateCaption(prompt: string): Promise<string> {
  const timer = setTimeout(() => ollama.abort(), TIMEOUT_MS)
  try {
    const res = await ollama.chat({ model: 'qwen2.5:7b', messages: [{ role: 'user', content: prompt }] })
    return res.message.content
  } catch {
    return buildTemplateCaption(prompt) // fallback
  } finally {
    clearTimeout(timer)
  }
}
```

**Facebook Graph API — raw fetch pattern:**
```typescript
const FB_VERSION = 'v22.0'
async function publishToPage(pageId: string, token: string, message: string) {
  const res = await fetch(`https://graph.facebook.com/${FB_VERSION}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: token })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ id: string }>
}
```

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `elysia@1.4.29` | `bun@1.3.x` | Elysia is Bun-first; works on Node too but optimized for Bun |
| `drizzle-orm@0.45.2` | `bun:sqlite` (built-in) | Use `drizzle-orm/bun-sqlite` import path; add `--bun` flag to `drizzle-kit` commands in package.json scripts |
| `wxt@0.20.26` | Chrome MV3, Firefox MV2/MV3 | MV3 service worker is the default for Chrome; WXT handles the manifest generation |
| `recharts@3.9.0` | `next@16.x`, React 19 | Requires `'use client'` directive on any component that imports Recharts |
| `croner@10.0.1` | Bun 1.3.x | Pure TypeScript/JS; no native bindings; runs identically on Bun and Node |
| `ollama@0.6.3` | Ollama daemon ≥0.4.x | Uses Ollama REST API (`/api/chat`); no hard version coupling — just needs the daemon running on port 11434 |

---

## Sources

- `/elysiajs/documentation` (Context7) — CORS plugin, validation (`t` TypeBox), plugin setup
- `/oven-sh/bun` (Context7) — `bun:sqlite` + Drizzle integration patterns
- `/wxt-dev/wxt` (Context7 + wxt.dev) — MV3 content script setup, messaging, service worker
- `/drizzle-team/drizzle-orm-docs` (Context7) — `drizzle-orm/bun-sqlite` connect pattern, migrations
- npm registry (live) — elysia@1.4.29, wxt@0.20.26, drizzle-orm@0.45.2, drizzle-kit@0.31.10, croner@10.0.1, ollama@0.6.3, next@16.2.9, recharts@3.9.0, tailwindcss@4.3.1, typescript@6.0.3
- WebSearch (MEDIUM confidence) — WXT vs Plasmo comparison; croner vs node-cron; bun:sqlite vs Drizzle; FB Graph API raw fetch vs SDK; token encryption patterns

---
*Stack research for: Affilytics — self-hosted affiliate analytics tool*
*Researched: 2026-06-23*
