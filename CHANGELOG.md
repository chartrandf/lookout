# Changelog

## v0.5.2 — 2026-10-28

- [NEW] Lazy PR diff view, header actions, wider panel
- [ENHANCED] Skip unchanged repos and PRs via ETag pulse

## v0.5.0 — 2026-10-25

- [NEW] Opencode CLI as agent alternative
- [FIX] Merge button missing, auto-merge state not detected

## v0.4.23 — 2026-10-22

- [NEW] Terminal session view under history
- [NEW] Auto-merge option for eligible repos
- [ENHANCED] Approval shows inline comment count
- [FIX] Cmd+arrow resize from empty input
- [FIX] History reload syncs drafts and card states

## v0.4.22 — 2026-10-16

- [NEW] Changelog now shown in Settings
- [ENHANCED] PR header in panel looks like GitHub hovercard
- [ENHANCED] Copy PR URL or branch on hover
- [ENHANCED] Merge hook bubble shows one hook icon tinted by outcome

## v0.4.21 — 2026-10-16

- [NEW] Drop a file in the chat to insert its @path
- [ENHANCED] Terminal-style session view, reply from it, spinner while it runs
- [FIX] Snoozed count ignores cards off the board

## v0.4.20 — 2026-10-15

- [ENHANCED] Merge action shows its status, spinner while it runs
- [FIX] Removed card stays out of Discovery until new activity

## v0.4.19 — 2026-10-14

- [NEW] On-merge Claude prompt per board, tracked in card history
- [ENHANCED] Reviews filter, bots excluded

## v0.4.18 — 2026-10-09

- [NEW] Collapsible terminal, Cmd+click a session to read its transcript

## v0.4.17 — 2026-10-08

- [FIX] Same passed/total CI count everywhere

## v0.4.16 — 2026-10-08

- [ENHANCED] Follow-up counts on report bubbles
- [FIX] Passed/total in merge conditions count

## v0.4.15 — 2026-10-07

- [FIX] Card refreshes when its PR window closes

## v0.4.14 — 2026-10-06

- [FIX] Report chat gets focus on See Report

## v0.4.13 — 2026-10-05

- [FIX] Open PRs stay in Done, merged/closed expire after 24h

## v0.4.12 — 2026-10-05

- [ENHANCED] Approve or merge button by approval state, at any stage

## v0.4.11 — 2026-10-02

- [NEW] Stream (beta, off by default): a board of cards run by agents in their own worktrees
- [NEW] Stream flows: templates with steps, approvals and waits on GitHub
- [NEW] Stream watchers turn PR events into cards
- [NEW] Needs-you tab with urgency ranking and grouped notifications
- [NEW] lookout stream CLI to add, list and gate cards
- [FIX] Stream runs: retries, worktree isolation, no push on its own

## v0.4.10 — 2026-10-02

- [NEW] PR-scoped chat sessions with session picker and skill autocomplete
- [ENHANCED] Octicons and tooltips across the app, Snooze button in the PR panel

## v0.4.9 — 2026-09-30

- [NEW] Failing checks listed on the card
- [ENHANCED] Chat always available, starts a session when none
- [FIX] Opens on the first tab, stale reports dropped

## v0.4.8 — 2026-09-30

- [ENHANCED] Any new human comment, review or CI failure wakes a snoozed card
- [FIX] Snooze reliability and fewer GitHub requests

## v0.4.7 — 2026-09-29

- [NEW] Merge button with strategy picker, default in Settings
- [ENHANCED] Approved check on cards

## v0.4.6 — 2026-09-29

- [FIX] History refresh updates the card, draft card menu on hover only

## v0.4.5 — 2026-09-28

- [FIX] Native macOS notifications, toggle in Settings

## v0.4.4 — 2026-09-28

- [ENHANCED] Terminal-style session output, Cmd+←/→ resizes the side panel

## v0.4.3 — 2026-09-28

- [NEW] Action editor with repo picker, links open in the browser

## v0.4.2 — 2026-09-25

- [ENHANCED] Leaner tags, CI check counts, conflicts shown when no CI

## v0.4.1 — 2026-09-25

- [NEW] Snooze on the PR board, quick actions menu on cards

## v0.4.0 — 2026-09-25

- [NEW] Messenger-style history with avatars and report replies
- [NEW] Reviews and follow-ups captured from terminal sessions
- [NEW] Cmd+W hides the board, Cmd+F finds in page
- [FIX] Review capture reliability

## v0.3.6 — 2026-09-21

- [ENHANCED] Terminal output follows the tail, copy URL, history-aware navigation

## v0.3.5 — 2026-09-17

- [FIX] File access to registered clones and their worktrees

## v0.3.4 — 2026-09-15

- [FIX] PRs still board when a local scan is refused

## v0.3.3 — 2026-09-14

- [FIX] Session files closed after scanning

## v0.3.2 — 2026-09-11

- [NEW] Debug log, switchable in Settings

## v0.3.1 — 2026-09-11

- [FIX] Branches checked out in a worktree are followed

## v0.3.0 — 2026-09-11

- [NEW] Pull Requests board stored locally, lookout mine CLI
- [ENHANCED] Closed vs merged, bots no longer move cards
- [FIX] Old merges stay off the board

## v0.2.2 — 2026-09-10

- [ENHANCED] More tools allowed in actions (pnpm, npx, lookout)
- [FIX] Homebrew install cleanup

## v0.2.1 — 2026-09-09

- [NEW] App icon
- [FIX] Readable error on an unsupported Node

## v0.2.0 — 2026-09-04

- [NEW] Lookout CLI to move review cards from a terminal
- [FIX] macOS quarantine flag cleared on install

## v0.1.6 — 2026-09-02

- [NEW] Homebrew cask
- [NEW] Notification center drives badges and highlights
- [ENHANCED] Columns derived from the PR, project and author filters

## v0.1.5 — 2026-08-26

- [NEW] Discovery board in columns per repo

## v0.1.4 — 2026-08-24

- [ENHANCED] Titlebar merged into the app header

## v0.1.3 — 2026-08-21

- [ENHANCED] Navigation toolbar in PR windows, drafts sort last

## v0.1.2 — 2026-08-18

- [FIX] Release builds find your shell's tools

## v0.1.1 — 2026-07-30

- [NEW] Review board: dispatch, resume and reply to Claude review sessions
- [NEW] Pull Requests board with side panel, chat history and reports
- [NEW] Configurable action buttons, commands and filters
- [NEW] Notifications, snooze, tray icon and autostart
