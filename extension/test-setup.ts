/**
 * Bun test preload: register happy-dom globals so parsers.test.ts
 * can use DOMParser/Document/Window without a real browser.
 * W1: Bun's test runner has no global DOMParser/Document by default.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
