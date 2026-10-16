<details>
<summary><b>Install on macOS</b></summary>

Universal build (Apple Silicon + Intel), macOS 11+.

**Homebrew** (recommended — no Gatekeeper prompt, puts `lookout` CLI on PATH):

```bash
brew tap chartrandf/lookout https://github.com/chartrandf/lookout
brew trust --cask chartrandf/lookout/lookout
brew install --cask lookout
```

All three lines, in order. Upgrade later with `brew upgrade --cask lookout`.

**Manual** (`.dmg`) — the app is ad-hoc signed but **not notarized**:

1. Download `Lookout_*_universal.dmg` below, open it, drag **Lookout** to Applications.
2. Double-click it — the launch is blocked.
3. **System Settings → Privacy & Security → Open Anyway** (one-time).

Or from Terminal: `xattr -dr com.apple.quarantine /Applications/Lookout.app`.

</details>

<details>
<summary><b>Install on Linux</b></summary>

x86_64 only. Needs webkit2gtk-4.1 (Ubuntu 22.04+, Debian 12+).

**Debian / Ubuntu** (`.deb`):

```bash
sudo apt install ./Lookout_*_amd64.deb
```

**Other distros** (`.AppImage`):

```bash
chmod +x Lookout_*_amd64.AppImage
./Lookout_*_amd64.AppImage
```

</details>
