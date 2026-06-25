---
phase: 2
slug: product-capture-shopee
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun test` (backend); `bun test` / vitest via WXT (extension parsers + normalization) |
| **Config file** | backend: none (bun built-in); extension: `extension/` WXT scaffold (Wave 0 installs) |
| **Quick run command** | `cd backend && bun test` |
| **Full suite command** | `cd backend && bun test && cd ../extension && bun test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test` in the affected workspace
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Wave 0 | — | 0 | CAP-01 | — | Live Shopee selectors verified in DevTools | manual | n/a — human verifies on live page | ❌ W0 | ⬜ pending |
| capture-endpoint | backend | 1 | CAP-02 | — | Capture route binds 127.0.0.1, validates body via TypeBox | integration | `cd backend && bun test` | ❌ W0 | ⬜ pending |
| upsert-migration | backend | 1 | CAP-02 | — | UNIQUE(product_url) enforced; re-capture updates not duplicates | integration | `cd backend && bun test` | ❌ W0 | ⬜ pending |
| normalization | extension | 1 | CAP-01 | — | price-range→lowest, "12.3k"→12300, strip ฿/commas | unit | `cd extension && bun test` | ❌ W0 | ⬜ pending |
| shopee-parser | extension | 2 | CAP-01, CAP-03 | — | Missing fields return empty (not throw); N/N count correct | unit | `cd extension && bun test` | ❌ W0 | ⬜ pending |
| selectors-config | extension | 2 | CAP-05 | — | Config loaded via runtime.getURL; editable without rebuild | unit | `cd extension && bun test` | ❌ W0 | ⬜ pending |
| paste-url-fallback | extension | 2 | CAP-04 | — | Platform auto-detected from URL domain | unit | `cd extension && bun test` | ❌ W0 | ⬜ pending |
| popup-flow | extension | 3 | CAP-01, CAP-03, CAP-04 | — | review-before-save; backend-offline keeps form populated | manual | manual popup test (browser) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify live Shopee product-page CSS selectors in Chrome DevTools and record them in `selectors.config.json` (ROADMAP research flag — selectors are LOW-confidence/assumed until verified)
- [ ] WXT extension scaffold with `bun test` runner wired (extension workspace is greenfield)
- [ ] Backend `bun test` already available from Phase 1 (no install needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| One-click capture from a live Shopee page | CAP-01 | Requires a real Shopee SPA page + DevTools; selectors change per deploy | Open a `shopee.co.th` product page → click extension → confirm fields populate in review form with N/N summary |
| Backend-offline Save behavior | — (D-08) | Requires backend stopped + popup state inspection | Stop `bun dev` → Capture → Save → confirm form stays populated with reach-backend error |
| Zero-fields-read warning + empty form | — (D-07) | Requires a page where selectors fail | Trigger capture on a non-loaded/blocked page → confirm warning + empty editable form, no silent empty save |

*Live-page DOM reads cannot be reliably automated (Shopee anti-bot + obfuscated SPA classes); parser logic is unit-tested against fixture HTML instead.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
