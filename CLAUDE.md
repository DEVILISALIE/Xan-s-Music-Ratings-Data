# CLAUDE.md

## 语言要求

对话中必须使用中文回答用户，代码注释和解释说明也使用中文。

## 工作规则（必须遵守）

1. **默认只指桌面版**：用户说「修改」、提出问题或反馈，默认都只针对桌面版 exe（Tauri 应用），不是网页版。排查、改动、验证都以桌面版为准。
2. **桌面 exe 覆盖**：涉及桌面版改动并完成修改后，必须重新打包，并覆盖本机 exe：
   `C:\Users\lilxanyy\Desktop\music-ratings-main\src-tauri\target\release\music-ratings.exe`
   - 构建命令：`npm run tauri build`（或等价流程）
   - 目标是让上述路径的 exe 始终是当前最新可运行版本
3. **GitHub 发布权限**：只有用户明确说要发布/上传 GitHub（如「发布 github」「上传 github」「更新 release」）时，才允许 `git push`、创建/更新 GitHub Release、上传安装包。未明确要求时，禁止发布到 GitHub。

## 项目简介

模块化交互式乐评网页应用，iOS 风格，纯前端无依赖。用户可在浏览器中直接编辑分数、评论、标签。支持中英文切换、亮/暗主题、纯色/毛玻璃风格。

通过 `node gen.js` 从 txt 源文件生成数据嵌入到 index.html。Vol sections 自动合并到对应年份。

桌面版基于 Tauri v2（Rust + WebView2），Windows 专用，自定义标题栏（无原生菜单栏）、系统托盘、全局快捷键。桌面版与网页版完全独立，共享同一套前端代码。

## 常用命令

```bash
node gen.js                      # 自动查找根目录下的 txt 文件
node gen.js path/to/file.txt     # 指定文件路径

# 桌面版
npm run tauri dev                # 开发模式（自动启动本地服务器）
npm run tauri build              # 构建 MSI 安装包
```

## 架构

```
├── index.html             # 入口，包含 __MUSIC_DATA__ 占位
├── css/
│   ├── base.css           # CSS 变量、Reset、主题（亮/暗/毛玻璃），含 --tag-bg 变量
│   ├── layout.css         # 侧边栏、工具栏、下拉菜单布局
│   ├── components.css     # 卡片、弹窗、标签、按钮、动画
│   └── macos.css          # 桌面版专属样式（[data-desktop="true"]，UI 放大 20%）
├── js/
│   ├── state.js           # 全局状态（currentFilter 为数组，支持多选）
│   ├── i18n.js            # 中英文翻译字典、t() 函数
│   ├── utils.js           # 工具函数、ensureDefaultGroups()、populateSectionSelector()
│   ├── filter.js          # 多选筛选、搜索、allCards 缓存
│   ├── modal.js           # 编辑弹窗、音轨评分
│   ├── render.js          # 侧边栏 + 内容区渲染、HTML 缓存
│   ├── drag.js            # 拖拽排序（Pointer Events + FLIP 动画）
│   ├── dialog.js          # iOS 风格弹窗（showAlert / showConfirm / showPrompt）
│   └── app.js             # 初始化、事件委托、主题切换、localStorage 持久化、Tauri 桌面版适配
├── gen.js                 # txt → JSON 解析器，嵌入数据到 index.html
├── dev-server.js          # Tauri 开发模式本地 HTTP 服务器
├── build-frontend.js      # Tauri 构建时复制前端资源到 dist/
├── dev-server.vbs         # VBScript 隐藏窗口启动开发服务器
├── package.json           # Tauri CLI 和插件依赖
└── src-tauri/             # Tauri 桌面版（Rust 后端）
    ├── Cargo.toml         # Rust 依赖
    ├── tauri.conf.json    # 窗口、打包、插件配置
    ├── build.rs           # 构建脚本
    ├── capabilities/
    │   └── default.json   # Tauri v2 权限声明（dialog/fs/shell/shortcut/window）
    ├── icons/             # 应用图标（32x32/128x128/256x256/ico）
    └── src/
        └── main.rs        # 系统托盘、全局快捷键、窗口管理、数据持久化命令、封面管理命令
```

