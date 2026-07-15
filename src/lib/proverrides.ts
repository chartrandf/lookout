import { load, type Store } from '@tauri-apps/plugin-store'
import type { PrColumn } from '../types'

// Manual column placements for my PRs, keyed by PR id. Persisted so a hand-off survives restarts.
// (The Pull Requests board is otherwise derived live; an override pins a card until the PR merges.)
let store: Store | null = null
const getStore = async () => {
  if (!store) store = await load('pr-overrides.json')
  return store
}

export const getOverrides = async (): Promise<Record<string, PrColumn>> =>
  (await (await getStore()).get<Record<string, PrColumn>>('overrides')) ?? {}

export const setOverride = async (id: string, column: PrColumn) => {
  const s = await getStore()
  const all = (await s.get<Record<string, PrColumn>>('overrides')) ?? {}
  all[id] = column
  await s.set('overrides', all)
}

export const clearOverride = async (id: string) => {
  const s = await getStore()
  const all = (await s.get<Record<string, PrColumn>>('overrides')) ?? {}
  if (id in all) {
    delete all[id]
    await s.set('overrides', all)
  }
}
