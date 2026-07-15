import { load, type Store } from '@tauri-apps/plugin-store'
import type { PrColumn, PrOverride } from '../types'

// Manual column placements for my PRs, keyed by PR id. Persisted so a hand-off survives restarts.
// (The Pull Requests board is otherwise derived live; an override pins a card until GitHub moves.)
let store: Store | null = null
const getStore = async () => {
  if (!store) store = await load('pr-overrides.json')
  return store
}

const isOverride = (v: unknown): v is PrOverride =>
  typeof v === 'object' && v !== null && 'column' in v && 'baseline' in v

export const getOverrides = async (): Promise<Record<string, PrOverride>> => {
  const raw = (await (await getStore()).get<Record<string, unknown>>('overrides')) ?? {}
  const out: Record<string, PrOverride> = {}
  // keep only well-formed entries (drops any pre-baseline format, which self-heals old sticky pins)
  for (const [id, v] of Object.entries(raw)) if (isOverride(v)) out[id] = v
  return out
}

export const setOverride = async (id: string, column: PrColumn, baseline: PrColumn) => {
  const s = await getStore()
  const all = (await s.get<Record<string, PrOverride>>('overrides')) ?? {}
  all[id] = { column, baseline }
  await s.set('overrides', all)
}

export const clearOverride = async (id: string) => {
  const s = await getStore()
  const all = (await s.get<Record<string, PrOverride>>('overrides')) ?? {}
  if (id in all) {
    delete all[id]
    await s.set('overrides', all)
  }
}
