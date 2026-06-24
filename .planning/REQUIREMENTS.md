# Requirements: Affilytics

**Defined:** 2026-06-23
**Core Value:** Given captured products, surface a ranked promote-worthiness score so the operator can confidently pick which products to promote.

## v1 Requirements

Requirements for the MVP (US-1..US-6 + foundation). Each maps to a roadmap phase. IDs trace to the spec's functional requirements (FR-Mx-y) where applicable.

### Foundation

- [x] **FOUND-01**: Backend (Bun + Elysia) runs on localhost and exposes a REST API the extension and dashboard can call
- [x] **FOUND-02**: SQLite database is initialized with WAL mode + busy_timeout and a schema covering all core entities (Product, ProductExtra, PostDraft, PublishedPost, ResultEntry, Page, Setting)
- [x] **FOUND-03**: Extension↔backend and dashboard↔backend communication is restricted to localhost only

### Capture

- [ ] **CAP-01**: Operator can capture product data (name, price, discount %, rating, review count, sales count, shop, product URL) from an open Shopee page with one click in the extension *(FR-M1-1)*
- [ ] **CAP-02**: Captured data is sent to the localhost backend and persisted *(FR-M1-2)*
- [ ] **CAP-03**: Fields that cannot be read are left empty for later manual entry without failing the whole capture *(FR-M1-3)*
- [ ] **CAP-04**: Operator can paste a product URL to create a basic product record as a fallback *(FR-M1-4)*
- [ ] **CAP-05**: Platform CSS selectors live in an editable config file so the operator can fix them when a site changes *(NFR-3, C-3)*

### Scoring

- [ ] **SCORE-01**: Backend normalizes captured data into standard fields (price, discount %, rating, review count, sales count, commission %) *(FR-M2-1)*
- [ ] **SCORE-02**: Operator can enter a commission % per product *(FR-M2-2)*
- [ ] **SCORE-03**: Backend computes a 0-100 weighted promote-worthiness score from commission, sales/popularity, rating, reviews, and discount *(FR-M2-3)*
- [ ] **SCORE-04**: Operator can adjust score weights and product scores recompute accordingly *(FR-M2-3)*

### Links

