# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言要求

对话中必须使用中文回答用户，代码注释和解释说明也使用中文。

## 项目简介

模块化交互式乐评网页应用模板，iOS 风格。用户可在浏览器中直接编辑分数、评论、标签。无需服务器，直接打开 HTML 文件即可使用。支持中英文切换。

需要通过 `node gen.js` 从 txt 源文件生成数据嵌入到 index.html。Vol sections（如 Vol. 1 - 2026）在解析时自动合并到对应年份的 section。

## 常用命令

```bash
# 自动查找根目录下的 txt 文件并嵌入数据到 index.html
node gen.js

# 或指定文件路径
node gen.js path/to/your/file.txt
```

读取 txt 源文件，生成 JSON 并通过 `__MUSIC_DATA__` 标记嵌入到根目录 `index.html`，同时写入 `data.json` 作为备份。

## 架构

模块化结构，CSS 和 JS 分离到独立文件，通过全局变量和函数互相调用。

```
├── index.html             # 入口文件，包含 __MUSIC_DATA__ 占位
├── css/
│   ├── base.css           # CSS 变量、Reset、主题（亮/暗/毛玻璃）
│   ├── layout.css         # 侧边栏、工具栏、下拉菜单布局
│   └── components.css     # 卡片、弹窗、标签、按钮、动画
├── js/
│   ├── state.js           # 全局状态变量（currentFilter 为数组，支持多选）
│   ├── i18n.js            # 中英文翻译字典、t() 函数、applyI18nToDOM()
│   ├── utils.js           # escapeHtml、getScoreClass、generateId、migrateVolSections()
│   ├── filter.js          # 多选标签筛选、搜索逻辑、搜索结果导航
│   ├── modal.js           # 编辑弹窗逻辑
│   ├── render.js          # 侧边栏 + 内容区渲染、拖拽排序、migrateAotyGroups()
│   └── app.js             # 初始化、主题切换、数据持久化、导入导出
└── gen.js                 # txt → JSON 解析器，Vol sections 自动合并，嵌入数据到 index.html
```

**JS 加载顺序**：`state.js` → `i18n.js` → `utils.js` → `filter.js` → `modal.js` → `render.js` → `app.js`

**数据生成**：`gen.js` 读取源 txt 文件，Vol headers 自动合并到对应年份 section（如 `Vol. 1 - 2026` 合并到 `2026`），生成 `data.json` 并嵌入到根目录 `index.html`。

## localStorage 键值

| Key | 类型 | 说明 |
|-----|------|------|
| `musicData` | JSON 字符串 | 完整的 sections 数据，编辑后自动保存 |
| `lang` | `"en"` / `"zh"` | 界面语言偏好 |
| `theme` | `"light"` / `"dark"` | 亮/暗模式 |
| `style` | `"solid"` / `"glass"` | 纯色/毛玻璃风格（默认 glass） |

## 关键技术细节

- **数据持久化**：浏览器中的编辑保存到 `localStorage`（key: `musicData`）。导出/导入 JSON 实现跨设备迁移。嵌入的 `__MUSIC_DATA__` 仅作为初始状态，优先级：localStorage > `__MUSIC_DATA__` > `data.json`。
- **数据迁移**：`migrateVolSections()` 启动时自动将旧版 vol sections 合并到对应年份 section。
- **国际化**：`i18n.js` 包含 `I18N` 字典（en/zh）和 `t(key, params)` 翻译函数。HTML 中通过 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title` 属性标记需翻译的元素。`applyI18nToDOM()` 批量替换 DOM 文本。语言偏好持久化到 localStorage（key: `lang`）。切换语言时同步更新 tooltip 文字。
- **主题与风格**：iOS 15 设计语言。两个维度独立切换：亮/暗模式（`[data-theme="dark"]`）和风格预设（纯色 vs 毛玻璃 `[data-style="glass"]`），状态持久化到 localStorage。默认风格为毛玻璃。毛玻璃效果包含 `::before` 伪元素高斯模糊叠加层。
- **AOTY 管理**：`isAoty` 标记任意条目。`renderContent()` 在渲染时动态将 `isAoty=true` 的条目归入 AOTY 展示组。编辑弹窗中的 AOTY 开关修改 `isAoty` 标记。AOTY 卡片显示标签和分数备注，布局与普通卡片一致（左侧标题/艺术家，右侧标签/分数）。
- **标签筛选**：`currentFilter` 为数组，支持多选。标签下拉菜单支持点击选择/取消，"全部标签" 重置所有选择。
- **分数筛选**：支持 100、90+、80+、70+、60+、50+、<50、NR、AOTY。
- **搜索导航**：搜索时自动滚动到第一个结果并高亮蓝色描边，右下角"下一个"按钮循环跳转搜索结果。
- **Entry 索引**：`buildEntryIndex()` 构建 `Map<id, entry>` 实现 O(1) 查找，搜索使用 200ms debounce。
- **EscapeHtml**：转义 `&`、`<`、`>`、`"`、`'`，防止 HTML 注入和 onclick 属性中的引号断裂。
- **编辑弹窗**：`populateSectionSelector()` 使用原始 section ID（非合并后的 ID），确保 `saveEntry()` 正确找到目标 section。Shift+回车快速保存。
- **年份删除**：侧边栏年份标题右侧有删除按钮（hover 显示），点击后确认删除该年份所有数据。
- **拖拽排序**（render.js）：使用 Pointer Events 实现卡片拖拽排序。采用 FLIP 动画技术实现平滑的"挤开"效果。拖拽时原卡片通过 `opacity: 0` + `height: 0` 隐藏，占位符（`.drag-placeholder`）占据原位置。幽灵元素（`.drag-ghost`）跟随鼠标。动画参数：`0.25s cubic-bezier(0.2, 0, 0, 1)`。仅限同组内排序，AOTY 卡片不参与拖拽。
- **解析器注意事项**（gen.js）：日期提取在标签移除之后执行。`psl()` 中分数提取在括号注释移除之后执行。正则 `/^\d+[\.\s]/` 同时匹配 `1. Title` 和 `1 Title` 两种格式。Vol headers 匹配 `/^Vol\.\s*\d+\s*-\s*(\d{4})/` 并合并到已有年份 section。
- **下拉菜单交互**：标签下拉多选，选择后保持展开，点击外部关闭；分数下拉单选，选择后关闭；切换下拉时其他已打开的自动收回。下拉菜单使用 `backdrop-filter` 毛玻璃效果。
