# Feature Research

**Domain:** Affiliate product-research + link-management + social-publishing tool (self-hosted, single-operator, zero-cost)
**Researched:** 2026-06-23
**Confidence:** HIGH (domain is well-understood; constraints are explicit in PROJECT.md and requirements-affiliate-system-v0.4.md)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a tool in this domain must have. Missing any of these makes the product feel broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Product list with sortable/filterable table | Core utility of any comparison tool; users immediately look for this | LOW | Sort by score, platform, price, rating. The ranked table IS the value delivery moment (US-3) |
| Per-product score/rank display | The whole point of the tool is "which product to promote"; score must be visible inline | LOW | Show 0–100 score in table and on product detail page |
| Product detail view + edit form | Users need to set commission % and affiliate URL; capturing without editing is useless | LOW | Commission %, affiliate URL, campaign tag are manual; fields read-only if from extension |
| Affiliate URL storage + copy button | Affiliate operators always need fast access to their tracking links | LOW | Paste-in, validate URL format, one-click copy |
| Caption draft create/edit | Every social publishing workflow tool offers this; operators expect to write the caption somewhere before publishing | MEDIUM | Thai + English needed; auto-append #ad + affiliate link |
| Draft approval / review step | Without a review step, posts can go live with errors; all publishing tools (SocialPilot, Planable, Hootsuite) include this | LOW | State machine: draft → pending_approval → approved → published |
| Publish to Facebook Page | Single stated publish target; without this, the "publish" workflow has no destination | HIGH | Facebook Graph API v25.0, page token, `pages_manage_posts` permission |
| Scheduled posting | All Facebook publishing tools support scheduling; operators expect "post at 8pm" | MEDIUM | `published=false` + `scheduled_publish_time` UNIX timestamp via Graph API |
| Settings page (FB token, score weights) | Without settings, token is hardcoded and weights can't be tuned | LOW | OAuth connect, encrypt token at rest, weight sliders, daily post limit |
| Per-product result entry (manual) | Operator has no API for conversions; they read platform dashboards and type in numbers | LOW | Clicks, orders, commission (THB), notes per product/campaign |
| Ollama / template fallback for captions | AI caption gen is expected in any modern tool; template fallback ensures it never hard-fails | HIGH | CPU-only Ollama (Qwen 2.5); template always available if Ollama is down (C-6) |

---

### Differentiators (Competitive Advantage)

