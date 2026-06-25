/**
 * Popup main entry — 5-state capture flow
 *
 * States:
 *   1. Idle       — "จับข้อมูล" CTA + URL paste input
 *   2. Review     — 8-field editable form, N/N badge, Save/Cancel footer
 *   3. ZeroFields — amber warning + "ลองใหม่อีกครั้ง" + empty form (D-07, B3)
 *   4. Offline    — form preserved + red error banner above footer (D-08)
 *   5. Success    — check-circle + "บันทึกสำเร็จ!" + auto-reset 3s
 *
 * Security (T-02-POPUP-1):
 *   All DOM-sourced strings (product.name, product.shop, etc.) are written via
 *   element.value or element.textContent ONLY — never innerHTML.
 *   This prevents XSS from crafted Shopee page data.
 *
 * Accessibility (ui-ux-pro-max CRITICAL):
 *   - All buttons h-11 (44px) minimum touch target
 *   - All form inputs have <label for="..."> with IDs from UI-SPEC
 *   - Error/warning banners use role="alert"
 *   - Loading buttons use aria-busy="true"
 *   - Focus rings: focus:ring-2 focus:ring-teal-500 on all interactive elements
 */

import { sendMessage } from '../../lib/messaging'
import type { RawProduct, CapturePayload } from '../../lib/messaging'

// --------------------------------------------------------------------------
// Lucide SVG icons (inline, 20x20 — ui-ux-pro-max no-emoji rule)
// --------------------------------------------------------------------------

const ICON_CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`

const ICON_SAVE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`

const ICON_SPINNER = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" aria-hidden="true"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`

const ICON_ALERT_TRIANGLE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-500 flex-shrink-0" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`

const ICON_WIFI_OFF = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500 flex-shrink-0" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`

const ICON_CHECK_CIRCLE_LG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500 mx-auto mb-3" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`

