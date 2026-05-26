# Xan's Music Ratings

> iOS 风格的交互式个人乐评管理工具 — 纯前端、零依赖、打开即用

一个模块化的音乐评分网页应用，支持在浏览器中直接编辑专辑分数、评论、标签和音轨评分。所有数据自动保存到浏览器本地存储，支持 JSON 导入导出实现跨设备同步。

---

## 功能一览

### 浏览与导航

- 按年份/年代分组浏览，侧边栏快速跳转到任意年份或分组
- 侧边栏带可见滚动条，紧贴顶部底部，大量年份时可快速翻动
- 侧边栏高亮精确到 group 级别（AOTY/Albums/SOTY/Singles），滚动同步自动跟随
- 每个年份/年代固定显示 **Albums** 和 **Singles** 两个分区，即使为空也保留标题
- 侧边栏年份标题 hover 显示删除按钮，一键删除整年数据（带确认弹窗）

### 搜索

- 工具栏搜索框实时搜索标题和艺术家（200ms debounce）
- 搜索时自动滚动到第一个结果并蓝色描边高亮
- 右下角"下一个"按钮循环跳转所有搜索结果

### 多维筛选

- **标签筛选** — 下拉多选，支持 EP、Mixtape、Reissue、Soundtrack、Live、Compilation、Unofficial、DJ Mix、Video，选择后保持展开
- **分数筛选** — 下拉单选，支持 100、90+、80+、70+、60+、50+、<50、NR（无分数）、AOTY（同时匹配年度专辑和年度单曲）
- 两种筛选可叠加使用，结果计数实时更新
- 切换下拉时其他已打开的自动收回

### 编辑

- 点击卡片打开编辑弹窗，可修改：标题、艺术家、分数、日期、分数备注、标签、AOTY/SOTY 标记、备注、音轨评分、乐评
- **音轨评分** — 在弹窗内逐首添加曲目和分数，实时显示曲目数/已评分数/平均分
- **添加到分组** — 下拉选择目标年份和 Albums/Singles 分组，可跨年份移动条目
- **AOTY/SOTY 开关** — Albums 组条目可标记为年度专辑（AOTY），Singles 组条目可标记为年度单曲（SOTY），编辑弹窗根据分组自动切换
- **必听专辑** — Albums 分组中高分条目自动显示 ★Must Hear Album 标记，阈值和开关可在工具栏自定义，点击保存后生效
- Shift + Enter 快速保存，Escape 关闭弹窗
- 新增专辑通过右下角 FAB 按钮（+）触发

### AOTY / SOTY（年度专辑 / 年度单曲）

- Albums 组条目可通过编辑弹窗标记为 AOTY，Singles 组条目可标记为 SOTY
- AOTY/SOTY 卡片使用独立大卡片样式，显示标签、分数和乐评
- 乐评支持展开/收起（超过 120px 自动截断，点击"展开更多"）
- 侧边栏导航精确到 group 级别，点击跳转后高亮对应 AOTY/SOTY/Albums/Singles 导航项

### 拖拽排序

- 同组内卡片可通过拖拽重新排序（AOTY 卡片不参与）
- Pointer Events 实现，FLIP 动画技术平滑"挤开"效果
- 拖拽时幽灵元素跟随鼠标，原位置显示虚线占位符
- 支持自动滚动（鼠标靠近屏幕边缘时自动滚屏）
- 毛玻璃模式下拖拽期间自动禁用卡片的 backdrop-filter，保证动画流畅

### 主题与风格

- **亮/暗模式** — 一键切换，跟随系统偏好，状态持久化
- **纯色/毛玻璃风格** — 独立于亮暗模式，可自由组合（共 4 种视觉组合）
- 毛玻璃模式使用 backdrop-filter 实现 iOS 风格高斯模糊，经过专项性能优化
- 工具栏右上角三个按钮：语言切换 🌐、风格切换 💎、亮暗切换 🌙

### 国际化

- 中英文一键切换，界面文字、placeholder、tooltip 同步更新
- 语言偏好持久化到 localStorage

### 数据管理

- **导出 JSON** — 一键下载完整数据文件
- **导入 JSON** — 选择文件导入，自动补齐 Albums/Singles 分组
- **从 txt 生成** — 通过 `node gen.js` 从源文件生成数据并嵌入到 index.html
- Vol sections（如 `Vol. 1 - 2025`）解析时自动合并到对应年份
- 数据加载优先级：`localStorage > __MUSIC_DATA__（嵌入数据）> data.json`

---

## 快速开始

```bash
# 1. 将 txt 源文件放到项目根目录
# 2. 生成数据（嵌入到 index.html + 写入 data.json）
node gen.js

# 3. 双击 index.html 即可使用
```

也可以指定文件路径：

```bash
node gen.js path/to/your/file.txt
```

浏览器中的所有编辑操作自动保存到 localStorage，无需服务器。

---

## txt 源文件格式

```
2025
1. Album Title - Artist Name <85> 12.15 EP
2. Another Album - Another Artist <92>
3. No Score Album - Someone <NR> Mixtape

P.S.
Single Title - Artist Name <88> 03.20
Another Single - Another Artist <75>

AOTY
Best Album of the Year 95/100
Great Artist
乐评内容写在这里，可以多行...
第二行评论...

2024
1. Classic Album - Legendary Artist <100>
...

Vol. 1 - 2025
3. Extra Album - New Artist <88> 06.01
```