Features that set Affilytics apart from generic publishing/scheduling tools or paid product-research SaaS platforms.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Weighted promote-worthiness score (configurable) | Existing tools (Split Dragon, Kalodata, Dropship Spy) score for sellers, not affiliate creators. Affilytics scores PROMOTION ROI: commission × popularity × rating × reviews × discount — tunable per operator preference | MEDIUM | Formula in scoringService.ts; weights persisted in Settings; recalculate on weight change |
| Multi-product side-by-side comparison view | Competitor tools are either expensive SaaS or platform-specific. A free, local, cross-platform comparison table for Shopee + Lazada + TikTok in one view is unique | MEDIUM | Select 2–N products from list; show metric columns side by side (US-3) |
| Browser extension data capture (operator-page-only) | Other tools mass-scrape or require API access. Affilytics reads only the page the operator has open — zero cost, no ToS risk | HIGH | Manifest V3; platform parsers isolated per platform; selector config for easy repair (C-3) |
| Actual-vs-predicted score feedback loop | No competitor at this price point offers this. Comparing the weighted score (prediction) vs. actual clicks/orders (reality) lets the operator tune weights over time — a local "ML feedback loop" | MEDIUM | ResultEntry → chart comparing predicted score rank vs. actual commission earned (US-6, M7) |
| Zero-cost, fully self-hosted, zero-cloud | All comparable tools (Kalodata, FastMoss, Split Dragon) are paid SaaS. This runs entirely on the operator's machine at $0/month recurring | LOW (infra) / HIGH (ops) | Single-machine deployment: Bun backend + Next.js frontend + SQLite + Ollama + Chrome extension |
| Config-driven DOM selectors (hot-patchable) | E-commerce platforms (Shopee/Lazada/TikTok) update their HTML frequently. Selector configs in a JSON file let the operator fix a broken parser without rebuilding or reloading the extension | LOW | selectors.config.json; all 3 platforms; graceful empty-field fallback (NFR-3) |
| Caption bilingual drafting (Thai + English) | Tools targeting Western markets don't handle Thai. Affilytics is built for Thai-market Facebook affiliate content specifically, with tone selection (casual/formal/fun) | MEDIUM | captionTH + captionEN in PostDraft; Ollama prompt in both languages; template variants per tone |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that appear useful but would violate constraints, balloon complexity, or undermine the tool's core positioning.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic conversion tracking (click/order/commission) | Operators want real-time ROI without manual entry | No platform (Shopee/Lazada/TikTok) exposes affiliate conversion data via free API. Building this requires per-platform scraping or paid integrations, which violates C-1 and C-5, and creates a maintenance treadmill | Manual result entry (US-6/M7) with history view and comparison charts |
| Mass product scraping / bulk product harvest | Collecting many products without opening each one manually seems faster | ToS violation and blocking risk on all three platforms (C-2). Honey/Capital One extension scandals show how quickly cookie hijacking / aggressive data capture destroys user and platform trust | Browser extension reads only operator-opened pages at normal browsing speed |
| Affiliate link auto-generation via platform API | Auto-generating Shopee/Lazada affiliate links from within the tool | Shopee and Lazada do not expose affiliate link creation to a free public API; building this requires network-level auth not covered by any platform's free tier | Operator creates links in platform affiliate dashboard, pastes into Affilytics (C-4) |
| Automatic Facebook token refresh / OAuth server | Re-authenticating the FB token without user action | Requires a public-facing callback URL (not viable on a pure localhost tool); adds OAuth server complexity; Meta tokens expire ~60 days and require user re-auth intentionally as a security feature | Notify operator when token is near expiry; provide one-click re-auth in settings |
| Multi-platform social publishing (Instagram, TikTok, X) | Operators may want to post to multiple platforms at once | Instagram requires Meta Business Account flows with separate permissions; TikTok API is increasingly restricted; X API is now expensive. Adds significant API surface for limited ROI given the Facebook-first operator | Design draft system so caption text can be copied manually to other platforms ("draft-to-copy" mode for X, as spec notes) |
| Multi-user / role-based access | Teams may want to share the dashboard | The entire architecture (single SQLite, localhost-only, single FB token) is single-operator by design. Adding multi-user requires auth middleware, user tables, session management, and permission scopes — invalidates most of the simplicity that makes this tool maintainable | Document as single-operator by design; multi-user would require a full rewrite of the auth layer |
| Real-time push notifications / webhooks | Alert operator the moment a post is published or fails | On a self-hosted single-machine tool, real-time push adds websocket complexity for a one-person audience; the operator is already on the same machine | In-process scheduler logs results; dashboard shows status and any retry queue items; operator can refresh |
| Automatic A/B caption testing | Testing two captions on the same product to see which performs better | Requires publishing two posts, correlating FB post engagement back to captions, and statistical analysis — vastly more complex than the manual result-entry model | Operator can manually duplicate a draft, change the caption, and compare results in the result entry screen |
| Automatic content image generation | Generating product images or promo graphics | Adds a text-to-image model requirement (Stable Diffusion or similar) which needs significant GPU/VRAM the operator's machine lacks (RX 480, no ROCm). Bloats scope | Operator attaches images manually when publishing, or uses existing product images from the platform page |
| Link cloaking / URL shortening | Shortening or cloaking affiliate URLs for cleaner social posts | The operator manages their own affiliate links from the platform; adding a URL shortener introduces another service dependency and potential commission-attribution confusion (similar to Honey/Capital One hijacking scandals) | Store and display the raw affiliate URL; copy-to-clipboard is sufficient |
| Product data auto-refresh / price monitoring | Re-checking prices and stock on captured products | Requires background scraping of product pages the operator is not actively viewing, which is exactly the mass-scraping pattern prohibited by C-2 and ToS | Operator can re-open the product page and re-capture it with the extension to get fresh data |

---

## Feature Dependencies

```
[Browser Extension Capture] (US-1/M1)
    └──required by──> [Score Computation] (US-2/M2)
                          └──required by──> [Dashboard Table + Comparison] (US-3/M8)
                                                └──enhances──> [Caption Drafting] (US-4/M4)
                                                                   └──required by──> [Approval Queue] (US-5/M5)
                                                                                        └──required by──> [FB Publishing] (US-5/M6)

[Commission % Entry + Affiliate URL] (US-2/M3)
    └──required by──> [Score Computation] (commission is a score input)
    └──required by──> [Caption Drafting] (affiliate link appended to caption)

[FB Settings + Token] (M9)
    └──required by──> [FB Publishing] (US-5/M6)

[FB Publishing] (M6)
    └──required by──> [Manual Result Entry] (US-6/M7) (results tie back to published posts)

[Manual Result Entry] (US-6/M7)
    └──enhances──> [Score Computation] (actual-vs-predicted feedback loop)

[Ollama Service] (optional path)
    └──enhances──> [Caption Drafting] (falls back to template if unavailable; template is the baseline)
```

