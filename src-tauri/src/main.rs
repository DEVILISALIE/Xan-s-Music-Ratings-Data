// 生产构建时隐藏控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use std::fs;
use base64::Engine;

const MAX_COVER_BYTES: u64 = 20 * 1024 * 1024;
const COVER_THUMBNAIL_SIZE: u32 = 256;

// 向前端发送菜单动作事件
fn emit_menu_action(app: &AppHandle, action: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("menu-action", action);
    }
}

// 获取主窗口
fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("tray_show", "显示窗口").build(app)?;
    let topmost_item = MenuItemBuilder::with_id("tray_topmost", "置顶切换").build(app)?;
    let theme_item = MenuItemBuilder::with_id("tray_theme", "切换主题").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("tray_quit", "退出").build(app)?;

    let tray_menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&topmost_item)
        .item(&theme_item)
        .item(&separator)
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&tray_menu)
        .tooltip("Xan's Music Ratings")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "tray_show" => {
                if let Some(win) = get_main_window(app) {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "tray_topmost" => {
                if let Some(win) = get_main_window(app) {
                    let is_top = win.is_always_on_top().unwrap_or(false);
                    let _ = win.set_always_on_top(!is_top);
                }
            }
            "tray_theme" => emit_menu_action(app, "toggle-theme"),
            "tray_quit" => {
                // 通知前端保存数据后再退出（避免 app.exit(0) 直接终止导致数据丢失）
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("request-shutdown", ());
                }
                // 5秒后强制退出（防止前端无响应时卡死）
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    std::process::exit(0);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = get_main_window(app) {
                    if !win.is_visible().unwrap_or(false) {
                        let _ = win.show();
                        let _ = win.set_focus();
                    } else {
                        let _ = win.hide();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ===== 窗口管理命令 =====

#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn toggle_topmost(app: AppHandle) {
    if let Some(win) = get_main_window(&app) {
        let is_top = win.is_always_on_top().unwrap_or(false);
        let _ = win.set_always_on_top(!is_top);
    }
}

#[tauri::command]
fn toggle_fullscreen(app: AppHandle) {
    if let Some(win) = get_main_window(&app) {
        let is_fs = win.is_fullscreen().unwrap_or(false);
        if !is_fs {
            // 进入全屏前先取消最大化，避免 WebView2 bug
            let _ = win.unmaximize();
        }
        let _ = win.set_fullscreen(!is_fs);
    }
}

#[tauri::command]
fn minimize_window(app: AppHandle) {
    if let Some(win) = get_main_window(&app) {
        let _ = win.minimize();
    }
}

#[tauri::command]
fn toggle_maximize(app: AppHandle) {
    if let Some(win) = get_main_window(&app) {
        let is_max = win.is_maximized().unwrap_or(false);
        if is_max {
            let _ = win.unmaximize();
        } else {
            let _ = win.maximize();
        }
    }
}

#[tauri::command]
fn close_window(app: AppHandle) {
    if let Some(win) = get_main_window(&app) {
        let _ = win.hide();
        let _ = write_log(app, format!("[Rust] close_window: hidden={}", !win.is_visible().unwrap_or(false)));
    }
}

#[tauri::command]
fn start_window_drag(app: AppHandle) {
    if let Some(win) = get_main_window(&app) {
        let _ = win.start_dragging();
    }
}

#[tauri::command]
fn is_window_maximized(app: AppHandle) -> bool {
    if let Some(win) = get_main_window(&app) {
        return win.is_maximized().unwrap_or(false);
    }
    false
}

#[tauri::command]
fn is_window_fullscreen(app: AppHandle) -> bool {
    if let Some(win) = get_main_window(&app) {
        return win.is_fullscreen().unwrap_or(false);
    }
    false
}

// ===== 数据持久化 =====

// 获取主文件和备份文件路径
fn data_file_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join("music-data.json"))
}

fn data_backup_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join("music-data.json.bak"))
}

