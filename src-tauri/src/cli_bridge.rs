// A local socket the `lookout` CLI pings after it writes to the database, so the UI repaints now
// instead of at its next sync. The event carries no state — only "these cards changed, go read" —
// which is what lets every failure here be silent: the write already landed, and the app catches up
// on its next sync regardless.
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

const SOCK: &str = "cli.sock";
const POINTER: &str = "cli.sock.path";
// macOS caps sun_path at 104 bytes, Linux at 108. Stay clear of it.
const SUN_PATH_MAX: usize = 100;

// The app picks the socket location and publishes it in `cli.sock.path` next to the database, so the
// CLI reads one file instead of re-deriving platform rules that would drift.
fn socket_path(config_dir: &Path) -> PathBuf {
    if let Ok(explicit) = std::env::var("LOOKOUT_SOCK") {
        return PathBuf::from(explicit);
    }
    // Linux: $XDG_RUNTIME_DIR is short, per-user and cleared at logout, which disposes of stale
    // sockets for free.
    if let Ok(runtime) = std::env::var("XDG_RUNTIME_DIR") {
        if !runtime.is_empty() {
            return PathBuf::from(runtime).join("lookout").join(SOCK);
        }
    }
    let beside_db = config_dir.join(SOCK);
    if beside_db.as_os_str().len() <= SUN_PATH_MAX {
        return beside_db;
    }
    // a long home directory would overflow sun_path
    std::env::temp_dir().join(format!("lookout-{}.sock", std::process::id()))
}

fn pointer_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(POINTER))
}

async fn serve<R: Runtime>(app: AppHandle<R>, stream: UnixStream) {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    // one request per connection: a single JSON line
    if reader.read_line(&mut line).await.is_err() {
        return;
    }
    let ok = match serde_json::from_str::<serde_json::Value>(&line) {
        Ok(event) if event.get("kind").and_then(|k| k.as_str()) == Some("cards.changed") => {
            let _ = app.emit("cards:changed", event);
            true
        }
        _ => false,
    };
    let _ = reader
        .into_inner()
        .write_all(format!("{{\"ok\":{ok}}}\n").as_bytes())
        .await;
}

/// Bind the socket and publish its path. Failure is not fatal: the app runs fine without the
/// bridge, the CLI just stays invisible until the next sync.
///
/// Everything happens inside the spawned task on purpose — `UnixListener::bind` needs a Tokio
/// reactor, and Tauri's `setup` hook runs on the main thread outside it.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return;
    };
    let pointer = pointer_path(app);
    let handle = app.clone();

    tauri::async_runtime::spawn(async move {
        if fs::create_dir_all(&config_dir).is_err() {
            return;
        }
        let sock = socket_path(&config_dir);
        if let Some(parent) = sock.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::remove_file(&sock); // a socket left behind by a crash would block the bind

        let listener = match UnixListener::bind(&sock) {
            Ok(l) => l,
            Err(e) => {
                log::warn!("cli bridge: cannot listen on {}: {e}", sock.display());
                return;
            }
        };
        if let Some(pointer) = pointer {
            let _ = fs::write(pointer, sock.to_string_lossy().as_bytes());
        }
        log::info!("cli bridge: listening on {}", sock.display());

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tauri::async_runtime::spawn(serve(handle.clone(), stream));
                }
                Err(e) => {
                    log::warn!("cli bridge: accept failed: {e}");
                    return;
                }
            }
        }
    });
}

/// Best-effort cleanup on exit. The CLI tolerates a stale pointer (connect simply fails), so this
/// is tidiness, not correctness.
pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let _ = fs::remove_file(socket_path(&config_dir));
    }
    if let Some(pointer) = pointer_path(app) {
        let _ = fs::remove_file(pointer);
    }
}