const ICON_LINK = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`

// --------------------------------------------------------------------------
// CSS class constants (verbatim from UI-SPEC Component Inventory)
// --------------------------------------------------------------------------

const CLS_PRIMARY_BTN = 'w-full h-11 rounded-lg bg-orange-500 text-white font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors duration-150 hover:bg-orange-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500'
const CLS_SECONDARY_BTN = 'h-11 px-4 rounded-lg bg-teal-100 text-teal-700 font-semibold text-[13px] border border-teal-200 hover:bg-teal-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500'
const CLS_FORM_INPUT = 'w-full h-9 px-3 rounded-md border border-teal-200 bg-white text-[13px] text-teal-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent'
const CLS_EMPTY_INPUT = 'w-full h-9 px-3 rounded-md border border-amber-300 bg-amber-50 text-[13px] text-teal-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent'
const CLS_DISABLED = 'opacity-60 cursor-not-allowed pointer-events-none'

// --------------------------------------------------------------------------
// Header helper
// --------------------------------------------------------------------------

function renderHeader(title: string, badge?: string): string {
  return `
    <header class="flex items-center justify-between h-10 px-4 bg-teal-100">
      <span class="text-base font-semibold text-teal-900 leading-tight">${title}</span>
      ${badge ? `<span class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-600 text-[11px] font-semibold border border-teal-200">${badge}</span>` : ''}
    </header>`
}

// --------------------------------------------------------------------------
// Review form HTML (shared between State 2 and State 3)
// Security: this HTML only contains static labels and empty input elements.
// Product data is injected ONLY via element.value (never innerHTML).
// --------------------------------------------------------------------------

function renderFormFields(): string {
  return `
    <div class="px-4 pt-3 pb-2 flex flex-col gap-2">
      <div>
        <label for="input-name" class="block text-[13px] text-teal-900 mb-1">ชื่อสินค้า <span class="text-teal-600">*</span></label>
        <input id="input-name" type="text" class="${CLS_FORM_INPUT}" placeholder="ชื่อสินค้า">
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="input-price" class="block text-[13px] text-teal-900 mb-1">ราคา (฿) <span class="text-teal-600">*</span></label>
          <input id="input-price" type="number" class="${CLS_FORM_INPUT}" placeholder="0">
        </div>
        <div>
          <label for="input-discount" class="block text-[13px] text-teal-900 mb-1">ส่วนลด (%)</label>
          <input id="input-discount" type="number" class="${CLS_FORM_INPUT}" placeholder="0">
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="input-rating" class="block text-[13px] text-teal-900 mb-1">คะแนน (0–5)</label>
          <input id="input-rating" type="number" step="0.1" class="${CLS_FORM_INPUT}" placeholder="0.0">
        </div>
        <div>
          <label for="input-reviews" class="block text-[13px] text-teal-900 mb-1">จำนวนรีวิว</label>
          <input id="input-reviews" type="number" class="${CLS_FORM_INPUT}" placeholder="0">
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="input-sales" class="block text-[13px] text-teal-900 mb-1">ยอดขาย</label>
          <input id="input-sales" type="number" class="${CLS_FORM_INPUT}" placeholder="0">
        </div>
        <div>
          <label for="input-shop" class="block text-[13px] text-teal-900 mb-1">ร้านค้า</label>
          <input id="input-shop" type="text" class="${CLS_FORM_INPUT}" placeholder="ชื่อร้าน">
        </div>
      </div>

      <div>
        <label for="input-url" class="block text-[13px] text-teal-900 mb-1">URL สินค้า <span class="text-teal-600">*</span></label>
        <input id="input-url" type="url" class="${CLS_FORM_INPUT}" placeholder="https://shopee.co.th/...">
      </div>
    </div>`
}

// --------------------------------------------------------------------------
// Platform detection from URL (CAP-04)
// --------------------------------------------------------------------------

function detectPlatform(url: string): 'shopee' | 'lazada' | 'tiktok' | null {
  try {
    const host = new URL(url).hostname
    if (host.includes('shopee')) return 'shopee'
    if (host.includes('lazada')) return 'lazada'
    if (host.includes('tiktok')) return 'tiktok'
    return null
  } catch {
    return null
  }
}

// --------------------------------------------------------------------------
// Populate form inputs with product data.
// SECURITY (T-02-POPUP-1): ONLY uses element.value — never innerHTML.
// --------------------------------------------------------------------------

function populateForm(product: Partial<RawProduct>): void {
  const set = (id: string, val: string | number | null | undefined) => {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el) el.value = val != null ? String(val) : ''
  }
  set('input-name', product.name)
  set('input-price', product.price)
  set('input-discount', product.discountPct)
  set('input-rating', product.rating)
  set('input-reviews', product.reviewCount)
  set('input-sales', product.salesCount)
  set('input-shop', product.shop)
  set('input-url', product.productUrl)
}

// Apply amber styling to empty fields (visual cue — not color alone; border also changes)
function applyEmptyFieldStyles(product: Partial<RawProduct>): void {
  const fields: Array<[string, unknown]> = [
    ['input-name', product.name],
    ['input-price', product.price],
    ['input-discount', product.discountPct],
    ['input-rating', product.rating],
    ['input-reviews', product.reviewCount],
    ['input-sales', product.salesCount],
    ['input-shop', product.shop],
    ['input-url', product.productUrl],
  ]
  for (const [id, val] of fields) {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (!el) continue
    if (val == null || val === '' || val === 0) {
      el.className = CLS_EMPTY_INPUT
    } else {
      el.className = CLS_FORM_INPUT
    }
  }
}

// --------------------------------------------------------------------------
// Read form values back into a CapturePayload for Save
// --------------------------------------------------------------------------

function readForm(platform: 'shopee' | 'lazada' | 'tiktok'): CapturePayload | null {
  const get = (id: string): string =>
    (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? ''

  const name = get('input-name')
  const price = parseFloat(get('input-price'))
  const productUrl = get('input-url')

  // Client-side validation: name, price, URL required
  if (!name || isNaN(price) || !productUrl) return null

  return {
    name,
    price,
    discountPct: parseFloat(get('input-discount')) || 0,
    rating: parseFloat(get('input-rating')) || null,
    reviewCount: parseInt(get('input-reviews')) || null,
    salesCount: parseInt(get('input-sales')) || null,
    shop: get('input-shop') || null,
    productUrl,
    platform,
  }
}

// --------------------------------------------------------------------------
// Main state machine
// --------------------------------------------------------------------------

const app = document.getElementById('app')!
let currentPlatform: 'shopee' | 'lazada' | 'tiktok' = 'shopee'

// Track captured product for state transitions (offline recovery etc.)
let lastProduct: Partial<RawProduct> | null = null

// ── State 1: Idle ──────────────────────────────────────────────────────────

function showIdle(): void {
  lastProduct = null
  app.innerHTML = `
    ${renderHeader('Affilytics')}
    <div class="px-4 py-4 flex flex-col">
      <button id="btn-capture" class="${CLS_PRIMARY_BTN}" type="button">
        ${ICON_CAMERA}
        <span id="btn-capture-label">จับข้อมูล</span>
      </button>

      <div class="flex items-center gap-2 my-3">
        <hr class="flex-1 border-teal-200">
        <span class="text-[11px] text-gray-400">หรือ</span>
        <hr class="flex-1 border-teal-200">
      </div>

      <div class="flex flex-col gap-1">
        <label for="input-paste-url" class="text-[13px] text-teal-900">วางลิงก์สินค้า</label>
        <div class="flex gap-2">
          <input
            id="input-paste-url"
            type="url"
            class="${CLS_FORM_INPUT}"
            placeholder="https://shopee.co.th/..."
          >
          <button id="btn-use-url" class="${CLS_SECONDARY_BTN} min-w-[44px] whitespace-nowrap text-[13px]" type="button">
            ใช้ลิงก์
          </button>
        </div>
      </div>
    </div>`

  document.getElementById('btn-capture')!.addEventListener('click', onCapture)
  document.getElementById('btn-use-url')!.addEventListener('click', onUseUrl)
}

// ── State 2: Review Form ───────────────────────────────────────────────────

function showReview(product: Partial<RawProduct>, fieldsRead: number): void {
  lastProduct = product
  app.innerHTML = `
    ${renderHeader('ตรวจสอบข้อมูล', `${fieldsRead}/8 ฟิลด์`)}
    <div id="scroll-area" style="max-height: 460px; overflow-y: auto;">
      ${renderFormFields()}
    </div>
    <div class="flex gap-2 px-4 py-3 bg-white border-t border-teal-100 sticky bottom-0" id="review-footer">
      <button id="btn-cancel" class="${CLS_SECONDARY_BTN} flex-1" type="button">ยกเลิก</button>
      <button id="btn-save" class="${CLS_PRIMARY_BTN} flex-1" type="button">
        ${ICON_SAVE}
        <span id="btn-save-label">บันทึก</span>
      </button>
    </div>`

  populateForm(product)
  applyEmptyFieldStyles(product)

  document.getElementById('btn-cancel')!.addEventListener('click', showIdle)
  document.getElementById('btn-save')!.addEventListener('click', () => onSave('review'))
}

// ── State 3: Zero-Fields Warning (D-07, B3) ───────────────────────────────
// EXPLICIT CODE PATH for fieldsRead === 0 (required by B3 traceability)

function showZeroFields(): void {
  lastProduct = null
  app.innerHTML = `
    ${renderHeader('Affilytics')}
    <div class="px-4 py-4 flex flex-col gap-3">
      <div class="flex gap-2 items-start rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
        ${ICON_ALERT_TRIANGLE}
        <div>
          <p class="text-[13px] font-semibold text-teal-900">ไม่สามารถอ่านข้อมูลได้</p>
          <p class="text-[11px] text-gray-600 mt-0.5">หน้าอาจโหลดไม่เสร็จ กรุณาลองใหม่ หรือกรอกข้อมูลด้วยตัวเอง</p>
        </div>
      </div>

      <button id="btn-retry" class="${CLS_SECONDARY_BTN} w-full" type="button">
        ลองใหม่อีกครั้ง
      </button>

      <div class="flex items-center gap-2 my-1">
        <hr class="flex-1 border-teal-200">
        <span class="text-[11px] text-gray-400">หรือกรอกข้อมูลด้วยตัวเอง</span>
        <hr class="flex-1 border-teal-200">
      </div>

      <div id="scroll-area" style="max-height: 320px; overflow-y: auto;">
        ${renderFormFields()}
      </div>
    </div>
    <div class="flex gap-2 px-4 py-3 bg-white border-t border-teal-100 sticky bottom-0">
      <button id="btn-cancel-zero" class="${CLS_SECONDARY_BTN} flex-1" type="button">ยกเลิก</button>
      <button id="btn-save-zero" class="${CLS_PRIMARY_BTN} flex-1" type="button">
        ${ICON_SAVE}
        <span id="btn-save-label">บันทึก</span>
      </button>
    </div>`

  // All fields empty and amber in zero-fields state
  applyEmptyFieldStyles({})

  document.getElementById('btn-retry')!.addEventListener('click', onCapture)
  document.getElementById('btn-cancel-zero')!.addEventListener('click', showIdle)
  document.getElementById('btn-save-zero')!.addEventListener('click', () => onSave('zero'))
}

// ── State 4: Backend Offline (D-08) ────────────────────────────────────────
// Form is preserved EXACTLY — offline banner prepended above footer.

function showOffline(): void {
  // Remove any existing error banner first
  document.getElementById('error-banner')?.remove()

  // Insert error banner before the footer
  const footer = document.getElementById('review-footer') ?? document.querySelector('.sticky.bottom-0')
  if (footer) {
    const banner = document.createElement('div')
    banner.id = 'error-banner'
    banner.setAttribute('role', 'alert')
    banner.className = 'mx-4 mb-2 flex gap-2 items-start rounded-lg border border-red-300 bg-red-50 p-3'
    // Static HTML only — no product data in this banner (XSS-safe)
    banner.innerHTML = `
      ${ICON_WIFI_OFF}
      <div>
        <p class="text-[13px] font-semibold text-red-700">เชื่อมต่อ backend ไม่ได้</p>
        <p class="text-[11px] text-red-600 mt-0.5">รัน <code class="font-mono bg-red-100 px-1 rounded">bun dev</code> แล้วกดบันทึกอีกครั้ง</p>
      </div>`
    footer.before(banner)
  }

  // Re-enable Save button
  const btnSave = document.getElementById('btn-save') as HTMLButtonElement | null
  if (btnSave) {
    btnSave.disabled = false
    btnSave.className = `${CLS_PRIMARY_BTN} flex-1`
    const label = btnSave.querySelector('#btn-save-label')
    if (label) label.textContent = 'บันทึก'
    // Remove spinner and replace with save icon
    const iconSlot = btnSave.querySelector('svg')
    if (iconSlot) iconSlot.outerHTML = ICON_SAVE
  }
}

// ── State 5: Success ───────────────────────────────────────────────────────

function showSuccess(): void {
  lastProduct = null
  app.innerHTML = `
    ${renderHeader('Affilytics')}
    <div class="px-4 py-8 text-center flex flex-col items-center">
      ${ICON_CHECK_CIRCLE_LG}
      <p class="text-base font-semibold text-teal-900">บันทึกสำเร็จ!</p>
      <p class="text-[13px] text-gray-600 mt-1">สินค้าถูกเพิ่มในระบบแล้ว</p>
      <button id="btn-new" class="${CLS_PRIMARY_BTN} mt-4" type="button">
        ${ICON_CAMERA}
        <span>จับสินค้าใหม่</span>
      </button>
    </div>`

  document.getElementById('btn-new')!.addEventListener('click', showIdle)

  // Auto-reset to State 1 after 3 seconds
  setTimeout(showIdle, 3000)
}

// --------------------------------------------------------------------------
// Event handlers
// --------------------------------------------------------------------------

async function onCapture(): Promise<void> {
  const btn = document.getElementById('btn-capture') ?? document.getElementById('btn-retry')
  const label = document.getElementById('btn-capture-label')

  // Show loading state
  if (btn) {
    btn.setAttribute('aria-busy', 'true')
    btn.setAttribute('aria-label', 'กำลังโหลด...')
    btn.className = btn.className.replace('hover:bg-orange-600', '') + ' ' + CLS_DISABLED
  }
  if (label) label.textContent = 'กำลังอ่าน...'

  // For retry button in State 3
  const retryBtn = document.getElementById('btn-retry')
  if (retryBtn && retryBtn !== btn) {
    retryBtn.setAttribute('aria-busy', 'true')
    retryBtn.className = retryBtn.className + ' ' + CLS_DISABLED
    retryBtn.textContent = 'กำลังอ่าน...'
  }

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      showIdle()
      return
    }

    // Get the active tab's URL for platform detection
    const tabUrl = tab.url ?? ''
    const detectedPlatform = detectPlatform(tabUrl)
    if (detectedPlatform) {
      currentPlatform = detectedPlatform
    }

    const product = await sendMessage('readPage', undefined, tab.id)

    // ── B3 traceability: EXPLICIT fieldsRead === 0 branch (D-07) ──────────
    if (product.fieldsRead === 0) {
      showZeroFields()
      return
    }
    // ── End B3 explicit path ───────────────────────────────────────────────

    showReview(product, product.fieldsRead)
  } catch (err) {
    // Failed to send message to content script (tab not a product page, or not loaded)
    console.error('[Affilytics] readPage failed:', err)
    showZeroFields()
  }
}

function onUseUrl(): void {
  const urlInput = document.getElementById('input-paste-url') as HTMLInputElement | null
  const url = urlInput?.value.trim() ?? ''
  if (!url) return

  const platform = detectPlatform(url)
  if (!platform) {
    // Unknown domain — still open the form; operator can fill manually
    currentPlatform = 'shopee'
  } else {
    currentPlatform = platform
  }

  // CAP-04: open review form with only productUrl + platform prefilled
  const partial: Partial<RawProduct> = {
    productUrl: url,
    platform: currentPlatform,
    name: null,
    price: null,
    discountPct: 0,
    rating: null,
    reviewCount: null,
    salesCount: null,
    shop: null,
    fieldsRead: 1,
    fieldsTotal: 8,
  }
  showReview(partial, 1)
}

async function onSave(origin: 'review' | 'zero'): Promise<void> {
  const btnId = origin === 'review' ? 'btn-save' : 'btn-save-zero'
  const cancelId = origin === 'review' ? 'btn-cancel' : 'btn-cancel-zero'
  const saveLabel = document.getElementById('btn-save-label')

  const btnSave = document.getElementById(btnId) as HTMLButtonElement | null
  const btnCancel = document.getElementById(cancelId) as HTMLButtonElement | null

  // Remove any previous offline banner
  document.getElementById('error-banner')?.remove()

  // Read form
  const payload = readForm(currentPlatform)
  if (!payload) {
    // Show inline validation hint — name/price/URL required
    // We do NOT show an alert box; instead highlight required fields amber
    const nameEl = document.getElementById('input-name') as HTMLInputElement | null
    const priceEl = document.getElementById('input-price') as HTMLInputElement | null
    const urlEl = document.getElementById('input-url') as HTMLInputElement | null
    if (nameEl && !nameEl.value.trim()) nameEl.className = CLS_EMPTY_INPUT
    if (priceEl && !priceEl.value.trim()) priceEl.className = CLS_EMPTY_INPUT
    if (urlEl && !urlEl.value.trim()) urlEl.className = CLS_EMPTY_INPUT
    return
  }

  // Disable buttons during save
  if (btnSave) {
    btnSave.setAttribute('aria-busy', 'true')
    btnSave.setAttribute('aria-label', 'กำลังโหลด...')
    btnSave.className = btnSave.className + ' ' + CLS_DISABLED
    // Replace save icon with spinner
    const iconEl = btnSave.querySelector('svg')
    if (iconEl) iconEl.outerHTML = ICON_SPINNER
  }
  if (saveLabel) saveLabel.textContent = 'กำลังบันทึก...'
  if (btnCancel) {
    btnCancel.className = btnCancel.className + ' ' + CLS_DISABLED
  }

  try {
    const result = await sendMessage('saveProduct', payload)

    if (result.ok) {
      showSuccess()
    } else if (result.error === 'backend_offline') {
      // D-08: form stays as-is; show offline banner
      // First restore Save button to re-enable it
      if (btnSave) {
        btnSave.removeAttribute('aria-busy')
        btnSave.className = btnSave.className.replace(' ' + CLS_DISABLED, '').replace(CLS_DISABLED, '')
        const iconEl = btnSave.querySelector('svg')
        if (iconEl) iconEl.outerHTML = ICON_SAVE
      }
      if (saveLabel) saveLabel.textContent = 'บันทึก'
      if (btnCancel) {
        btnCancel.className = btnCancel.className.replace(' ' + CLS_DISABLED, '').replace(CLS_DISABLED, '')
      }
      showOffline()
    } else {
      // Other server error — show as error banner
      document.getElementById('error-banner')?.remove()
      const footer = document.getElementById('review-footer') ?? document.querySelector('.sticky.bottom-0')
      if (footer) {
        const banner = document.createElement('div')
        banner.id = 'error-banner'
        banner.setAttribute('role', 'alert')
        banner.className = 'mx-4 mb-2 flex gap-2 items-start rounded-lg border border-red-300 bg-red-50 p-3'
        // Static HTML only — error string from server, shown via textContent below
        banner.innerHTML = `
          ${ICON_WIFI_OFF}
          <div>
            <p class="text-[13px] font-semibold text-red-700">บันทึกไม่สำเร็จ</p>
            <p id="err-msg" class="text-[11px] text-red-600 mt-0.5"></p>
          </div>`
        // Use textContent to show server error — never innerHTML with untrusted data
        const msgEl = banner.querySelector('#err-msg')
        if (msgEl) msgEl.textContent = result.error ?? 'เกิดข้อผิดพลาด'
        footer.before(banner)
      }
      // Re-enable Save
      if (btnSave) {
        btnSave.removeAttribute('aria-busy')
        btnSave.className = btnSave.className.replace(' ' + CLS_DISABLED, '').replace(CLS_DISABLED, '')
        const iconEl = btnSave.querySelector('svg')
        if (iconEl) iconEl.outerHTML = ICON_SAVE
      }
      if (saveLabel) saveLabel.textContent = 'บันทึก'
      if (btnCancel) {
        btnCancel.className = btnCancel.className.replace(' ' + CLS_DISABLED, '').replace(CLS_DISABLED, '')
      }
    }
  } catch {
    // Unexpected error — treat as offline
    if (btnSave) {
      btnSave.removeAttribute('aria-busy')
      btnSave.className = btnSave.className.replace(' ' + CLS_DISABLED, '').replace(CLS_DISABLED, '')
      const iconEl = btnSave.querySelector('svg')
      if (iconEl) iconEl.outerHTML = ICON_SAVE
    }
    if (saveLabel) saveLabel.textContent = 'บันทึก'
    if (btnCancel) {
      btnCancel.className = btnCancel.className.replace(' ' + CLS_DISABLED, '').replace(CLS_DISABLED, '')
    }
    showOffline()
  }
}

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

showIdle()
