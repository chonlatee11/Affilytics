/**
 * Bun test preload: register happy-dom globals so parsers.test.ts
 * can use DOMParser/Document/Window without a real browser.
 * W1: Bun's test runner has no global DOMParser/Document by default.
 *
 * happy-dom v20+ uses Window directly instead of GlobalRegistrator.
 * Assign key globals to globalThis so bun test finds DOMParser.
 */
import { Window } from 'happy-dom'

const window = new Window()

// Assign happy-dom globals onto globalThis for bun test runner
Object.assign(globalThis, {
  DOMParser: window.DOMParser,
  Document: window.Document,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  Node: window.Node,
})
