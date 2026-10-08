import type { FollowupSummary } from '../types'
import { Icon } from './Icon'

// pending / partial / addressed, as a follow-up counted them
export const FollowupBadge = ({ summary, className = '' }: { summary: FollowupSummary; className?: string }) => (
  <span className={`rounded bg-deck-700 px-1 py-0.5 ${className}`}>
    <Icon name="stop" size={12} /> {summary.pending} <Icon name="alert" size={12} /> {summary.partial}{' '}
    <Icon name="check-circle" size={12} /> {summary.addressed}
  </span>
)
