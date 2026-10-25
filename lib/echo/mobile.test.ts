import { describe, expect, it } from 'vitest'
import { isTextEntry, keyboardInsets, sheetDragOffset, shouldDismissSheet } from './mobile'

describe('keyboardInsets', () => {
  it('is zero when the visual viewport fills the layout viewport', () => {
    expect(keyboardInsets({ layoutHeight: 844, viewportHeight: 844, offsetTop: 0 })).toEqual({ top: 0, bottom: 0 })
  })
  it('ignores small toolbar-sized differences', () => {
    expect(keyboardInsets({ layoutHeight: 844, viewportHeight: 790, offsetTop: 0 })).toEqual({ top: 0, bottom: 0 })
  })
  it('reports the keyboard height (Android: viewport shrinks, no pan)', () => {
    expect(keyboardInsets({ layoutHeight: 844, viewportHeight: 508, offsetTop: 0 })).toEqual({ top: 0, bottom: 336 })
  })
  it('accounts for iOS panning the visual viewport', () => {
    expect(keyboardInsets({ layoutHeight: 844, viewportHeight: 508, offsetTop: 120.4 })).toEqual({ top: 120, bottom: 216 })
  })
  it('treats pinch zoom as no keyboard', () => {
    expect(keyboardInsets({ layoutHeight: 844, viewportHeight: 400, offsetTop: 100, scale: 2 })).toEqual({ top: 0, bottom: 0 })
  })
})

describe('isTextEntry', () => {
  it('detects keyboard-bearing controls', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTextEntry({ tagName: 'input', type: 'search' })).toBe(true)
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true)
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(true)
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
  it('ignores buttons, toggles and read-only fields', () => {
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextEntry({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isTextEntry({ tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(isTextEntry({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})

describe('sheet drag', () => {
  it('follows downward drags and damps upward ones', () => {
    expect(sheetDragOffset(80)).toBe(80)
    expect(sheetDragOffset(-4)).toBe(-4)
    expect(sheetDragOffset(-400)).toBe(-24)
  })
  it('dismisses past the distance threshold', () => {
    expect(shouldDismissSheet(130, 400, 0)).toBe(true)
    expect(shouldDismissSheet(100, 400, 0)).toBe(false)
    expect(shouldDismissSheet(170, 1000, 0)).toBe(true) // capped at 160
    expect(shouldDismissSheet(50, 100, 0)).toBe(true) // min 48 for small sheets
  })
  it('dismisses on a quick downward flick', () => {
    expect(shouldDismissSheet(40, 400, 0.9)).toBe(true)
    expect(shouldDismissSheet(10, 400, 0.9)).toBe(false)
  })
  it('never dismisses on upward drags', () => {
    expect(shouldDismissSheet(-200, 400, 2)).toBe(false)
  })
})
