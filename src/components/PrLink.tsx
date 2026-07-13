import { openUrl } from '@tauri-apps/plugin-opener'

type Props = { url: string; children: React.ReactNode; className?: string }

export const PrLink = ({ url, children, className }: Props) => (
  <button
    type="button"
    onClick={() => openUrl(url)}
    className={`cursor-pointer text-left hover:underline ${className ?? ''}`}
  >
    {children}
  </button>
)
