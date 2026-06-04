// 生产构建时隐藏控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow,
};

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

fn build_menu(app: &AppHandle) -> tauri::menu::Menu<tauri::Wry> {
    // 文件菜单
    let import_json = MenuItemBuilder::with_id("import_json", "导入 JSON")
        .accelerator("CmdOrCtrl+O")
        .build(app)
        .unwrap();
    let export_json = MenuItemBuilder::with_id("export_json", "导出 JSON")
        .accelerator("CmdOrCtrl+S")
        .build(app)
        .unwrap();
    let separator1 = tauri::menu::PredefinedMenuItem::separator(app).unwrap();
    let quit = MenuItemBuilder::with_id("quit", "退出")
        .accelerator("Alt+F4")
        .build(app)
        .unwrap();
    let file_menu = SubmenuBuilder::new(app, "文件(&F)")
        .item(&import_json)
        .item(&export_json)
        .item(&separator1)
        .item(&quit)
        .build()
        .unwrap();

    // 视图菜单
    let toggle_theme = MenuItemBuilder::with_id("toggle_theme", "切换主题")
        .accelerator("CmdOrCtrl+D")
        .build(app)
        .unwrap();
    let toggle_style = MenuItemBuilder::with_id("toggle_style", "切换风格")
        .accelerator("CmdOrCtrl+G")
        .build(app)
        .unwrap();
    let separator2 = tauri::menu::PredefinedMenuItem::separator(app).unwrap();
    let toggle_topmost = MenuItemBuilder::with_id("toggle_topmost", "切换置顶")
        .accelerator("CmdOrCtrl+T")
        .build(app)
        .unwrap();
    let fullscreen = MenuItemBuilder::with_id("fullscreen", "全屏")
        .accelerator("F11")
        .build(app)
        .unwrap();
    let new_album = MenuItemBuilder::with_id("new_album", "新建专辑")
        .accelerator("CmdOrCtrl+N")
        .build(app)
        .unwrap();
    let focus_search = MenuItemBuilder::with_id("focus_search", "聚焦搜索")
        .accelerator("CmdOrCtrl+K")
        .build(app)
        .unwrap();
    let view_menu = SubmenuBuilder::new(app, "视图(&V)")
        .item(&toggle_theme)
        .item(&toggle_style)
        .item(&separator2)
        .item(&new_album)
        .item(&focus_search)
        .item(&separator2)
        .item(&toggle_topmost)
        .item(&fullscreen)
        .build()
        .unwrap();

    // 帮助菜单
    let about = MenuItemBuilder::with_id("about", "关于").build(app).unwrap();
    let help_menu = SubmenuBuilder::new(app, "帮助(&H)")
        .item(&about)
        .build()
        .unwrap();

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&view_menu)
        .item(&help_menu)
        .build()
        .unwrap()
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "import_json" => emit_menu_action(app, "import"),
        "export_json" => emit_menu_action(app, "export"),
        "toggle_theme" => emit_menu_action(app, "toggle-theme"),
        "toggle_style" => emit_menu_action(app, "toggle-style"),
        "new_album" => emit_menu_action(app, "new-album"),
        "focus_search" => emit_menu_action(app, "focus-search"),
        "toggle_topmost" => {
            if let Some(win) = get_main_window(app) {
                let is_top = win.is_always_on_top().unwrap_or(false);
                let _ = win.set_always_on_top(!is_top);
            }
        }
        "fullscreen" => {
            if let Some(win) = get_main_window(app) {
                let is_fs = win.is_fullscreen().unwrap_or(false);
                let _ = win.set_fullscreen(!is_fs);
            }
        }
        "about" => emit_menu_action(app, "about"),
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
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
                app.exit(0);
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
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
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
        let _ = win.set_fullscreen(!is_fs);
    }
}

fn main() {
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
            let menu = build_menu(app.handle());
            app.set_menu(menu)?;

            // 系统托盘
            setup_tray(app.handle()).expect("无法设置系统托盘");

            // 确保主窗口在任务栏显示
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();

                // 点击 X 只隐藏窗口，不退出应用
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
        .on_menu_event(handle_menu_event)
        .invoke_handler(tauri::generate_handler![toggle_topmost, toggle_fullscreen])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
