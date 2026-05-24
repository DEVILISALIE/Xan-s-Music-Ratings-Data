# CLAUDE.md

## 语言要求

对话中必须使用中文回答用户，代码注释和解释说明也使用中文。

## 项目简介

模块化交互式乐评网页应用，iOS 风格，纯前端无依赖。用户可在浏览器中直接编辑分数、评论、标签。支持中英文切换、亮/暗主题、纯色/毛玻璃风格。

通过 `node gen.js` 从 txt 源文件生成数据嵌入到 index.html。Vol sections 自动合并到对应年份。

## 常用命令

```bash
node gen.js                      # 自动查找根目录下的 txt 文件
node gen.js path/to/file.txt     # 指定文件路径
```

## 架构

```
├── index.html             # 入口，包含 __MUSIC_DATA__ 占位
├── css/
│   ├── base.css           # CSS 变量、Reset、主题（亮/暗/毛玻璃）
│   ├── layout.css         # 侧边栏、工具栏、下拉菜单布局
│   └── components.css     # 卡片、弹窗、标签、按钮、动画
├── js/
│   ├── state.js           # 全局状态（currentFilter 为数组，支持多选）
│   ├── i18n.js            # 中英文翻译字典、t() 函数
│   ├── utils.js           # 工具函数、ensureDefaultGroups()、populateSectionSelector()
│   ├── filter.js          # 多选筛选、搜索、allCards 缓存
│   ├── modal.js           # 编辑弹窗、音轨评分
│   ├── render.js          # 侧边栏 + 内容区渲染、拖拽排序
│   └── app.js             # 初始化、主题切换、localStorage 持久化
└── gen.js                 # txt → JSON 解析器，嵌入数据到 index.html
```

**JS 加载顺序**：`state.js` → `i18n.js` → `utils.js` → `filter.js` → `modal.js` → `render.js` → `app.js`

## localStorage 键值

| Key | 类型 | 说明 |
|-----|------|------|
| `musicData` | JSON 字符串 | 完整 sections 数据，编辑后自动保存 |
| `lang` | `"en"` / `"zh"` | 界面语言偏好 |
| `theme` | `"light"` / `"dark"` | 亮/暗模式 |
| `style` | `"solid"` / `"glass"` | 纯色/毛玻璃风格（默认 glass） |
| `mustHearThreshold` | 数字字符串 | 必听专辑分数阈值，默认 `80` |

## 关键技术细节

**数据流**：优先级为 localStorage > `__MUSIC_DATA__` > `data.json`。`ensureDefaultGroups()` 在数据加载后和导入后调用，确保每个 section 都有 Albums/Singles 两个分组。`migrateVolSections()` 自动合并旧版 vol sections。

**渲染与筛选分离**：`renderContent()` 重建 DOM 时同步应用筛选（通过 `matchesFilter(entry)` 传入 `visible`），并维护 `allCards` 缓存和 `searchResults` 数组。`applyFilters()` 仅切换 `hidden` 类，不触发 DOM 重建。`rebuildCardCache()` 仅在 DOM 重建后调用。

**国际化**：`i18n.js` 包含 `I18N` 字典（en/zh）和 `t(key, params)` 翻译函数。HTML 中通过 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title` 属性标记需翻译的元素。`applyI18nToDOM()` 批量替换 DOM 文本。语言偏好持久化到 localStorage（key: `lang`）。切换语言时同步更新 tooltip 文字。

**主题与风格**：iOS 15 设计语言。两个维度独立切换：亮/暗模式（`[data-theme="dark"]`）和风格预设（纯色 vs 毛玻璃 `[data-style="glass"]`），状态持久化到 localStorage。默认风格为毛玻璃。

**毛玻璃性能优化**：
- backdrop-filter 为唯一模糊来源，不使用 `::before` 伪元素的额外 `filter: blur()`
- sidebar/toolbar blur 值 20px，卡片 16px，dropdown 40px
- 卡片使用 `will-change: transform` + `contain: layout style paint` 提升为独立合成层
- body 背景使用 `position: fixed` 伪元素替代 `background-attachment: fixed`
- 拖拽期间通过 `.content.is-dragging` 类临时禁用所有卡片的 backdrop-filter

**AOTY 管理**：`isAoty` 标记任意条目。`renderContent()` 在渲染时动态将 `isAoty=true` 的条目归入 AOTY 展示组。编辑弹窗中的 AOTY 开关修改 `isAoty` 标记。

**必听专辑**：Albums 分组中 `score >= mustHearThreshold` 的条目自动显示 `★Must Hear Album` 标记（Singles 不显示）。阈值默认 80，用户可通过工具栏输入框自定义（0–100），持久化到 localStorage（key: `mustHearThreshold`）。逻辑在 `renderAlbumCard()` 中通过 `showMustHear` 控制。

**筛选系统**：`currentFilter` 为数组，支持多选标签。分数筛选支持 100、90+、80+、70+、60+、50+、<50、NR、AOTY。标签下拉多选（选择后保持展开），分数下拉单选（选择后关闭）。

**搜索导航**：搜索时自动滚动到第一个结果并高亮蓝色描边，右下角"下一个"按钮循环跳转搜索结果。搜索使用 200ms debounce。

**Entry 索引**：`buildEntryIndex()` 构建 `Map<id, entry>` 实现 O(1) 查找。

**编辑弹窗**：`populateSectionSelector()` 始终为每个 section 列出 Albums 和 Singles 两个选项。`saveEntry()` 中 `JSON.parse(selectedSectionValue)` 有 try-catch 防护。Shift+回车快速保存。

**拖拽排序**：Pointer Events 实现，FLIP 动画技术平滑"挤开"效果。拖拽时原卡片 `opacity: 0` + `height: 0` 隐藏，占位符（`.drag-placeholder`）占据原位置，幽灵元素（`.drag-ghost`）跟随鼠标。动画参数 `0.25s cubic-bezier(0.2, 0, 0, 1)`。仅限同组内排序，AOTY 卡片不参与。

**EscapeHtml**：转义 `&`、`<`、`>`、`"`、`'`，防止 HTML 注入。

**下拉菜单交互**：标签下拉多选，选择后保持展开，点击外部关闭；分数下拉单选，选择后关闭；切换下拉时其他已打开的自动收回。

**解析器注意事项**（gen.js）：日期提取在标签移除之