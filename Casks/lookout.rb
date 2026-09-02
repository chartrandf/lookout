cask "lookout" do
  version "0.1.5"
  sha256 "bb4a28c84b7ed27eaa6a0389384cf80efebc1bd5e9823477d382e744f473656a"

  url "https://github.com/chartrandf/lookout/releases/download/v#{version}/Lookout_#{version}_universal.dmg",
      verified: "github.com/chartrandf/lookout/"
  name "Lookout"
  desc "Desktop overview of your Claude Code review sessions"
  homepage "https://github.com/chartrandf/lookout"

  # The build is ad-hoc signed, not notarized: install with --no-quarantine to skip Gatekeeper's
  # first-launch block (otherwise: System Settings > Privacy & Security > Open Anyway).
  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :catalina

  app "Lookout.app"

  zap trash: [
    "~/Library/Application Support/com.francischartrand.lookout",
    "~/Library/Caches/com.francischartrand.lookout",
    "~/Library/HTTPStorages/com.francischartrand.lookout",
    "~/Library/Preferences/com.francischartrand.lookout.plist",
    "~/Library/Saved Application State/com.francischartrand.lookout.savedState",
    "~/Library/WebKit/com.francischartrand.lookout",
  ]
end
