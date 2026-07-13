import { load, type Store } from '@tauri-apps/plugin-store'
import type { Config, WatchedRepo } from '../types'

let store: Store | null = null

const getStore = async () => {
  if (!store) store = await load('config.json')
  return store
}

export const getConfig = async (): Promise<Config> => {
  const s = await getStore()
  return {
    githubUser: (await s.get<string>('githubUser')) ?? '',
    repos: (await s.get<WatchedRepo[]>('repos')) ?? [],
  }
}

export const setGithubUser = async (githubUser: string) => {
  const s = await getStore()
  await s.set('githubUser', githubUser)
}

export const setRepos = async (repos: WatchedRepo[]) => {
  const s = await getStore()
  await s.set('repos', repos)
}