#[tauri::command]
fn save_data_to_disk(app: AppHandle, data: String) -> Result<(), String> {
    // 防护：不允许写入空数据
    if data.len() < 200 {
        let _ = write_log(app.clone(), format!("[Rust] 拒绝写入: 数据过小({}字节)", data.len()));
        return Ok(());
    }
    // 验证 JSON 结构
    match serde_json::from_str::<serde_json::Value>(&data) {
        Ok(parsed) => {
            if let Some(sections) = parsed.get("sections") {
                if let Some(arr) = sections.as_array() {
                    if arr.is_empty() {
                        let _ = write_log(app.clone(), "[Rust] 拒绝写入: sections 为空".to_string());
                        return Ok(());
                    }
                }
            }
        }
        Err(e) => {
            let _ = write_log(app.clone(), format!("[Rust] 拒绝写入: JSON 解析失败({})", e));
            return Err(format!("JSON 解析失败: {}", e));
        }
    }
    let path = data_file_path(&app).ok_or("无法获取数据目录")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // 写入前：如果主文件存在且有效，先备份
    if path.exists() {
        if let Ok(meta) = fs::metadata(&path) {
            if meta.len() > 200 {
                if let Some(bak_path) = data_backup_path(&app) {
                    let _ = fs::copy(&path, &bak_path);
                    let _ = write_log(app.clone(), format!("[Rust] 已备份到 .bak ({}字节)", meta.len()));
                }
            }
        }
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

// 读取 JSON 文件，返回 (内容, 文件路径描述)
fn read_json_file(path: &std::path::PathBuf) -> Option<(String, String)> {
    if !path.exists() {
        return None;
    }
    match fs::read_to_string(path) {
        Ok(content) => {
            if content.len() < 50 {
                return None; // 文件太小，可能是损坏的
            }
            Some((content, format!("{:?}", path)))
        }
        Err(_) => None
    }
}

#[tauri::command]
fn load_data_from_disk(app: AppHandle) -> Result<String, String> {
    let path = data_file_path(&app).ok_or("无法获取数据目录")?;
    let log_msg = format!("读取路径: {:?} 存在: {} ", path, path.exists());
    if let Ok(meta) = fs::metadata(&path) {
        let _ = write_log(app.clone(), format!("{}大小: {} 字节", log_msg, meta.len()));
    } else {
        let _ = write_log(app.clone(), log_msg);
    }

    // 尝试读取主文件
    let result = read_json_file(&path);

    match result {
        Some((content, src)) => {
            let _ = write_log(app.clone(), format!("[Rust] 从 {} 读取成功 ({}字节)", src, content.len()));
            Ok(content)
        }
        None => {
            // 主文件不存在或损坏，尝试备份文件
            let bak_path = data_backup_path(&app).ok_or("无法获取数据目录")?;
            let _ = write_log(app.clone(), format!("[Rust] 主文件不可用，尝试 .bak: {:?}", bak_path));
            match read_json_file(&bak_path) {
                Some((content, src)) => {
                    let _ = write_log(app.clone(), format!("[Rust] 从 {} 恢复成功 ({}字节)", src, content.len()));
                    Ok(content)
                }
                None => {
                    let _ = write_log(app.clone(), "[Rust] 主文件和 .bak 均不可用".to_string());
                    Ok(String::new())
                }
            }
        }
    }
}

// 检查磁盘上是否有数据文件（供 JS 用于判断是否需要加载）
#[tauri::command]
fn check_disk_data(app: AppHandle) -> Result<bool, String> {
    let path = data_file_path(&app).ok_or("无法获取数据目录")?;
    if path.exists() {
        if let Ok(meta) = fs::metadata(&path) {
            return Ok(meta.len() > 200);
        }
    }
    // 也检查备份
    let bak_path = data_backup_path(&app).ok_or("无法获取数据目录")?;
    if bak_path.exists() {
        if let Ok(meta) = fs::metadata(&bak_path) {
            return Ok(meta.len() > 200);
        }
    }
    Ok(false)
}

// 返回磁盘数据文件大小（字节），用于写入后校验
#[tauri::command]
fn get_data_file_size(app: AppHandle) -> Result<u64, String> {
    let path = data_file_path(&app).ok_or("无法获取数据目录")?;
    if path.exists() {
        fs::metadata(&path).map(|m| m.len()).map_err(|e| e.to_string())
    } else {
        Ok(0)
    }
}

#[tauri::command]
fn write_log(app: AppHandle, msg: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let log_path = dir.join("debug-aoty.log");
    use std::io::Write;
    let mut file = fs::OpenOptions::new().create(true).append(true).open(&log_path).map_err(|e| e.to_string())?;
    writeln!(file, "{}", msg).map_err(|e| e.to_string())
}

// 前端保存完成后调用，延迟退出确保 IPC 响应送达
#[tauri::command]
fn graceful_exit() {
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        std::process::exit(0);
    });
}