### Dependency Notes

- **Score Computation requires Browser Extension Capture + Commission % entry:** Score cannot be computed until the product record exists (from extension) and commission % is entered (manual). These two data sources feed the weighted formula directly.
- **Caption Drafting requires Commission % + Affiliate URL:** The caption auto-appends the affiliate link. Drafting before the link is set produces an incomplete draft.
- **Approval Queue requires Caption Drafting:** There is nothing to approve until a draft exists. The approval queue is a gate, not a source.
- **FB Publishing requires Approval Queue:** Only `approved` status posts can transition to `published`. This is a hard state-machine constraint (compliance safety, M5-FR-M5-2).
- **FB Publishing requires FB Settings + Token:** Token must be connected and not expired before any publish call can succeed.
- **Manual Result Entry is enhanced by FB Publishing:** Results are tracked per product/campaign; if a post was never published, there are no results to log. Entry is still possible but context-free.
- **Ollama is an enhancement, not a dependency:** Template-based draft generation is the baseline. Ollama adds quality; its absence does not block any workflow. This ordering must be reflected in build phases (template first, Ollama second).
- **Config-driven selectors are a resilience feature, not a phase dependency:** They should be in place from the moment the extension is built (Phase 2), not added later.

---

## MVP Definition

### Launch With (v1) — US-1 through US-6

The specification defines the MVP explicitly. Research confirms this ordering is correct given the dependency chain.

- [ ] Browser extension captures Shopee product data (name, price, discount, rating, reviews, sales count, URL) — validates the extension ↔ backend roundtrip, which is the hardest integration risk
- [ ] Partial captures (unreadable fields) do not crash the record — operator can fill in blanks
- [ ] Commission % and affiliate URL entry per product — required input for score; no score without these
- [ ] Weighted promote-worthiness score computed and displayed — the core value delivery moment; everything else supports this
- [ ] Score weights tunable in settings — operators will disagree with defaults; tuning is part of the value
- [ ] Dashboard table: ranked, filterable by platform / price range / rating — the comparison surface the operator uses daily
- [ ] Multi-product side-by-side comparison — differentiator; validates ranking usefulness
- [ ] Template-based Thai + English caption drafting with auto-appended affiliate link + #ad — safe baseline that never fails
- [ ] Draft approval queue (draft → pending_approval → approved; reject path) — required before any FB post can be sent
- [ ] Publish to Facebook Page (immediate + scheduled) with rate guard and fbPostId storage — closes the loop from capture to publication
- [ ] Manual result entry (clicks/orders/commission) per product — completes the feedback loop needed to validate the scoring model

### Add After Validation (v1.x)

- [ ] Ollama/Qwen 2.5 AI caption generation — only add after template path is proven stable; Ollama is a quality upgrade, not a core dependency
- [ ] Lazada parser — add once Shopee parser is battle-tested; same architecture, different selectors
- [ ] TikTok parser — add after Lazada; TikTok DOM is more dynamic (SPA/lazy-load heavy), higher implementation risk
- [ ] Actual-vs-predicted score chart in results view — requires at least a few weeks of real operator data before it is meaningful

### Future Consideration (v2+)

- [ ] X (Twitter) "draft-to-copy" mode — post text generated for Twitter format; operator copies manually (no API needed per spec Out of Scope)
- [ ] Instagram publishing — requires separate Meta app permissions and media upload flow; significant API surface increase
- [ ] URL paste fallback for product capture — useful when extension fails on a page; lower priority than fixing parser
- [ ] Bulk CSV product import — useful for migrating from a spreadsheet; defer until operator has demonstrated long-term use
- [ ] Historical score weight tuning assistant — uses ResultEntry data to suggest better weights; requires enough history to be statistically meaningful

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Extension capture (Shopee) | HIGH | HIGH | P1 |
| Weighted score computation | HIGH | LOW | P1 |
| Dashboard ranked table | HIGH | LOW | P1 |
| Commission % + affiliate URL entry | HIGH | LOW | P1 |
| Template caption drafting | HIGH | MEDIUM | P1 |
| Draft approval queue | HIGH | LOW | P1 |
| FB Page publishing (immediate) | HIGH | HIGH | P1 |
| Manual result entry | MEDIUM | LOW | P1 |
| Score weight settings | MEDIUM | LOW | P1 |
| FB token OAuth + encrypted storage | HIGH | MEDIUM | P1 |
| Multi-product comparison view | MEDIUM | LOW | P1 |
| Scheduled FB posting | MEDIUM | MEDIUM | P1 |
| Ollama/Qwen 2.5 AI captions | MEDIUM | MEDIUM | P2 |
| Actual-vs-predicted score chart | MEDIUM | MEDIUM | P2 |
| Lazada parser | MEDIUM | MEDIUM | P2 |
| TikTok parser | MEDIUM | HIGH | P2 |
| Config-driven selector hot-patch | LOW (UX) / HIGH (resilience) | LOW | P1 (built-in from day one) |
| Retry + error log for FB failures | MEDIUM | LOW | P1 |
| Daily post-rate guard | MEDIUM | LOW | P1 |

