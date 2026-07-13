# Review Deck

Desktop overview of all your Claude Code review sessions: discover open PRs across hand-picked repos, dispatch `/do-review` / `/do-followup`, track follow-ups, auto-clear merged PRs.

Tauri v2 + React + TypeScript + Tailwind. No server — the app polls `gh`, scans `~/.claude/projects/` sessions and each repo's `AI_TASKS/code-review/` exports.

## Dev

```bash
npm install
npm run tauri dev
```

Requirements: Rust toolchain, `gh` (authenticated), `claude` CLI.

## Usage

1. **Settings** — add local clone paths; `owner/repo` is detected from each clone's git origin. Your GitHub login is auto-detected; your own PRs are never listed.
2. **Discovery** — new open PRs land here. **Review** (add to board + dispatch `/do-review`), **Watch** (add to board), **Ignore** (hide forever). PRs you already reviewed or commented on skip Discovery.
3. **Board** — Watching / Needs Review / In Review / Reviewed / Follow-up / Done. Drag cards to triage or prioritize. Merged or closed PRs auto-move to Done and drop off after 24 h.
4. **PR panel** — click a card: chat-style history (sessions, reports, commits, reviews), dispatch buttons, stage selector, one-click approve when follow-up is all green, resume sessions in Ghostty.

## Font

Bundles [Leckerli One](https://fonts.google.com/specimen/Leckerli+One) (SIL Open Font License 1.1).
