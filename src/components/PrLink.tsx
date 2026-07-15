import { openPrWindow } from '../lib/prwindow'

type Props = {
  url: string
  repo: string
  prNumber: number
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export const PrLink = ({ url, repo, prNumber, children, className, onClick }: Props) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation()
      onClick?.()
      openPrWindow(url, repo, prNumber)
    }}
    className={`cursor-pointer text-left hover:underline ${className ?? ''}`}
  >
    {children}
  </button>
)
