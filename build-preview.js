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
let appVersion = '1.6.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version) appVersion = pkg.version;
} catch (_) {}

// 读取 AppData 下的所有 covers 图片并内嵌为 Base64（优先读取 .thumbnails 缩略图以保证单文件体积轻量，杜绝超过 GitHub 100MB 限制）
const coversDir = path.join(process.env.APPDATA || '', 'com.xan.music-ratings', 'covers');
const thumbnailsDir = path.join(coversDir, '.thumbnails');
let embeddedCovers = {};
if (fs.existsSync(coversDir)) {
  try {
    const files = fs.readdirSync(coversDir);
    let coverCount = 0;
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'].includes(ext)) {
        const baseName = path.basename(file, ext);
        const thumbPath = path.join(thumbnailsDir, `${baseName}.png`);
        let filePath = path.join(coversDir, file);
        let mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : (ext === '.gif' ? 'image/gif' : 'image/jpeg'));

        if (fs.existsSync(thumbPath)) {
          filePath = thumbPath;
          mime = 'image/png';
        }

        const b64 = fs.readFileSync(filePath).toString('base64');
        const dataUrl = `data:${mime};base64,${b64}`;
        // 只存 baseName，避免双份膨胀，在查询逻辑中自动支持 entryId 与 entryId.ext
        embeddedCovers[baseName] = dataUrl;
        coverCount++;
      }
    }
    console.log(`[Preview] 成功内嵌 ${coverCount} 张本地封面图片（优化体积）`);
  } catch (e) {
    console.warn('[Preview] 读取封面目录失败:', e.message);
  }
}

// 读取系统已安装字体（供预览页模拟 get_system_fonts）
let systemFontsForPreview = [];
if (process.platform === 'win32') {
  try {
    const fontSet = new Set();
    const { execSync } = require('child_process');
    const keys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
      'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    ];
    for (const key of keys) {
      try {
        const out = execSync(`chcp 65001 >nul && reg query "${key}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: 'cmd.exe' });
        for (const line of out.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('HKEY_')) continue;
          const match = trimmed.match(/^([^\t\r\n]+?)\s+REG_SZ\s+/i);
          if (match) {
            let rawName = match[1].trim();
            const parenIdx = rawName.lastIndexOf('(');
            if (parenIdx !== -1) {
              rawName = rawName.substring(0, parenIdx).trim();
            }
            for (const part of rawName.split('&')) {
              const clean = part.trim();
              if (clean && !clean.startsWith('@')) {
                fontSet.add(clean);
              }
            }
          }
        }
      } catch (_) {}
    }
    const cleanFontSet = new Set();
    let hasPingFang = false;
    for (const f of fontSet) {
      if (/pingfang|苹方/i.test(f)) {
        hasPingFang = true;
        continue;
      }
      cleanFontSet.add(f);
    }
    if (hasPingFang) {
      cleanFontSet.add('PingFang SC');
    }
    systemFontsForPreview = Array.from(cleanFontSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    console.log(`[Preview] 成功读取系统已安装字体 ${systemFontsForPreview.length} 个`);
  } catch (e) {
    console.warn('[Preview] 读取系统字体失败:', e.message);
  }
}

// 构造 Tauri 桌面模拟环境
const mockTauriScript = `
<script>
window.__APP_ICON_DATA__ = 'data:image/png;base64,${appIconBase64}';
// ===== Tauri 桌面版浏览器环境模拟器 =====
window.__PREVIEW_MODE__ = true;
window.__MUSIC_DATA__ = ${dataContent};

(function() {
  let isMaximized = false;
  let isFullscreen = false;
  let isTopmost = false;
  const initialCovers = ${JSON.stringify(embeddedCovers)};
  const mockCovers = new Map(Object.entries(initialCovers));

  // ===== 独立前端图片数据库 (IndexedDB: XanMusicRatings_PreviewDB) =====
  // 预览页与桌面版物理隔离，所有在网页中上传/编辑的图片仅保存在浏览器专属数据库中
  const DB_NAME = 'XanMusicRatings_PreviewDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'covers';

  function openDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function() { resolve(null); };
    });
  }

  async function getDBItem(key) {
    const db = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch(_) { resolve(null); }
    });
  }

  async function setDBItem(key, value) {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch(_) { resolve(false); }
    });
  }

  async function deleteDBItem(key) {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch(_) { resolve(false); }
    });
  }

  window.__TAURI_PLUGIN_DIALOG__ = {
    open: function(options) {
      return new Promise((resolve) => {
        let input = document.getElementById('previewCoverFileInput');
        if (!input) {
          input = document.createElement('input');
          input.id = 'previewCoverFileInput';
          input.type = 'file';
          input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif';
          input.style.display = 'none';
          document.body.appendChild(input);
        }
        input.value = '';
        input.onchange = function(e) {
          const file = e.target.files && e.target.files[0];
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = function(evt) {
            resolve(evt.target.result);
          };
          reader.onerror = function() {
            resolve(null);
          };
          reader.readAsDataURL(file);
        };
        input.click();
      });
    },
    save: function() { return Promise.resolve(null); }
  };

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
            const cleanId = String(entryId).replace(/\.[^.]+$/, '');
            if (mockCovers.has(cleanId)) return mockCovers.get(cleanId);
            if (mockCovers.has(entryId)) return mockCovers.get(entryId);
            if (mockCovers.has(cleanId + '.jpg')) return mockCovers.get(cleanId + '.jpg');
            // 从独立 Preview IndexedDB 数据库读取
            const dbCover = await getDBItem('cover_' + cleanId) || await getDBItem('cover_' + entryId);
            if (dbCover) {
              mockCovers.set(cleanId, dbCover);
              return dbCover;
            }
            return null;
          }
          case 'upload_cover': {
            const entryId = args && args.entryId;
            const src = args && args.sourcePath;
            if (entryId && src) {
              mockCovers.set(entryId, src);
              mockCovers.set(entryId + '.jpg', src);
              // 保存至独立 Preview IndexedDB 数据库
              await setDBItem('cover_' + entryId, src);
              return entryId + '.jpg';
            }
            return null;
          }
          case 'remove_cover': {
            const entryId = args && args.entryId;
            if (entryId) {
              mockCovers.delete(entryId);
              mockCovers.delete(entryId + '.jpg');
              // 从独立 Preview IndexedDB 数据库删除
              await deleteDBItem('cover_' + entryId);
            }
            return true;
          }
          case 'get_system_fonts': {
            return ${JSON.stringify(systemFontsForPreview)};
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
