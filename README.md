# Xan's Music Ratings

一个 iOS 风格的交互式个人乐评网页应用模板。**无需服务器**，直接在浏览器中打开即可使用。

所有编辑自动保存到浏览器本地存储，支持 JSON 导入导出实现跨设备同步。

## 截图

<!-- TODO: 添加截图 -->

## 功能

- **浏览与搜索** — 按年份浏览，支持标题/艺术家搜索，200ms debounce
- **筛选** — 按类型（EP、Mixtape、Reissue 等）和分数范围（90+、80+、&lt;50、NR）筛选
- **编辑** — 点击卡片即可编辑标题、艺术家、分数、评论、标签、音轨评分等
- **AOTY** — 年度专辑标记，任意条目均可标记为 AOTY
- **拖拽排序** — 同组内卡片可拖拽排序，FLIP 动画平滑过渡
- **主题切换** — 亮/暗模式 + 纯色/毛玻璃两种风格独立切换
- **数据管理** — 导出/导入 JSON 实现跨设备迁移，支持从 txt 源文件重新生成
- **年份管理** — 侧边栏 hover 显示删除按钮，一键删除整年数据

## 使用方式

### 快速开始

1. 准备你的 txt 源文件（格式见下方），放到项目根目录
2. 运行 `node gen.js` 将数据嵌入到 index.html
3. 双击打开 `index.html` 即可使用

```bash
# 自动查找根目录下的 txt 文件并生成
node gen.js

# 或指定文件路径
node gen.js path/to/your/file.txt
```

### 直接打开（已有数据时）

如果 index.html 中已嵌入数据，双击打开即可使用。后续编辑自动保存到 `localStorage`。

### 数据加载优先级

```
localStorage > __MUSIC_DATA__（嵌入数据）> data.json
```

## txt 文件格式

源 txt 文件格式如下：

```
Vol. 1 - 2025
1. Album Title - Artist Name <85>
2. Another Album - Another Artist <92> 12.15
3. EP Title - Some Artist <NR> EP
...

P.S.
Song Title - Artist Name <88>
Another Song - Another Artist

AOTY
AOTY Album Title 95/100
Artist Name
乐评：这是一段评论文字...

2024
1. Classic Album - Legendary Artist <100>
...
```

**格式说明：**
- **Section 标题**：`Vol. 1 - 2025`、`2024`、`2023` 等年份
- **专辑条目**：`序号. 标题 - 艺术家 <分数>` 或 `标题 - 艺术家 <分数> MM.DD`
- **标签**：在行尾添加 `EP`、`Mixtape`、`Reissue` 等
- **Singles 部分**：以 `P.S.` 开头
- **AOTY 专辑**：`AOTY` 开头，下一行 `标题 分数/100`，再下一行艺术家，然后是乐评

## 项目结构

```
├── index.html             # 入口文件，包含 __MUSIC_DATA__ 占位
├── css/
│   ├── base.css           # CSS 变量、Reset、主题（亮/暗/毛玻璃）
│   ├── layout.css         # 侧边栏、工具栏、内容区布局
│   └── components.css     # 卡片、弹窗、标签、按钮、动画
├── js/
│   ├── state.js           # 全局状态变量
│   ├── i18n.js            # 中英文翻译字典、t() 函数、applyI18nToDOM()
│   ├── utils.js           # escapeHtml、getScoreClass、generateId
│   ├── filter.js          # 筛选/搜索逻辑、entry 索引
│   ├── modal.js           # 编辑弹窗逻辑
│   ├── render.js          # 侧边栏 + 内容区渲染、vol 合并、拖拽排序
│   └── app.js             # 初始化、主题切换、数据持久化、导入导出
├── gen.js                 # txt → JSON 解析器，嵌入数据到 index.html
└── CLAUDE.md              # Claude Code 开发指南
```

JS 加载顺序：`state.js` → `i18n.js` → `utils.js` → `filter.js` → `modal.js` → `render.js` → `app.js`

## 数据结构

```json
{
  "meta": {},
  "sections": [
    {
      "id": "vol1-2025",
      "title": "2025 Vol.1",
      "groups": [
        {
          "name": "January",
          "entries": [
            {
              "id": "abc123",
              "title": "Album Title",
              "artist": "Artist Name",
              "score": 85,
              "scoreNote": "",
              "date": "2025-01-15",
              "tags": ["EP"],
              "review": "写几句评论",
              "isAoty": false,
              "notes": "",
              "tracks": [{ "name": "Song 1", "score": 9 }]
            }
          ]
        }
      ]
    }
  ]
}
```

- `score`：整数 0–100 或 `null`（未评分）
- `scoreNote`：特殊标记，如 `"NR"`、`"Top1"`
- `tags`：`["EP","Mixtape","Reissue","Soundtrack","Live","Compilation","Unofficial","DJ Mix","Video"]`
- `isAoty`：年度专辑标记，渲染时动态归入 AOTY 组
- `tracks`：可选的音轨评分数组

## 技术栈

- 纯原生 HTML / CSS / JavaScript，无任何框架或依赖
- iOS 15 设计语言
- localStorage 持久化
- Pointer Events 拖拽 + FLIP 动画
