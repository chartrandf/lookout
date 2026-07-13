import { openPrWindow } from '../lib/prwindow'

type Props = { url: string; repo: string; prNumber: number; children: React.ReactNode; className?: string }

export const PrLink = ({ url, repo, prNumber, children, className }: Props) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation()
      openPrWindow(url, repo, prNumber)
    }}
    className={`cursor-pointer text-left hover:underline ${className ?? ''}`}
  >
    {children}
  </button>
)