**JS 加载顺序**：`state.js` → `i18n.js` → `utils.js` → `dialog.js` → `filter.js` → `modal.js` → `render.js` → `drag.js` → `app.js`

## localStorage 键值

| Key | 类型 | 说明 |
|-----|------|------|
| `musicData` | JSON 字符串 | 完整 sections 数据，编辑后自动保存 |
| `lang` | `"en"` / `"zh"` | 界面语言偏好 |
| `theme` | `"light"` / `"dark"` | 亮/暗模式 |
| `style` | `"solid"` / `"glass"` | 纯色/毛玻璃风格（默认 glass） |
| `mustHearThreshold` | 数字字符串 | 必听专辑分数阈值，默认 `80` |
| `mustHearEnabled` | `"true"` / `"false"` | 必听专辑功能开关，默认 `true` |
| `bgHue` | `"default"` / `0–360` 数字字符串 | 浅色背景色调（仅浅色生效），默认 `default` |

## 关键技术细节

**数据流**：桌面版优先从磁盘文件加载（`AppData/Roaming/com.xan.music-ratings/music-data.json`），再 fallback 到 localStorage 和 `__MUSIC_DATA__`。网页版优先 localStorage。`ensureDefaultGroups()` 在数据加载后和导入后调用，确保每个 section 都有 Albums/Singles 两个分组。`migrateVolSections()` 自动合并旧版 vol sections。**1950s 分区（v1.3.5）**：桌面版在磁盘加载、localStorage 恢复、内置数据三条路径上都会检查 `sections` 是否已有 `id === '1950s'`；缺失时注入空分区 `{ id: '1950s', title: '1950s', groups: [Albums, Singles] }`，不覆盖已有数据。

**浅色背景色调（v1.4.0）**：仅浅色模式在设置菜单显示「背景色调」区（预设色板 + 0–360 全色谱滑条 + 恢复默认）。纯色改 `--light-bg`，毛玻璃对 `body::before` 做 `hue-rotate`；深色不生效。偏好键 `bgHue`。

**下拉毛玻璃 portal（v1.4.0）**：所有下拉（标签/分数/必听/设置/分组/批量/封面移除/右键）统一无色高模糊；打开时挂到 `body` + `position: fixed`，避免嵌在已有 `backdrop-filter` 的父级里导致模糊失效。宽度：标签/分数/必听/编辑分组 `matchAnchor` 与触发器同宽；设置菜单用自身 min-width。编辑弹窗滚动时 portal 跟随，触发框滚出可视区自动收起。

**数据保护机制**：
- `saveData()` 为 async 函数，内置并发锁（`_saveLock` / `_saveQueued`）防止多次保存冲突，确保最新数据始终被写入
- JSON.parse(localStorage 数据) 有 try-catch 防护，损坏数据不阻断保存
- Rust 端 `save_data_to_disk` JSON 解析失败时返回错误拒绝写入，写入前自动备份到 `.json.bak`
- `load_data_from_disk` 主文件不可用时自动尝试 `.bak` 备份文件
- **即时保存（v1.3.3）**：托盘"退出"不再直接 `app.exit(0)`，改为发送 `request-shutdown` 事件给前端，前端 `await saveData()` 确保磁盘写入完成后调用 `graceful_exit` 延迟 500ms 退出；5秒强制退出保底防卡死
- 桌面版启动时优先从磁盘加载，加载成功后同步到 localStorage

