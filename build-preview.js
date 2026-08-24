const fs = require('fs');
const path = require('path');

const root = __dirname;
const desktopUiDir = path.join(root, 'desktop-ui');
const appDataPath = path.join(process.env.APPDATA || '', 'com.xan.music-ratings', 'music-data.json');
const localDataPath = path.join(desktopUiDir, 'data.json');

// 优先从 AppData 读取最新数据，其次 fallback 到 localDataPath
let dataContent = '{}';
if (fs.existsSync(appDataPath)) {
  try {
    dataContent = fs.readFileSync(appDataPath, 'utf8');
    console.log('[Preview] 成功从 AppData 读取最新数据');
  } catch (e) {
    console.warn('[Preview] 读取 AppData 失败，尝试读取 desktop-ui/data.json');
    dataContent = fs.readFileSync(localDataPath, 'utf8');
  }
} else if (fs.existsSync(localDataPath)) {
  dataContent = fs.readFileSync(localDataPath, 'utf8');
  console.log('[Preview] 成功从 desktop-ui/data.json 读取数据');
}

// 读取所有 CSS
const cssFiles = ['base.css', 'layout.css', 'components.css', 'macos.css'];
let combinedCss = '';
for (const file of cssFiles) {
  const p = path.join(desktopUiDir, 'css', file);
  if (fs.existsSync(p)) {
    combinedCss += `\n/* ===== ${file} ===== */\n` + fs.readFileSync(p, 'utf8');
  }
}

// 读取所有 JS
const jsFiles = [
  'state.js',
  'i18n.js',
  'utils.js',
  'dialog.js',
  'filter.js',
  'modal.js',
  'render.js',
  'drag.js',
  'app.js'
];
let combinedJs = '';
for (const file of jsFiles) {
  const p = path.join(desktopUiDir, 'js', file);
  if (fs.existsSync(p)) {
    combinedJs += `\n/* ===== ${file} ===== */\n` + fs.readFileSync(p, 'utf8');
  }
}

// 读取 HTML 模板
const indexHtml = fs.readFileSync(path.join(desktopUiDir, 'index.html'), 'utf8');

// 提取 index.html 的 body 内部内容
const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const bodyContent = bodyMatch ? bodyMatch[1] : indexHtml;
// 移除 index.html 里面的 <script src="js/..."> 标签
let cleanBody = bodyContent.replace(/<script\s+src="js\/[^"]+"><\/script>\s*/gi, '');

// 将所有 assets 资源内嵌为 Base64 Data URL，确保 preview.html 完全独立零外链
let appIconBase64 = '';
const searchIconPath = path.join(desktopUiDir, 'assets', 'search-icon.png');
if (fs.existsSync(searchIconPath)) {
  const iconBase64 = fs.readFileSync(searchIconPath).toString('base64');
  cleanBody = cleanBody.replace('assets/search-icon.png', 'data:image/png;base64,' + iconBase64);
}

const appIconPath = path.join(desktopUiDir, 'assets', 'app-icon.png');
if (fs.existsSync(appIconPath)) {
  appIconBase64 = fs.readFileSync(appIconPath).toString('base64');
  cleanBody = cleanBody.replace('assets/app-icon.png', 'data:image/png;base64,' + appIconBase64);
}



// 读取 package.json 版本号
let appVersion = '1.5.4';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version) appVersion = pkg.version;
} catch (_) {}

// 构造 Tauri 桌面模拟环境
const mockTauriScript = `
<script>
window.__APP_ICON_DATA__ = 'data:image/png;base64,${appIconBase64}';
// ===== Tauri 桌面版浏览器环境模拟器 =====
window.__PREVIEW_MODE__ = true;
window.__MUSIC_DATA__ = ${dataContent};

// 模拟 Tauri 桌面环境
(function() {
  let isMaximized = false;
  let isFullscreen = false;
  let isTopmost = false;
  const mockCovers = new Map();

  window.__TAURI__ = {
    core: {
      invoke: async function(cmd, args) {
        switch(cmd) {
          case 'load_data_from_disk': {
            const saved = localStorage.getItem('preview_musicData');
            if (saved) return saved;
            return JSON.stringify(window.__MUSIC_DATA__);
          }
          case 'save_data_to_disk': {
            if (args && args.data) {
              localStorage.setItem('preview_musicData', args.data);
            }
            return true;
          }
          case 'check_disk_data': return true;
          case 'get_app_version': return '${appVersion} (Preview)';
          case 'is_window_topmost': return isTopmost;
          case 'is_window_maximized': return isMaximized;
          case 'is_window_fullscreen': return isFullscreen;
          case 'toggle_topmost': {
            isTopmost = !isTopmost;
            document.querySelector('.titlebar-btn-pin')?.classList.toggle('active', isTopmost);
            return isTopmost;
          }
          case 'toggle_maximize': {
            isMaximized = !isMaximized;
            return isMaximized;
          }
          case 'toggle_fullscreen': {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
              isFullscreen = true;
            } else {
              document.exitFullscreen().catch(() => {});
              isFullscreen = false;
            }
            return isFullscreen;
          }
          case 'minimize_window': {
            console.log('[Preview Mock] 最小化窗口');
            return null;
          }
          case 'close_window': {
            console.log('[Preview Mock] 隐藏到托盘/关闭');
            return null;
          }
          case 'start_window_drag': return null;
          case 'trim_memory': return null;
          case 'write_log': return null;
          case 'clean_orphan_covers': return 0;
          case 'read_cover_thumbnail':
          case 'read_cover': {
            const entryId = args && args.entryId;
            if (!entryId) return null;
            if (mockCovers.has(entryId)) return mockCovers.get(entryId);
            const savedCover = localStorage.getItem('preview_cover_' + entryId);
            if (savedCover) return savedCover;
            return null;
          }
          case 'upload_cover': {
            const entryId = args && args.entryId;
            const src = args && args.sourcePath;
            if (entryId && src) {
              mockCovers.set(entryId, src);
              try { localStorage.setItem('preview_cover_' + entryId, src); } catch (_) {}
              return entryId + '.jpg';
            }
            return null;
          }
          case 'remove_cover': {
            const entryId = args && args.entryId;
            if (entryId) {
              mockCovers.delete(entryId);
              localStorage.removeItem('preview_cover_' + entryId);
            }
            return true;
          }
          default:
            return null;
        }
      }
    },
    event: {
      listen: function(event, handler) {
        return Promise.resolve(() => {});
      }
    }
  };

  // 默认启用桌面版样式（UI 放大 20%、macOS 原生光标、桌面端布局）
  document.documentElement.dataset.desktop = 'true';
})();
</script>
`;

// 组合完整 HTML
const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN" data-lang="zh" data-desktop="true">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Xan's Music Ratings (HTML 预览页 v${appVersion})</title>
<style>
${combinedCss}
</style>
</head>
<body>
${mockTauriScript}
${cleanBody}
<script>
${combinedJs}
</script>
</body>
</html>`;

const outputPath = path.join(root, 'preview.html');
fs.writeFileSync(outputPath, fullHtml, 'utf8');
console.log('✅ HTML 预览页已成功构建并生成于: ' + outputPath);
