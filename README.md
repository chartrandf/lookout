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

1. **Settings** — add watched repos (`owner/repo` + local clone path). Your GitHub login is auto-detected; your own PRs are never listed.
2. **Discovery** — new open PRs land here. **Watch** (add to board), **Ignore** (hide forever), **Review** (add + dispatch review — Phase 2).
3. **Board** — Watching / Needs Review / In Review / Reviewed / Follow-up / Done. Merged or closed PRs auto-move to Done and drop off after 24 h.

Plan: `AI_TASKS/2026-07-13-review-overview-app-plan.md`