**桌面版（Tauri v2）**：
- 前端通过 `window.__TAURI__` 检测桌面环境，`app.js` 末尾的 `initTauriDesktop()` 自动激活桌面功能
- `css/macos.css` 通过 `[data-desktop="true"]` 选择器提供桌面版专属样式（UI 放大 20%），不影响网页版
- **自定义标题栏**（`decorations: false`）：38px 毛玻璃标题栏，左侧版本号，右侧窗口控件（📌置顶 / ⬚全屏 / —最小化 / □最大化 / ×关闭），标题栏通过 JS `start_window_drag` 拖拽（不使用 `-webkit-app-region: drag` 以避免系统右键菜单），关闭按钮 hover 变红，最大化/全屏时中间按钮自动切换为还原图标。全屏按钮为四角取景框 SVG 图标，最大化状态下进入全屏先 `unmaximize()` 避免 WebView2 bug
- **自定义右键菜单**：拦截系统右键菜单，显示毛玻璃风格自定义菜单（最小化/最大化还原/置顶/关闭），支持中英文
- 窗口管理通过自定义 Tauri command：`minimize_window`、`toggle_maximize`、`close_window`、`start_window_drag`
- 托盘事件通过 `tauriEvent.listen('menu-action')` 接收，映射到前端函数
- 导出使用 Tauri 原生文件对话框（`__TAURI_PLUGIN_DIALOG__` + `__TAURI_PLUGIN_FS__`）
- 快捷键：Ctrl+S 导出、Ctrl+D 主题、Ctrl+G 风格、Ctrl+O 导入、Ctrl+K 搜索、Ctrl+N 新建、Ctrl+T 置顶、F11 全屏
- **设置按钮（v1.3.3）**：工具栏 stats 右侧 ⚙ 按钮，点击弹出 iOS 风格下拉菜单，集成深色模式/毛玻璃风格/语言/多选模式，复用 `.toggle-switch` 样式，点击选项保持展开，点击外部自动关闭
- 系统托盘：左键按 `is_visible` 切换显示/隐藏窗口，右键菜单（显示/置顶/主题/退出）
- 点击 X 隐藏到系统托盘（任务栏按钮一并消失，仅保留托盘图标），通过 `on_window_event` 拦截 `CloseRequested` 并 `api.prevent_close()` + `win.hide()`
- 单实例模式：`tauri-plugin-single-instance` 确保只有一个窗口运行，第二次启动聚焦已有窗口
- 桌面版 localStorage 域名与网页版隔离，需单独导入一次数据
- `build-frontend.js` 构建时将 index.html/css/js/data.json 复制到 dist/，Tauri 打包进二进制
- Tauri 插件：dialog、fs、global-shortcut、shell、single-instance
- **版本号**：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` 当前为 `1.4.0`；标题栏通过 `get_app_version` 读取 package info；About 弹窗文案也写为 `v1.4.0`

**分数统计面板**：`render.js` 中 `updateGlobalStatsSidebar()` 在右侧固定位置渲染两个统计卡片（专辑 / 单曲），各自显示平均分、7 档分数分布柱状图（100 / 90-99 / 80-89 / 70-79 / 60-69 / 50-59 / 0-49）、已打分/未打分/条目数。所有标签均支持中英文切换，通过 `t()` 函数实现。每次数据变更后通过 `refreshAll()` 实时更新。**点击统计卡片弹出年度平均分弹窗**（`#yearlyStatsModal`），展示每一年的独立平均分和条目数，水平柱状图按最高分等比缩放，支持 ESC / 点击遮罩关闭。

**搜索结果计数**：搜索框内右侧 `.search-counter` 显示 `当前/总数`，`applyFilters()` 初始化时设置，`goToNextResult()` / `goToPrevResult()` 翻页时同步更新，清空搜索时隐藏。

**Shift+click 批量选择**：批量模式下，点击第一张卡片后 Shift+点击另一张卡片，自动选中两者之间的所有卡片。退出批量模式时清除选择记忆。

**渲染与筛选分离**：`renderContent()` 重建 DOM 时同步应用筛选（通过 `matchesFilter(entry)` 传入 `visible`），并维护 `allCards` 缓存和 `searchResults` 数组。`applyFilters()` 仅切换 `hidden` 类，不触发 DOM 重建。`rebuildCardCache()` 仅在 DOM 重建后调用。

