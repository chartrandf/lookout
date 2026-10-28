# AGENTS.md

This file provides guidance to AI coding agents working in this repository.

## Project Overview

Lookout is a Tauri app (Rust + TypeScript/React) for tracking GitHub PRs, cards, and sessions. It has:
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend/Desktop: Tauri (Rust) in `src-tauri/`
- CLI: `lookout` CLI built via `vite build --config vite.cli.config.ts` → `dist-cli/lookout.mjs`

## Development

### Prerequisites
- Node.js/pnpm (see `packageManager` in package.json)
- Rust toolchain for Tauri builds
- GitHub CLI (`gh`) for releases

### Common commands
```bash
pnpm install
pnpm dev                # Vite dev server
pnpm build              # Build frontend
pnpm build:cli          # Build CLI
pnpm test               # Run tests (vitest)
pnpm tauri dev          # Run Tauri app in dev
pnpm tauri build        # Build Tauri app
```

### Running the app
```bash
pnpm tauri dev
```

The CLI binary is exposed as `lookout` (see `bin` in package.json). After building: `pnpm build:cli`.

## Release Instructions

**Always use the release script.** Do not manually bump versions/tags in ad-hoc ways.

### Prerequisites
- On branch `main`, working tree clean
- Local `main` in sync with `origin/main` (script does fetch/check)
- `gh` CLI authenticated (for creating GitHub release)
- If using AI summary for changelog, agent configured in app settings (Claude/OpenCode) — script will try to summarize commits since last tag

### Release command
```bash
pnpm release <patch|minor|major>
```

The script (`scripts/release.mjs`) will:
1. Compute next version from `package.json` via `scripts/changelog.mjs:bumpVersion`
2. Validate: on `main`, clean tree, up to date with `origin/main`, tag doesn't exist
3. Collect commits since last tag (`git log ${prev}..HEAD --no-merges --format=%s`)
4. Generate changelog entry in `CHANGELOG.md` (AI summary if possible, else per-commit lines)
5. Prompt to edit `CHANGELOG.md` if running in a TTY (can abort with Ctrl-C)
6. Run `npm version <version> --no-git-tag-version` and `node scripts/sync-version.mjs` to sync versions across:
   - `package.json`, `package-lock.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
   - `Casks/lookout.rb`
7. Commit all changed files as `chore: release vX.Y.Z`
8. Create annotated tag `vX.Y.Z`
9. Push with `--atomic origin HEAD:main <tag>`
10. Create GitHub release via `gh release create` with notes from `CHANGELOG.md` + `/.github/release-install.md`; this triggers `.github/workflows/release.yml`

### Notes
- The build/publish is handled by GitHub Actions on release publication.
- If the script fails due to "main is not in sync", fetch/merge/rebase `origin/main` first.
- Version bumps should go through `pnpm release` to keep all version files in sync.

## Code Style
- TypeScript/React, Tailwind CSS
- Follow existing patterns in codebase
- Biome is configured (`@biomejs/biome` in devDependencies)
