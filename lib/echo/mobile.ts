/** Pure helpers for the mobile layout: on-screen keyboard insets, text-entry detection and bottom-sheet drag. */

/** Below this width the app uses the mobile layout (tab bar, sheets). Matches Tailwind's `max-lg`. */
export const MOBILE_QUERY = '(max-width: 1023.98px)'

/** Smaller gaps between the layout and visual viewport are browser toolbars, not a keyboard. */
export const KEYBOARD_MIN_PX = 80

export type ViewportMetrics = { layoutHeight: number; viewportHeight: number; offsetTop: number; scale?: number }

/**
 * Where the visible area sits inside the layout viewport while the on-screen keyboard is open.
 * `bottom` is the keyboard height (px to keep clear at the bottom), `top` is how far the browser
 * panned the visual viewport down (iOS Safari does this when focusing an input).
 * Pinch-zoom (scale > 1) is not a keyboard, so it returns zeros.
 */
export function keyboardInsets({ layoutHeight, viewportHeight, offsetTop, scale = 1 }: ViewportMetrics): { top: number; bottom: number } {
  if (scale > 1.01) return { top: 0, bottom: 0 }
  const top = Math.max(0, Math.round(offsetTop))
  const bottom = Math.max(0, Math.round(layoutHeight - viewportHeight - top))
  if (bottom < KEYBOARD_MIN_PX) return { top: 0, bottom: 0 }
  return { top, bottom }
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image', 'hidden'])

/** True for elements that bring up the on-screen keyboard (text inputs, textareas, selects, contenteditable). */
export function isTextEntry(el: { tagName?: string; type?: string; isContentEditable?: boolean; readOnly?: boolean } | null | undefined): boolean {
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA') return !el.readOnly
  if (tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  return !el.readOnly && !NON_TEXT_INPUTS.has((el.type ?? 'text').toLowerCase())
}

/** Sheet follows the finger downwards; upward drags are damped so it barely moves past its resting place. */
export function sheetDragOffset(dy: number): number {
  return dy >= 0 ? dy : -Math.min(24, Math.sqrt(-dy) * 2)
}

/** Dismiss when dragged down past 30% of its height (max 160 px) or flicked down faster than 0.6 px/ms. */
export function shouldDismissSheet(dy: number, height: number, velocity: number): boolean {
  if (dy <= 0) return false
  if (velocity > 0.6 && dy > 24) return true
  return dy > Math.min(160, Math.max(48, height * 0.3))
}