**国际化**：`i18n.js` 包含 `I18N` 字典（en/zh）和 `t(key, params)` 翻译函数。HTML 中通过 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title` 属性标记需翻译的元素。`applyI18nToDOM()` 批量替换 DOM 文本。语言偏好持久化到 localStorage（key: `lang`）。切换语言时同步更新 tooltip 文字、分组标题（Albums→专辑 / Singles→单曲）和统计面板标签（avg→平均 / NR→未打分 / Entries→条目 / scored→已打分）。

**主题与风格**：iOS 15 设计语言。两个维度独立切换：亮/暗模式（`[data-theme="dark"]`）和风格预设（纯色 vs 毛玻璃 `[data-style="glass"]`），状态持久化到 localStorage。默认风格为毛玻璃。

**毛玻璃性能优化**：
- backdrop-filter 为唯一模糊来源，不使用 `::before` 伪元素的额外 `filter: blur()`
- sidebar/toolbar blur 值 20px，卡片 16px，dropdown 40px
- 卡片使用 `will-change: transform` + `contain: layout style paint` 提升为独立合成层
- body 背景使用 `position: fixed` 伪元素替代 `background-attachment: fixed`
- 拖拽期间通过 `.content.is-dragging` 类临时禁用所有卡片的 backdrop-filter

**AOTY/SOTY 管理**：`isAoty` 标记年度专辑，`isSoty` 标记年度单曲。`renderContent()` 在渲染时动态将 `isAoty=true` 的条目归入 Albums 顶部的 AOTY 组，`isSoty=true` 的条目归入 Singles 顶部的 SOTY 组。编辑弹窗根据当前选择的分组动态切换 AOTY/SOTY 开关（Albums 组显示 AOTY，Singles 组显示 SOTY）。筛选系统中"AOTY"选项同时匹配 `isAoty` 和 `isSoty`。

**AOTY/SOTY 锚点定位**：`renderContent()` 在每个 section 中渲染两个不可见锚点（1px div）用于侧边栏导航跳转：AOTY 锚点在 section 顶部、Albums 标题上方；SOTY 锚点在 Albums 下方、Singles 标题上方。锚点仅在对应条目存在时渲染。

**侧边栏导航高亮**：滚动同步由 `setupScrollSync()` 实现，使用 `requestAnimationFrame` 节流。遍历所有 `[id^="group-"]` 元素，以 `getBoundingClientRect().top <= 60` 判断当前可视 group，精确到 group 级别（非 section 级别）。高亮只应用于当前 section 的导航项，其他 section 的 `.active` 被清除。点击导航项时通过事件委托（`data-action="nav-click"`）禁用滚动同步（`overview-scroll` 类，持续 1.7s），并用 `window._navActiveInterval/_navActiveTimeout/_navScrollDelay` 三个全局定时器管理强化周期，每次新点击前清除所有旧定时器，防止多 interval 累积导致多 group 同时高亮。

**必听专辑**：Albums 分组中 `score >= mustHearThreshold` 的条目自动显示 `★Must Hear Album` 标记（Singles 不显示）。阈值默认 80，用户可通过工具栏弹出菜单自定义（0–100），并可通过开关关闭整个功能。开关和阈值均需点击「保存」后生效，持久化到 localStorage（key: `mustHearEnabled`、`mustHearThreshold`）。逻辑在 `renderAlbumCard()` 中通过 `showMustHear` 控制。**点击框外丢弃未保存的修改**，恢复为已保存值，重新打开时输入框显示正确的当前阈值。保存时调用 `updateMustHearBadges()` 只更新每张卡片上的标记，不全量重建 DOM。

**封面 URL 输入**：点击「URL」按钮弹出 iOS 风格 `showPrompt` 弹窗（`dialog.js`），替代浏览器原生 `prompt()`，支持中英文标题。

**语言切换优化（v1.3.3）**：`toggleLang()` 调用 `updateLangTexts()` 只更新分组标题（`.group-title`）、Must Hear 标记、统计面板和侧边栏，跳过 `renderContent()` 全量重建。

**z-index 层级（桌面版 v1.3.3）**：统计面板 `z-index: 40`，toolbar `z-index: 50`（低于模态弹窗遮罩 100，弹窗打开时 toolbar 会被模糊），设置下拉菜单 `z-index: 150`（在 toolbar 内部，有效层级 50，高于统计面板）。

**筛选系统**：`currentFilter` 为数组，支持多选标签。分数筛选支持 100、90+、80+、70+、60+、50+、<50、NR、AOTY（同时匹配 `isAoty` 和 `isSoty`）。标签下拉多选（选择后保持展开），分数下拉单选（选择后关闭）。

**搜索导航**：搜索时自动滚动到第一个结果并高亮蓝色描边，右下角"下一个"按钮循环跳转搜索结果。搜索使用 200ms debounce。搜索字段包括 title、artist、scoreNote、notes、review。

**Entry 索引**：`buildEntryIndex()` 构建 `Map<id, entry>` 实现 O(1) 查找。

**编辑弹窗**：`populateSectionSelector()` 始终为每个 section 列出 Albums 和 Singles 两个选项。`saveEntry()` 中 `JSON.parse(selectedSectionValue)` 有 try-catch 防护。Shift+回车快速保存。

**批量添加曲目（v1.3.4）**：编辑弹窗每碟底部有「批量添加」按钮（`data-action="batch-add-to-disc"`），调用 `batchAddTracks(disc)`。通过 `showPrompt` 输入目标曲目数（1–999）：数量大于现有则在该 disc 末尾补空白曲目，小于现有则从该 disc 末尾删多余行，相等则无操作。完成后聚焦该 disc 第一个空白曲目输入框。i18n 键：`modal.batchAddTracks` / `modal.batchAddPrompt` / `modal.batchAddPlaceholder`。

**拖拽排序**：Pointer Events 实现，FLIP 动画技术平滑"挤开"效果。拖拽时原卡片 `opacity: 0` + `height: 0` 隐藏，占位符（`.drag-placeholder`）占据原位置，幽灵元素（`.drag-ghost`）跟随鼠标。动画参数 `0.25s cubic-bezier(0.2, 0, 0, 1)`。仅限同组内排序，AOTY 卡片不参与。

**AOTY/SOTY 卡片宽度（v1.3.3）**：桌面版 AOTY/SOTY 卡片通过 `:has(.aoty-card)` 让 `.group-cards-list` 允许溢出，再设置 `width: calc(100% + 20px)` + `margin-left: -10px` 居中扩展，左右各比普通卡片宽 20px。

**编辑保存优化（v1.3.4）**：`saveEntry()` 编辑已有条目时，如果未跨组移动，调用 `updateCardInPlace(entryId)` 只替换单张卡片 DOM，跳过全量 `renderContent()`，配合 CSS `fadeInUp` 动画提供视觉反馈。跨组移动仍走 `refreshAll()` 全量重建。新建/编辑后凡命中排序规则的 section 都走 `reorderGroupCards()` 自动排序并插入到正确位置。

**自动排序（v1.3.3 / v1.3.4 扩展）**：1990-2024 年的 section 新建或编辑条目后自动按标题排序，优先级：符号 → 数字 → 英文 → 中文拼音（`localeCompare('zh-CN')`），AOTY/SOTY 永远置顶不参与排序。2025 及以后的 section 根据日期格式自动判断排序方式：`MM.DD` 格式按日期升序排在最前，`XXXX` 格式按年份降序（新在前）排在中间，无日期排最后按标题排序；MM.DD 条目始终在 XXXX 条目前面。1980s 及以前（含 1950s）的 section 按年份降序（新在前），无年份排最后，同一年份再按标题排序。编辑时调用 `reorderGroupCards()` 重排整个 group 的 DOM 并更新序号，AOTY/SOTY 状态变化时自动重建卡片类型。`charPriority(ch)` 在 `filter.js` 中定义。

**EscapeHtml**：转义 `&`、`<`、`>`、`"`、`'`，防止 HTML 注入。所有 innerHTML 中的用户数据（data 属性值、id 属性值、显示文本）均经过 `escapeHtml()` 处理。