// ===== 封面管理 =====

fn covers_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join("covers"))
}

fn cover_thumbnails_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    covers_dir(app).map(|p| p.join(".thumbnails"))
}

fn validate_entry_id(entry_id: &str) -> Result<(), String> {
    if entry_id.is_empty()
        || entry_id.contains('/')
        || entry_id.contains('\\')
        || entry_id == "."
        || entry_id == ".."
    {
        return Err("无效的条目 ID".into());
    }
    Ok(())
}

fn find_cover_file(dir: &std::path::Path, entry_id: &str) -> Option<std::path::PathBuf> {
    fs::read_dir(dir).ok()?.flatten().find_map(|entry| {
        let path = entry.path();
        if !path.is_file() {
            return None;
        }
        let matches = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(|stem| stem == entry_id)
            .unwrap_or(false);
        matches.then_some(path)
    })
}

fn thumbnail_path(app: &AppHandle, entry_id: &str) -> Result<std::path::PathBuf, String> {
    let dir = cover_thumbnails_dir(app).ok_or("无法获取封面缩略图目录")?;
    Ok(dir.join(format!("{}.png", entry_id)))
}

fn create_cover_thumbnail(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    let image = image::ImageReader::open(source)
        .map_err(|e| format!("无法打开封面: {}", e))?
        .with_guessed_format()
        .map_err(|e| format!("无法识别封面格式: {}", e))?
        .decode()
        .map_err(|e| format!("无法解码封面: {}", e))?;
    let thumbnail = image.thumbnail(COVER_THUMBNAIL_SIZE, COVER_THUMBNAIL_SIZE);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temporary = destination.with_extension("png.tmp");
    let _ = fs::remove_file(&temporary);
    if let Err(error) = thumbnail.save_with_format(&temporary, image::ImageFormat::Png) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("无法保存封面缩略图: {}", error));
    }
    let _ = fs::remove_file(destination);
    fs::rename(&temporary, destination).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("无法替换封面缩略图: {}", error)
    })
}

fn original_cover_data_url(path: &std::path::Path) -> Result<String, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_COVER_BYTES {
        return Err("封面文件过大".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpeg")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "image/jpeg",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn upload_cover(app: AppHandle, entry_id: String, source_path: String) -> Result<String, String> {
    validate_entry_id(&entry_id)?;
    let dir = covers_dir(&app).ok_or("无法获取数据目录")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err("源文件不存在".into());
    }
    // 限制文件大小 20MB
    if let Ok(meta) = fs::metadata(src) {
        if meta.len() > MAX_COVER_BYTES {
            return Err("图片文件过大（最大 20MB）".into());
        }
    }
    let ext = src.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    let filename = format!("{}.{}", entry_id, ext);
    let dest = dir.join(&filename);

    // 清除该 entry 的旧封面（不同扩展名）
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let same_entry = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .map(|stem| stem == entry_id)
                .unwrap_or(false);
            if same_entry && path.file_name().and_then(|name| name.to_str()) != Some(&filename) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    fs::copy(src, &dest).map_err(|e| e.to_string())?;
    let thumb_path = thumbnail_path(&app, &entry_id)?;
    let _ = fs::remove_file(&thumb_path);
    // 极少数系统不支持的格式仍保留原图，读取卡片时会回退到原图。
    let _ = create_cover_thumbnail(&dest, &thumb_path);
    Ok(filename)
}

