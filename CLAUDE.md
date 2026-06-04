# CLAUDE.md

## 语言要求

对话中必须使用中文回答用户，代码注释和解释说明也使用中文。

## 项目简介

模块化交互式乐评网页应用，iOS 风格，纯前端无依赖。用户可在浏览器中直接编辑分数、评论、标签。支持中英文切换、亮/暗主题、纯色/毛玻璃风格。

通过 `node gen.js` 从 txt 源文件生成数据嵌入到 index.html。Vol sections 自动合并到对应年份。

桌面版基于 Tauri v2（Rust + WebView2），Windows 专用，提供菜单栏、系统托盘、全局快捷键。桌面版与网页版完全独立，共享同一套前端代码。

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
│   └── components.css     # 卡片、弹窗、标签、按钮、动画
├── js/
│   ├── state.js           # 全局状态（currentFilter 为数组，支持多选）
│   ├── i18n.js            # 中英文翻译字典、t() 函数
│   ├── utils.js           # 工具函数、ensureDefaultGroups()、populateSectionSelector()
│   ├── filter.js          # 多选筛选、搜索、allCards 缓存
│   ├── modal.js           # 编辑弹窗、音轨评分
│   ├── render.js          # 侧边栏 + 内容区渲染、HTML 缓存
│   ├── drag.js            # 拖拽排序（Pointer Events + FLIP 动画）
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
    │   └── default.json   # Tauri v2 权限声明（dialog/fs/shell/shortcut）
    ├── icons/             # 应用图标（32x32/128x128/256x256/ico）
    └── src/
        └── main.rs        # 菜单栏、系统托盘、全局快捷键、窗口管理
```

**JS 加载顺序**：`state.js` → `i18n.js` → `utils.js` → `filter.js` → `modal.js` → `render.js` → `drag.js` → `app.js`

## localStorage 键值

| Key | 类型 | 说明 |
|-----|------|------|
| `musicData` | JSON 字符串 | 完整 sections 数据，编辑后自动保存 |
| `lang` | `"en"` / `"zh"` | 界面语言偏好 |
| `theme` | `"light"` / `"dark"` | 亮/暗模式 |
| `style` | `"solid"` / `"glass"` | 纯色/毛玻璃风格（默认 glass） |
| `mustHearThreshold` | 数字字符串 | 必听专辑分数阈值，默认 `80` |
| `mustHearEnabled` | `"true"` / `"false"` | 必听专辑功能开关，默认 `true` |

## 关键技术细节

**数据流**：优先级为 localStorage > `__MUSIC_DATA__` > `data.json`。`ensureDefaultGroups()` 在数据加载后和导入后调用，确保每个 section 都有 Albums/Singles 两个分组。`migrateVolSections()` 自动合并旧版 vol sections。

**数据保护机制**：`saveData()` 内置安全检查——如果 `appData` 不含真实数据（所有 sections 无 entry），且 localStorage 中已有真实数据，则**拒绝保存**并打印警告。`loadData()` 校验数据结构完整性（必须有 `sections` 数组），异常数据被忽略。`init()` 中只有 fallback 数据源包含真实数据时才写入 localStorage，防止空数据覆盖。

**桌面版（Tauri v2）**：
- 前端通过 `window.__TAURI__` 检测桌面环境，`app.js` 末尾的 `initTauriDesktop()` 自动激活桌面功能
- 菜单栏事件通过 `tauriEvent.listen('menu-action')` 接收，映射到前端函数
- 导出使用 `window.open(blobUrl)` 机制（WebView2 兼容）
- 快捷键：Ctrl+S 导出、Ctrl+D 主题、Ctrl+G 风格、Ctrl+O 导入、Ctrl+K 搜索、Ctrl+N 新建、Ctrl+T 置顶、F11 全屏
- 系统托盘：左键显示/隐藏窗口，右键菜单（显示/置顶/主题/退出）
- 桌面版 localStorage 域名与网页版隔离，需单独导入一次数据
- `build-frontend.js` 构建时将 index.html/css/js/data.json 复制到 dist/，Tauri 打包进二进制

**渲染与筛选分离**：`renderContent()` 重建 DOM 时同步应用筛选（通过 `matchesFilter(entry)` 传入 `visible`），并维护 `allCards` 缓存和 `searchResults` 数组。`applyFilters()` 仅切换 `hidden` 类，不触发 DOM 重建。`rebuildCardCache()` 仅在 DOM 重建后调用。

**国际化**：`i18n.js` 包含 `I18N` 字典（en/zh）和 `t(key, params)` 翻译函数。HTML 中通过 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title` 属性标记需翻译的元素。`applyI18nToDOM()` 批量替换 DOM 文本。语言偏好持久化到 localStorage（key: `lang`）。切换语言时同步更新 tooltip 文字。

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

