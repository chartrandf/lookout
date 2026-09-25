export const timeAgo = (iso: string | null): string => {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

// Local midnight, as an ISO instant. What "today" means for the Done column: a PR merged at 23:50
// is still today's until the clock rolls over, wherever the laptop happens to be.
export const startOfToday = (now = new Date()): string =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

// A chat message's stamp, as a messenger shows it: the clock alone today, the day before that, the
// year only once it differs. Spelled out by hand so it doesn't follow the OS locale (the UI is English).
export const messageTime = (iso: string, now = new Date()): string => {
  const d = new Date(iso)
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return clock
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? `${day}, ${clock}` : `${day}, ${d.getFullYear()}, ${clock}`
}
