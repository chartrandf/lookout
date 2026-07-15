import { load, type Store } from '@tauri-apps/plugin-store'
import type { Commands, Config, WatchedRepo } from '../types'

// Defaults that work without custom slash commands: /review ships with Claude Code,
// the follow-up default is a plain prompt. Placeholders: <branch_name>, <pr_id>.
export const DEFAULT_COMMANDS: Commands = {
  review: '/review <pr_id>',
  followup:
    'Fetch the review comments of PR #<pr_id> (branch <branch_name>) with gh, check the PR commits to verify whether each comment was addressed, and finish with a line: SUMMARY: X addressed | Y partial | Z pending',
  handleReview: '/handle-review',
}

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
    commands: { ...DEFAULT_COMMANDS, ...((await s.get<Partial<Commands>>('commands')) ?? {}) },
  }
}

export const setCommands = async (commands: Commands) => {
  const s = await getStore()
  await s.set('commands', commands)
}

export const setGithubUser = async (githubUser: string) => {
  const s = await getStore()
  await s.set('githubUser', githubUser)
}

export const setRepos = async (repos: WatchedRepo[]) => {
  const s = await getStore()
  await s.set('repos', repos)
}
