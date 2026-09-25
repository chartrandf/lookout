import { describe, expect, it } from 'vitest'
import { messageTime, startOfToday } from './time'

describe('startOfToday', () => {
  it('is local midnight of the given day, not UTC midnight', () => {
    const noon = new Date(2026, 8, 11, 12, 0, 0)
    const midnight = new Date(startOfToday(noon))
    expect(midnight.getFullYear()).toBe(2026)
    expect(midnight.getMonth()).toBe(8)
    expect(midnight.getDate()).toBe(11)
    expect(midnight.getHours()).toBe(0)
    expect(midnight.getMinutes()).toBe(0)
  })

  it('keeps a late-evening merge inside the current day', () => {
    const late = new Date(2026, 8, 11, 23, 50, 0)
    expect(new Date(startOfToday(late)) <= late).toBe(true)
    expect(startOfToday(late)).toBe(startOfToday(new Date(2026, 8, 11, 0, 10, 0)))
  })

  it('rolls over at midnight', () =>
    expect(startOfToday(new Date(2026, 8, 12, 0, 1, 0))).not.toBe(startOfToday(new Date(2026, 8, 11, 23, 59, 0))))
})

describe('messageTime', () => {
  const now = new Date(2026, 0, 15, 18, 0) // local time, whatever the machine's zone

  it('shows only the clock for a message sent today', () => {
    expect(messageTime(new Date(2026, 0, 15, 9, 5).toISOString(), now)).toBe('09:05')
  })

  it('adds the day for an older message', () => {
    expect(messageTime(new Date(2026, 0, 14, 23, 59).toISOString(), now)).toBe('Jan 14, 23:59')
  })

  it('adds the year once the message is from another year', () => {
    expect(messageTime(new Date(2025, 11, 31, 8, 0).toISOString(), now)).toBe('Dec 31, 2025, 08:00')
  })
})
