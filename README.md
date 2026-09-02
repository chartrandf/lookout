# Lookout

**Your GitHub lookout.**

> ⚠️ **Opinionated.** This app encodes the author's personal review flow (discover → dispatch a Claude review → push comments → follow up → approve) and has only been tested against their personal Claude Code slash commands — it may not fit yours out of the box. Configure the dispatched prompts in **Settings → Claude commands** (defaults use Claude Code's built-in `/review`; placeholders `<branch_name>` and `<pr_id>` are supported).

Desktop overview of all your Claude Code review sessions: discover open PRs across hand-picked repos, dispatch review/follow-up sessions, track follow-ups, auto-clear merged PRs.

Tauri v2 + React + TypeScript + Tailwind. No server — the app polls `gh`, scans `~/.claude/projects/` sessions and each repo's `AI_TASKS/code-review/` exports.

## Install

### Homebrew (no Gatekeeper prompt)

This repo doubles as its own Homebrew tap:

```bash
brew tap chartrandf/lookout https://github.com/chartrandf/lookout
brew trust --cask chartrandf/lookout/lookout   # Homebrew 6+ gates third-party casks
brew install --cask lookout                    # --force to replace a hand-installed copy
```

No Gatekeeper prompt: the cask's `postflight` clears `com.apple.quarantine` from the installed app.
The flag rides along on the downloaded `.dmg` and propagates to everything copied out of it, so
without that step the first launch is blocked. Trusting the cask is what authorises it to run —
`brew trust` exists for exactly this, so read the cask before trusting it (it's 30 lines).

`brew update && brew upgrade --cask lookout` picks up later releases (the cask is bumped by the
release workflow — `brew update` is what pulls it), and `brew uninstall --cask --zap lookout`
removes the app plus its stored data.

`--no-quarantine` no longer exists: Homebrew [dropped its quarantine machinery][brew-quarantine] in
July 2026, which is why the cask has to do it.

[brew-quarantine]: https://github.com/Homebrew/brew/commit/594fcc12ce

### Manual

Grab the latest `.dmg` from [Releases](https://github.com/chartrandf/lookout/releases) (universal — Apple Silicon + Intel) and drag **Lookout** to Applications.

The bundle is ad-hoc signed (`signingIdentity: "-"`, so its signature verifies with
`codesign --verify --deep --strict`) but it carries no Developer ID and isn't notarized, so
Gatekeeper still rejects it (`spctl -a` → rejected). Nothing to do in Terminal:

1. Double-click **Lookout** — the launch is blocked.
2. **System Settings → Privacy & Security → Open Anyway**.

That's a one-time click. (Right-click → Open no longer bypasses Gatekeeper on macOS 15+.) If you'd
rather clear the quarantine flag yourself:

```bash
xattr -dr com.apple.quarantine /Applications/Lookout.app
```

A signature alone can't remove that prompt — only a paid Apple Developer ID plus notarization can.

## Dev

```bash
npm install
npm run tauri dev
```

Requirements: Rust toolchain, `gh` (authenticated), `claude` CLI.

## Usage

1. **Settings** — add local clone paths; `owner/repo` is detected from each clone's git origin. Your GitHub login is auto-detected; your own PRs are never listed.
2. **Discovery** — new open PRs land here. **Review** (add to board + dispatch `/do-review`), **Watch** (add to board), **Ignore** (hide forever). PRs you already reviewed or commented on skip Discovery.
3. **Reviews** — Watching / Needs Review / Reviewed / Follow-up / Done. Drag cards to triage or prioritize. Merged or closed PRs auto-move to Done and drop off after 24 h.
4. **PR panel** — click a card: chat-style history (sessions, reports, commits, reviews), dispatch buttons, stage selector, one-click approve when follow-up is all green, resume sessions in Ghostty.

## Font

Bundles [Leckerli One](https://fonts.google.com/specimen/Leckerli+One) (SIL Open Font License 1.1).

## License

[MIT](LICENSE)