### 格式规则

| 元素 | 格式 | 示例 |
|------|------|------|
| 年份标题 | 4 位数字单独一行 | `2025` |
| Vol 标题 | `Vol. 编号 - 年份` | `Vol. 1 - 2025`（自动合并到对应年份） |
| 专辑条目 | `序号. 标题 - 艺术家 <分数>` | `1. Album - Artist <85>` |
| 带日期 | 行尾加 `MM.DD` | `1. Album - Artist <85> 12.15` |
| 标签 | 行尾加标签名 | `... <85> EP` / `... <85> Mixtape` |
| 无分数 | `<NR>` 或省略分数 | `1. Album - Artist <NR>` |
| Singles | `P.S.` 开头的行之后 | 后续条目归入 Singles 分组 |
| AOTY | `AOTY` + 标题 `分数/100` + 艺术家 + 乐评 | 见上方示例 |
| 乐评 | AOTY 块中从第三行开始 | 支持多行，直到下一个标记出现 |

支持的标签：EP、Mixtape、Reissue、Soundtrack、Live、Compilation、Unofficial、DJ Mix、Video

---

## 数据结构

```json
{
  "meta": { "title": "Xan's Music Ratings", "lastUpdated": "2026-05-24" },
  "sections": [
    {
      "id": "2025",
      "title": "2025",
      "groups": [
        {
          "name": "Albums",
          "entries": [
            {
              "id": "a1",
              "title": "Album Title",
              "artist": "Artist Name",
              "score": 85,
              "scoreNote": "",
              "date": "12.15",
              "tags": ["EP"],
              "review": "写几句评论",
              "isAoty": false,
              "isSoty": false,
              "notes": "",
              "tracks": [
                { "name": "Song 1", "score": 90 },
                { "name": "Song 2", "score": 82 }
              ]
            }
          ]
        },
        { "name": "Singles", "entries": [] }
      ]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `score` | `number` / `null` | 0–100 整数，`null` 表示未评分 |
| `scoreNote` | `string` | 特殊标记，如 `"NR"`、`"Top1"` |
| `tags` | `string[]` | 标签数组，从预设列表中选取 |
| `isAoty` | `boolean` | 年度专辑标记，渲染时动态归入 AOTY 组 |
| `isSoty` | `boolean` | 年度单曲标记，渲染时动态归入 SOTY 组 |
| `tracks` | `array` | 可选的音轨评分数组 |
| `review` | `string` | 乐评文本，AOTY 卡片中可展开/收起 |
| `notes` | `string` | 附加备注 |

---

## 项目结构

```
├── index.html             # 入口文件，包含 __MUSIC_DATA__ 占位符
├── css/
│   ├── base.css           # CSS 变量、Reset、亮/暗/毛玻璃主题
│   ├── layout.css         # 侧边栏、工具栏、下拉菜单布局
│   └── components.css     # 卡片、弹窗、标签、按钮、拖拽占位符、动画
├── js/
│   ├── state.js           # 全局状态变量
│   ├── i18n.js            # 中英文翻译字典、t() 函数
│   ├── utils.js           # 工具函数、数据迁移、分组选择器
│   ├── filter.js          # 多选筛选、搜索、卡片缓存
│   ├── modal.js           # 编辑弹窗、音轨评分
│   ├── render.js          # 侧边栏 + 内容区渲染、拖拽排序
│   └── app.js             # 初始化、主题切换、localStorage 持久化、导入导出
├── gen.js                 # txt → JSON 解析器，嵌入数据到 index.html
├── data.json              # gen.js 生成的 JSON 备份
├── README.md              # 项目说明
└── CLAUDE.md              # Claude Code 开发指南
```

JS 加载顺序：`state.js` → `i18n.js` → `utils.js` → `filter.js` → `modal.js` → `render.js` → `app.js`

---

## 技术栈

纯原生 HTML / CSS / JavaScript，无框架、无打包工具、无外部依赖。

- **设计语言** — iOS 15（SF Pro 字体、圆角卡片、半透明层叠）
- **持久化** — localStorage，编辑即时自动保存
- **拖拽** — Pointer Events + FLIP 动画（`0.25s cubic-bezier(0.2, 0, 0, 1)`）
- **毛玻璃** — `backdrop-filter: blur()` + `will-change: transform` + `contain: layout style paint` GPU 加速
- **背景** — `position: fixed` 伪元素渐变背景，替代 `background-attachment: fixed` 提升滚动性能
- **国际化** — `data-i18n` 属性标记 + `applyI18nToDOM()` 批量替换

---

## localStorage 键值

| Key | 类型 | 说明 |
|-----|------|------|
| `musicData` | JSON 字符串 | 完整 sections 数据，编辑后自动保存 |
| `lang` | `"en"` / `"zh"` | 界面语言偏好 |
| `theme` | `"light"` / `"dark"` | 亮/暗模式 |
| `style` | `"solid"` / `"glass"` | 纯色/毛玻璃风格（默认 glass） |
| `mustHearThreshold` | 数字字符串 | 必听专辑分数阈值，默认 `80` |
| `mustHearEnabled` | `"true"` / `"false"` | 必听专辑功能开关，默认 `true` |

---

## 键盘快捷键

| 快捷键 |