**事件委托**：全部交互事件通过 `data-action` 属性 + 事件委托实现，无内联 `onclick`/`onkeydown`/`oninput`/`onchange`。委托层级：侧边栏 `.sidebar` → 导出/导入按钮；`#sidebarNav` → 折叠/删除/导航跳转；`#contentArea` → 卡片点击/Enter 键/乐评展开；`#editModal` → 取消/删除/保存/添加曲目/批量添加曲目；`#trackList` → 曲目输入/分数输入/删除曲目。

**HTML 缓存**：`renderSidebar()` 和 `renderContent()` 各维护一份 HTML 字符串缓存（`_lastSidebarHtml`、`_lastContentHtml`），内容未变化时跳过 DOM 重建。`refreshAll()` 中清除缓存强制重建。

**JSON 导入校验**：`handleImport()` 对导入数据做深度结构校验，验证每个 section/group/entry 的字段类型，自动修复缺失字段（补默认值）和类型错误（score 限制 0–100，tags/tracks 确保为数组等）。

**localStorage 容量监控**：`saveData()` 在保存后检查 JSON 大小，超过 4MB 时输出 `console.warn`；捕获 `QuotaExceededError` 时弹窗提示用户导出清理。

**下拉菜单交互**：标签下拉多选，选择后保持展开，点击外部关闭；分数下拉单选，选择后关闭；切换下拉时其他已打开的自动收回。