**Priority key:**
- P1: Must have for launch (all US-1..US-6 features)
- P2: Should have, add when core is proven stable (Ollama, Lazada/TikTok parsers, result charts)
- P3: Nice to have, deferred to v2+ (bulk import, Instagram, X copy mode)

---

## Competitor Feature Analysis

These are the closest analogues in the market. Affilytics is not a direct competitor to any of them — it fills a gap that none cover for the single-operator, zero-cost, Southeast Asian affiliate creator use case.

| Feature | Split Dragon (Shopee/Lazada analytics) | Kalodata (TikTok analytics) | SocialPilot / Hootsuite (publishing) | Affilytics |
|---------|----------------------------------------|----------------------------|--------------------------------------|------------|
| Product scoring / ranking | Yes (seller-centric: sales rank, keywords) | Yes (virality + engagement scoring) | No | Yes (affiliate promotion ROI scoring; configurable weights) |
| Commission % as a scoring input | No | No | No | Yes (manual entry; core differentiator) |
| Caption drafting (AI) | No | No | Yes (English-centric) | Yes (Thai + English; Ollama local; template fallback) |
| Approval workflow | No | No | Yes | Yes |
| Facebook publishing + scheduling | No | No | Yes | Yes (single owned Page only) |
| Manual result tracking (actual vs predicted) | No | No | No | Yes |
| Self-hosted / zero-cost | No (paid SaaS) | No (paid SaaS) | No (paid SaaS) | Yes |
| Browser extension for data capture | No (uses platform APIs) | No (uses platform APIs) | No | Yes (DOM reading; privacy-first) |
| Supports Shopee + Lazada + TikTok | Yes (Shopee/Lazada only) | TikTok only | No (not product tools) | Yes (phased: Shopee first, then Lazada, then TikTok) |
| Thai-language support | Partial (Thai platform data) | No | No | Yes (caption TH + EN) |

---

## Sources

- requirements-affiliate-system-v0.4.md — feature backlog US-1..US-6, constraints C-1..C-7, locked decisions
- .planning/PROJECT.md — core value, active requirements, out-of-scope rationale
- [Split Dragon (Shopee/Lazada analytics)](https://slashdot.org/software/product-research-tools/for-lazada/) — competitor product-research features
- [Kalodata (TikTok analytics)](https://www.kalodata.com/) — product scoring, opportunity scoring patterns
- [Dropship Spy virality scoring](https://cropink.com/product-research-tools) — engagement scores, virality ratings as scoring model reference
- [Affiliate Partner Quality Scoring framework](https://www.referralcandy.com/blog/affiliate-partner-quality-scoring) — weighted scoring algorithm patterns
- [Product scoring algorithm patterns](https://analyticahouse.com/blogs/product-scoring-algorithm) — multi-factor weighted average approach
- [SocialPilot Facebook publishing features](https://www.socialpilot.co/facebook-publishing-tools) — approval workflow patterns, AI caption generator patterns
- [Planable approval workflows](https://planable.io/blog/facebook-publishing-tools/) — multi-level approval models
- [Facebook Graph API rate limits and scheduling](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/) — scheduling mechanics, token expiry, rate-limit formula
- [FB Graph API post scheduling guide](https://zernio.com/blog/schedule-facebook-posts-via-api) — `published=false` + `scheduled_publish_time` pattern
- [Honey / Capital One extension commission hijacking](https://www.affiversemedia.com/the-great-affiliate-heist-how-browser-extensions-are-stealing-from-content-creators/) — why link cloaking is an anti-feature
- [Self-hosted affiliate software disadvantages](https://www.scaleo.io/blog/disadvantages-of-self-hosted-affiliate-software-you-should-be-aware-of/) — hidden costs, scope-creep risks
- [Small operator affiliate tool priorities](https://www.affiversemedia.com/7-affiliate-marketing-automation-tools/) — what features matter most for solo operators

---
*Feature research for: self-hosted affiliate product-research + link-management + social-publishing tool*
*Researched: 2026-06-23*