#[tauri::command]
fn remove_cover(app: AppHandle, entry_id: String) -> Result<(), String> {
    validate_entry_id(&entry_id)?;
    let dir = match covers_dir(&app) {
        Some(d) => d,
        None => return Ok(()),
    };
    if !dir.exists() { return Ok(()); }
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let same_entry = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .map(|stem| stem == entry_id)
                .unwrap_or(false);
            if same_entry {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    if let Ok(path) = thumbnail_path(&app, &entry_id) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
fn read_cover_thumbnail(app: AppHandle, entry_id: String) -> Result<String, String> {
    validate_entry_id(&entry_id)?;
    let dir = covers_dir(&app).ok_or("无法获取数据目录")?;
    if !dir.exists() {
        return Err("covers 目录不存在".into());
    }
    let source = find_cover_file(&dir, &entry_id).ok_or("封面文件不存在")?;
    let thumb_path = thumbnail_path(&app, &entry_id)?;
    if !thumb_path.exists() {
        if create_cover_thumbnail(&source, &thumb_path).is_err() {
            return original_cover_data_url(&source);
        }
    }
    let bytes = fs::read(&thumb_path).map_err(|e| e.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("封面缩略图过大".into());
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
fn read_cover(app: AppHandle, entry_id: String) -> Result<String, String> {
    validate_entry_id(&entry_id)?;
    let dir = covers_dir(&app).ok_or("无法获取数据目录")?;
    if !dir.exists() { return Err("covers 目录不存在".into()); }
    let path = find_cover_file(&dir, &entry_id).ok_or("封面文件不存在")?;
    original_cover_data_url(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;

    fn test_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "music-ratings-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn creates_bounded_png_thumbnail_from_jpeg() {
        let dir = test_dir("thumbnail");
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("cover.jpg");
        let destination = dir.join("cover.png");
        let image = image::RgbImage::from_pixel(1024, 768, image::Rgb([32, 96, 160]));
        image.save_with_format(&source, image::ImageFormat::Jpeg).unwrap();

        create_cover_thumbnail(&source, &destination).unwrap();

        let thumbnail = image::open(&destination).unwrap();
        let (width, height) = thumbnail.dimensions();
        assert!(width <= COVER_THUMBNAIL_SIZE);
        assert!(height <= COVER_THUMBNAIL_SIZE);
        assert!(width > 0 && height > 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn finds_only_the_exact_entry_cover() {
        let dir = test_dir("lookup");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a10.jpg"), b"a10").unwrap();
        fs::write(dir.join("a1.png"), b"a1").unwrap();

        let found = find_cover_file(&dir, "a1").unwrap();
        assert_eq!(found.file_name().unwrap(), "a1.png");
        let _ = fs::remove_dir_all(dir);
    }
}

fn main() {
    // 全局禁用 WebView2 / Chromium 的自动填充与“保存的信息”浏览器提示
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=AutofillServerCommunication,AutofillShowTypePredictions,AutofillAddressProfile,AutofillCreditCard,AutofillPasswordGeneration,Autofill --disable-save-password-bubble --disable-single-click-autofill --no-pings",
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 第二次启动时，显示并聚焦已有窗口
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .setup(|app| {
            // 系统托盘
            setup_tray(app.handle()).expect("无法设置系统托盘");

            // F11 全局快捷键：全屏切换（仅在松开按键时触发，避免按下+松开触发两次）
            let app_handle = app.handle().clone();
            let _ = app.global_shortcut().on_shortcut("F11", move |_app, _shortcut, event| {
                if event.state == ShortcutState::Released {
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let is_fs = win.is_fullscreen().unwrap_or(false);
                        let _ = win.set_fullscreen(!is_fs);
                    }
                }
            });

            // 确保主窗口在任务栏显示
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();

                // 点击 X 只最小化窗口，不退出应用
                let app_handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version, toggle_topmost, toggle_fullscreen,
            minimize_window, toggle_maximize, close_window, start_window_drag,
            is_window_maximized, is_window_fullscreen,
            save_data_to_disk, load_data_from_disk, check_disk_data, get_data_file_size, write_log,
            graceful_exit,
            upload_cover, remove_cover, read_cover_thumbnail, read_cover
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
