import type { FollowupSummary } from '../types'

// a follow-up's "SUMMARY: … addressed … partial … pending" line, as the card badge counts it
export const parseFollowupSummary = (text: string): FollowupSummary | null => {
  const m = text.match(/(\d+)\s*addressed\D*?(\d+)\s*partial\D*?(\d+)\s*pending/i)
  return m ? { addressed: Number(m[1]), partial: Number(m[2]), pending: Number(m[3]) } : null
}