- [ ] **LINK-01**: Operator can paste an affiliate URL (created in the platform's own program) and store it with the product *(FR-M3-1)*
- [ ] **LINK-02**: Backend validates affiliate link format and the operator can copy the link with one click *(FR-M3-2)*
- [ ] **LINK-03**: Operator can add an optional campaign tag/note per product for cross-referencing in the platform dashboard *(FR-M3-3)*

### Dashboard

- [ ] **DASH-01**: Operator sees a product table with scores, sortable and filterable by score, platform, price range, and rating *(FR-M2-4, FR-M8-1)*
- [ ] **DASH-02**: Operator can select multiple products for side-by-side comparison *(FR-M8-2)*
- [ ] **DASH-03**: Operator can see draft / approval-queue / published-post status in the dashboard *(FR-M8-3)*
- [ ] **DASH-04**: Operator sees a summary of manually-entered results (revenue / trends) *(FR-M8-4)*

### Drafting

- [ ] **DRAFT-01**: Operator can generate a Thai + English caption from product data and a chosen tone, via template or Ollama *(FR-M4-1)*
- [ ] **DRAFT-02**: Generated captions automatically append the affiliate link and an #ad disclosure *(FR-M4-2)*
- [ ] **DRAFT-03**: When Ollama times out, drafting falls back to the template and notifies the operator *(FR-M4-3, NFR-5)*
- [ ] **DRAFT-04**: Operator can edit a draft before saving it *(FR-M4-4)*

### Approval

- [ ] **APPR-01**: A draft enters a pending-approval state and the operator can approve, edit, or reject it per post *(FR-M5-1)*
- [ ] **APPR-02**: Only approved drafts can be published *(FR-M5-2)*

### Publishing

- [ ] **PUB-01**: Operator can publish a post immediately or schedule it to the Facebook Page via the Graph API *(FR-M6-1)*
- [ ] **PUB-02**: A successful publish stores the fbPostId; failures are retried and logged *(FR-M6-2)*
- [ ] **PUB-03**: A daily post-limit rate guard prevents exceeding the configured number of posts per day *(FR-M6-3)*

### Tracking

- [ ] **TRACK-01**: Operator can enter clicks / orders / commission per product or campaign from the platform dashboard *(FR-M7-1)*
- [ ] **TRACK-02**: Operator can view result history and compare actual results against the predicted promote-worthiness score *(FR-M7-2, R-3)*

### Settings

- [x] **SET-01**: Operator can connect a Facebook Page via OAuth and the access token is stored encrypted at rest *(FR-M9-1, NFR-4)*
- [ ] **SET-02**: Operator can configure score weights, content tone, daily post limit, and draft mode (Ollama / template) *(FR-M9-2)*

### Parser Expansion

- [ ] **PARSE-01**: Operator can capture product data from Lazada product pages *(FR-M1-1, §11.8)*
- [ ] **PARSE-02**: Operator can capture product data from TikTok product pages *(FR-M1-1, §11.8)*

## v2 Requirements

Deferred to future releases. Tracked but not in the current roadmap.

### Publishing Expansion

- **PUBX-01**: Draft-to-copy mode for X (Twitter) without API
- **PUBX-02**: Direct Instagram / TikTok publishing

### Drafting Enhancements

- **DRFTX-01**: A/B testing of multiple captions on the same product
- **DRFTX-02**: Caption templates for languages beyond Thai/English

### Operations

- **OPSX-01**: Bulk CSV import of products
- **OPSX-02**: Docker containerization
- **OPSX-03**: Optional cloud sync / backup

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. (Anti-features carry compliance warnings.)

| Feature | Reason |
|---------|--------|
| Affiliate Networks / third-party APIs (Involve Asia, AccessTrade) | Direction change in v0.4; links come from platforms' own affiliate programs |
| Automatic product/link generation via platform APIs | Not available for free; manual entry by design |
| Mass scraping / bulk automatic harvesting | ⚠️ ToS / blocking risk — read only operator-opened pages at normal speed (C-2) |
| Affiliate link cloaking | ⚠️ Compliance / reputation risk; store links verbatim |
| Automatic conversion tracking | No free API; results entered manually (C-5) |
| Multi-user / multi-tenant | Single operator per instance; invalidates the single-machine architecture (NFR-6) |

## Traceability

Phase mapping is finalized by the roadmapper. Initial proposed mapping:

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| SET-01 | Phase 1 | Complete |
| CAP-01 | Phase 2 | Pending |
| CAP-02 | Phase 2 | Pending |
| CAP-03 | Phase 2 | Pending |
| CAP-04 | Phase 2 | Pending |
| CAP-05 | Phase 2 | Pending |
| SCORE-01 | Phase 3 | Pending |
| SCORE-02 | Phase 3 | Pending |
| SCORE-03 | Phase 3 | Pending |
| SCORE-04 | Phase 3 | Pending |
| LINK-01 | Phase 3 | Pending |
| LINK-02 | Phase 3 | Pending |
| LINK-03 | Phase 3 | Pending |
| SET-02 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DRAFT-01 | Phase 5 | Pending |
| DRAFT-02 | Phase 5 | Pending |
| DRAFT-03 | Phase 5 | Pending |
| DRAFT-04 | Phase 5 | Pending |
| APPR-01 | Phase 5 | Pending |
| APPR-02 | Phase 5 | Pending |
| PUB-01 | Phase 6 | Pending |
| PUB-02 | Phase 6 | Pending |
| PUB-03 | Phase 6 | Pending |
| TRACK-01 | Phase 7 | Pending |
| TRACK-02 | Phase 7 | Pending |
| DASH-04 | Phase 7 | Pending |
| PARSE-01 | Phase 8 | Pending |
| PARSE-02 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-23*
*Last updated: 2026-06-23 after initial definition*
