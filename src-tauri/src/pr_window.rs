// PR browser windows: two webviews in one window. The toolbar (back/forward/reload + URL bar) is a
// local page in the window's own webview; the remote page is a child webview below the bar.
// Injecting the toolbar into the page used to overlap any sticky/fixed `top: 0` header (Jenkins,
// …), since the page's viewport still started under it.
//
// The two talk through the `prnav` plugin: the page reports its URL and history position
// (`report`), the toolbar asks the page to move (`nav`).

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{LogicalPosition, LogicalSize, Manager, Runtime, Webview, WebviewUrl, WindowEvent};

const BAR_H: f64 = 46.0;

fn page_label(window_label: &str) -> String {
    format!("{window_label}-page")
}

// Open (or focus) a PR browser window. The window's own webview is the toolbar (label = window
// label); the page is a child webview `<label>-page` laid over it below the bar.
#[tauri::command]
pub async fn open_pr_window(
    app: tauri::AppHandle,
    label: String,
    url: String,
    title: String,
) -> Result<(), String> {
    if let Some(existing) = app.get_window(&label) {
        return existing.set_focus().map_err(|e| e.to_string());
    }
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    #[allow(unused_mut)]
    let mut builder =
        tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("pr-toolbar.html".into()))
            .title(&title)
            .inner_size(1280.0, 900.0)
            .background_color(tauri::window::Color(0xec, 0xec, 0xec, 0xff));
    // macOS glass titlebar looks broken over remote pages; overlay = traffic lights only,
    // repositioned so they center vertically in the 46px toolbar
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            // y is not a top inset: the effective light center lands at (y + button_height)/2;
            // 25.5 tuned by eye to center the lights in the 46px toolbar
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 25.5));
    }
    let window = builder
        .build()
        .map_err(|e| e.to_string())?
        .as_ref()
        .window();

    let size = window.inner_size().map_err(|e| e.to_string())?;
    let size = size.to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
    let page = window
        .add_child(
            tauri::webview::WebviewBuilder::new(page_label(&label), WebviewUrl::External(parsed))
                .initialization_script(include_str!("browser-page.js")),
            LogicalPosition::new(0.0, BAR_H),
            LogicalSize::new(size.width, (size.height - BAR_H).max(0.0)),
        )
        .map_err(|e| e.to_string())?;

    // the toolbar webview fills the window on its own; the child page has to be resized by hand
    let win = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Resized(size) = event {
            let Ok(scale) = win.scale_factor() else {
                return;
            };
            let size = size.to_logical::<f64>(scale);
            let _ = page.set_size(LogicalSize::new(size.width, (size.height - BAR_H).max(0.0)));
        }
    });
    Ok(())
}

// Page → toolbar: the page's current URL and whether back/forward can move.
#[tauri::command]
fn report<R: Runtime>(
    webview: Webview<R>,
    url: String,
    back: bool,
    forward: bool,
) -> Result<(), String> {
    let window_label = webview.window().label().to_string();
    if webview.label() != page_label(&window_label) {
        return Err("not a PR page".into());
    }
    let bar = webview
        .app_handle()
        .get_webview(&window_label)
        .ok_or("no toolbar")?;
    let state = serde_json::json!({ "url": url, "back": back, "forward": forward });
    bar.eval(format!("window.__lookoutState?.({state})"))
        .map_err(|e| e.to_string())
}

// Toolbar → page: back/forward/find go through the page script (it tracks the history position),
// reload and URL entry act on the webview directly so they work even on a page the script missed.
#[tauri::command]
fn nav<R: Runtime>(webview: Webview<R>, action: String, url: Option<String>) -> Result<(), String> {
    let window_label = webview.window().label().to_string();
    if webview.label() != window_label {
        return Err("not a PR toolbar".into());
    }
    let page = webview
        .app_handle()
        .get_webview(&page_label(&window_label))
        .ok_or("no page")?;
    match action.as_str() {
        "go" => {
            let url = tauri::Url::parse(&url.ok_or("missing url")?).map_err(|e| e.to_string())?;
            if !matches!(url.scheme(), "http" | "https") {
                return Err(format!("unsupported scheme: {}", url.scheme()));
            }
            page.navigate(url).map_err(|e| e.to_string())
        }
        "reload" => page.reload().map_err(|e| e.to_string()),
        "find" => {
            page.set_focus().map_err(|e| e.to_string())?;
            page.eval("window.__lookoutNav?.('find')")
                .map_err(|e| e.to_string())
        }
        "back" | "forward" | "sync" => page
            .eval(format!("window.__lookoutNav?.('{action}')"))
            .map_err(|e| e.to_string()),
        _ => Err(format!("unknown action: {action}")),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("prnav")
        .invoke_handler(tauri::generate_handler![report, nav])
        .build()
}