**必听专辑**：Albums 分组中 `score >= mustHearThreshold` 的条目自动显示 `★Must Hear Album` 标记（Singles 不显示）。阈值默认 80，用户可通过工具栏弹出菜单自定义（0–100），并可通过开关关闭整个功能。开关和阈值均需点击「保存」后生效，持久化到 localStorage（key: `mustHearEnabled`、`mustHearThreshold`）。逻辑在 `renderAlbumCard()` 中通过 `showMustHear` 控制。

**筛选系统**：`currentFilter` 为数组，支持多选标签。分数筛选支持 100、90+、80+、70+、60+、50+、<50、NR、AOTY（同时匹配 `isAoty` 和 `isSoty`）。标签下拉多选（选择后保持展开），分数下拉单选（选择后关闭）。

**搜索导航**：搜索时自动滚动到第一个结果并高亮蓝色描边，右下角"下一个"按钮循环跳转搜索结果。搜索使用 200ms debounce。

**Entry 索引**：`buildEntryIndex()` 构建 `Map<id, entry>` 实现 O(1) 查找。

**编辑弹窗**：`populateSectionSelector()` 始终为每个 section 列出 Albums 和 Singles 两个选项。`saveEntry()` 中 `JSON.parse(selectedSectionValue)` 有 try-catch 防护。Shift+回车快速保存。

**拖拽排序**：Pointer Events 实现，FLIP 动画技术平滑"挤开"效果。拖拽时原卡片 `opacity: 0` + `height: 0` 隐藏，占位符（`.drag-placeholder`）占据原位置，幽灵元素（`.drag-ghost`）跟随鼠标。动画参数 `0.25s cubic-bezier(0.2, 0, 0, 1)`。仅限同组内排序，AOTY 卡片不参与。

**EscapeHtml**：转义 `&`、`<`、`>`、`"`、`'`，防止 HTML 注入。所有 innerHTML 中的用户数据（data 属性值、id 属性值、显示文本）均经过 `escapeHtml()` 处理。

**事件委托**：全部交互事件通过 `data-action` 属性 + 事件委托实现，无内联 `onclick`/`onkeydown`/`oninput`/`onchange`。委托层级：侧边栏 `.sidebar` → 导出/导入按钮；`#sidebarNav` → 折叠/删除/导航跳转；`#contentArea` → 卡片点击/Enter 键/乐评展开；`#editModal` → 取消/删除/保存/添加曲目；`#trackList` → 曲目输入/分数输入/删除曲目。

**HTML 缓存**：`renderSidebar()` 和 `renderContent()` 各维护一份 HTML 字符串缓存（`_lastSidebarHtml`、`_lastContentHtml`），内容未变化时跳过 DOM 重建。`refreshAll()` 中清除缓存强制重建。

**JSON 导入校验**：`handleImport()` 对导入数据做深度结构校验，验证每个 section/group/entry 的字段类型，自动修复缺失字段（补默认值）和类型错误（score 限制 0–100，tags/tracks 确保为数组等）。

**localStorage 容量监控**：`saveData()` 在保存后检查 JSON 大小，超过 4MB 时输出 `console.warn`；捕获 `QuotaExceededError` 时弹窗提示用户导出清理。

**下拉菜单交互**：标签下拉多选，选择后保持展开，点击外部关闭；分数下拉单选，选择后关闭；切换下拉时其他已打开的自动收回。

**解析器注意事项**（gen.js）：日期提取在标签移除之后执行。`psl()` 中分数提取在括号注释移除之后执行。正则 `/^\d+[\.\s]/` 同时匹配 `1. Title` 和 `1 Title` 两种格式。Vol headers 匹配 `/^Vol\.\s*\d+\s*-\s*(\d{4})/` 并合并到已有年份 section。`me()` 函数输出包含 `isSoty: false` 字段（SOTY 通过编辑弹窗手动标记）。