**解析器注意事项**（gen.js）：日期提取在标签移除之后执行。`psl()` 中分数提取在括号注释移除之后执行。正则 `/^\d+[\.\s]/` 同时匹配 `1. Title` 和 `1 Title` 两种格式。Vol headers 匹配 `/^Vol\.\s*\d+\s*-\s*(\d{4})/` 并合并到已有年份 section。`me()` 函数输出包含 `isSoty: false` 字段（SOTY 通过编辑弹窗手动标记）。

**专辑封面管理**：
- 数据模型：entry 新增 `cover` 字段，值为本地文件名（如 `"a1.jpg"`）或完整 URL；`null` 表示无封面。通过判断是否以 `http` 开头区分类型
- 本地文件存储在 `{appDataDir}/covers/` 目录，文件名以 entry id 命名（如 `{entryId}.jpg`），同一 entry 重复上传直接覆盖，旧文件自动清理
- Rust 端三个 Tauri 命令：`upload_cover(entry_id, source_path)` 复制文件到 covers 目录并返回文件名；`remove_cover(entry_id)` 删除匹配文件；`read_cover(entry_id)` 读取文件并返回 base64 data URL
- 前端使用 `coverCache`（`Map<id, dataUrl>`）缓存已加载的封面；卡片渲染时懒加载——`getCoverHtml()` 在 `coverCache` 未命中时异步调用 `read_cover` 并就地更新 `<img>` src，不依赖启动预加载
- 编辑弹窗封面区域：顶部大图预览 + 上传/URL/移除按钮；移除按钮有二级确认 dropdown（确认/取消），点击外部自动关闭
- 卡片缩略图：普通卡片 48px（桌面版 58px），AOTY/SOTY 卡片使用固定尺寸容器 `.aoty-cover-wrap`（80px/96px），无封面时不显示占位
- 全屏查看器：双击封面打开，支持滚轮缩放（0.3x–5x，以鼠标位置为锚点）和按住左键拖拽平移；Escape/点击背景/点击 × 关闭
- 文件大小限制：上传和读取均限制 20MB；支持格式：jpg、jpeg、png、webp、gif、bmp、avif
- `saveEntry()` 自动包含 `cover` 字段，`refreshAll()` 触发卡片重渲染

**曲目碟号（disc）**：
- 每首曲目有 `disc` 字段（number，默认 1），用于多碟专辑分组
- 卡片曲目标签：多碟时显示 `2 Discs 28T`（英文）/ `2碟 28首`（中文），单碟保持原样
- 编辑弹窗内多碟专辑额外显示每碟独立平均分，用「·」分隔，如 `碟1：平均 85.2 · 碟2：平均 79.4`
- i18n 键：`content.discLabel`（`{count} Discs ` / `{count}碟 `）、`modal.discAvg`（`Disc {disc}: avg {avg}` / `碟{disc}：平均 {avg}`）
