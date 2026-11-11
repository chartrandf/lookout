fn main() {
    // prnav: PR window toolbar <-> page messaging (pr_window.rs); a plugin so remote pages can be
    // granted its commands without putting every app command behind an ACL
    tauri_build::try_build(tauri_build::Attributes::new().plugin(
        "prnav",
        tauri_build::InlinedPlugin::new().commands(&["report", "nav"]),
    ))
    .expect("failed to run tauri build script");
}
