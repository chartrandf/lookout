import { describe, expect, it } from 'vitest'
import { atLeastRatio, isTextField, stepPanelWidth } from './panelwidth'

describe('stepPanelWidth', () => {
  it('grows by 15% of the viewport', () => {
    expect(stepPanelWidth(500, 1, 1000)).toBe(650)
  })

  it('shrinks by 15% of the viewport', () => {
    expect(stepPanelWidth(700, -1, 1000)).toBe(550)
  })

  it('caps at 90% of the viewport', () => {
    expect(stepPanelWidth(800, 1, 1000)).toBe(900)
  })

  it('floors at 400px', () => {
    expect(stepPanelWidth(450, -1, 1000)).toBe(400)
  })
})

describe('isTextField', () => {
  const el = (tagName: string, isContentEditable = false, value = 'text') =>
    ({ tagName, isContentEditable, value, textContent: value }) as unknown as Element

  it('matches inputs, textareas, selects and contenteditable', () => {
    expect(isTextField(el('INPUT'))).toBe(true)
    expect(isTextField(el('TEXTAREA'))).toBe(true)
    expect(isTextField(el('SELECT'))).toBe(true)
    expect(isTextField(el('DIV', true))).toBe(true)
  })

  it('ignores an empty field: the caret has nowhere to go, the shortcut is free', () => {
    expect(isTextField(el('INPUT', false, ''))).toBe(false)
    expect(isTextField(el('TEXTAREA', false, ''))).toBe(false)
    expect(isTextField(el('DIV', true, ''))).toBe(false)
  })

  it('ignores other elements and null', () => {
    expect(isTextField(el('BUTTON'))).toBe(false)
    expect(isTextField(null)).toBe(false)
  })
})

describe('atLeastRatio', () => {
  it('widens a narrower panel to the ratio', () => {
    expect(atLeastRatio(440, 0.5, 1600)).toBe(800)
  })

  it('leaves a panel already wider as it is', () => {
    expect(atLeastRatio(1000, 0.5, 1600)).toBe(1000)
  })
})
