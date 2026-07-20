import { load, type Store } from '@tauri-apps/plugin-store'
import type { ActionButton, Config, WatchedRepo } from '../types'

// Default buttons reproduce the old fixed actions. /review ships with Claude Code; the follow-up
// default is a plain prompt. Placeholders: <branch_name>, <pr_id>. Users edit/add/remove these.
export const DEFAULT_REVIEW_BUTTONS: ActionButton[] = [
  {
    id: 'do-review',
    label: 'do-review',
    icon: 'play',
    prompt: '/review <pr_id>',
    conditions: [],
    advanceTo: 'reviewed',
  },
  {
    id: 'do-followup',
    label: 'do-followup',
    icon: 'refresh',
    prompt:
      'Fetch the review comments of PR #<pr_id> (branch <branch_name>) with gh, check the PR commits to verify whether each comment was addressed, and finish with a line: SUMMARY: X addressed | Y partial | Z pending',
    conditions: [],
    advanceTo: 'followup',
  },
]

export const DEFAULT_PR_BUTTONS: ActionButton[] = [
  { id: 'handle-review', label: 'handle review', icon: 'git-pull-request', prompt: '/handle-review', conditions: [] },
]

let store: Store | null = null

const getStore = async () => {
  if (!store) store = await load('config.json')
  return store
}

export const getConfig = async (): Promise<Config> => {
  const s = await getStore()
  return {
    githubUser: (await s.get<string>('githubUser')) ?? '',
    githubName: (await s.get<string>('githubName')) ?? '',
    repos: (await s.get<WatchedRepo[]>('repos')) ?? [],
    reviewButtons: (await s.get<ActionButton[]>('reviewButtons')) ?? DEFAULT_REVIEW_BUTTONS,
    prButtons: (await s.get<ActionButton[]>('prButtons')) ?? DEFAULT_PR_BUTTONS,
  }
}

export const setReviewButtons = async (buttons: ActionButton[]) => {
  const s = await getStore()
  await s.set('reviewButtons', buttons)
}

export const setPrButtons = async (buttons: ActionButton[]) => {
  const s = await getStore()
  await s.set('prButtons', buttons)
}

export const setGithubUser = async (githubUser: string) => {
  const s = await getStore()
  await s.set('githubUser', githubUser)
}

export const setGithubName = async (githubName: string) => {
  const s = await getStore()
  await s.set('githubName', githubName)
}

export const setRepos = async (repos: WatchedRepo[]) => {
  const s = await getStore()
  await s.set('repos', repos)
}
