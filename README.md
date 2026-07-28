# Xan's Music Ratings Desktop

面向个人长期收藏的 Windows 音乐评分与乐评管理工具，基于 Tauri v2、Rust 和 WebView2。

它不是音乐播放器，也不是在线社区，而是一套用于整理专辑、单曲、年度选择、曲目评分和长评的本地桌面工作台。数据和封面保存在自己的电脑上，可随时导入或导出 JSON。

> 本仓库只维护桌面版，不提供网页版。`desktop-ui/` 是打包进 exe 的 WebView2 界面资源，不是独立网站。

## 下载

前往 [GitHub Releases](https://github.com/DEVILISALIE/Xan-s-Music-Ratings-Data/releases) 下载 Windows MSI 安装包。

当前版本：`v1.4.1`

## 特色功能

### 年代化音乐档案

- 按年份或年代组织 Albums 和 Singles，从 1950s 延伸到当前年份
- 侧边栏精确导航到 AOTY、Albums、SOTY、Singles，滚动时自动同步高亮
- 不同年代使用针对性的自动排序规则，年度最佳条目始终置顶
- 支持搜索标题、艺术家、分数备注、笔记和乐评，并可循环跳转结果

### AOTY / SOTY 年度体系

- 专辑可标记为 AOTY，单曲可标记为 SOTY，并使用独立的大卡片展示
- 年度卡片集中呈现封面、评分、标签和可展开长评
- AOTY 与 SOTY 同时参与筛选和侧边栏导航，不需要维护重复条目
- Albums 中达到自定义阈值的高分作品可自动显示 `Must Hear Album`

### 从总分深入到每首曲目

- 每个条目可记录总分、日期、标签、分数备注、笔记和完整乐评
- 支持逐首曲目评分，`NR` 可表示已听但暂不评分
- 支持多碟专辑，分别统计每碟平均分，并在卡片上显示碟数与曲目数
- 可按目标数量批量补齐或删减曲目行，适合录入完整 tracklist
- 卡片支持复制并粘贴到编辑弹窗，快速创建结构相近的条目

### 本地封面与视觉管理

- 支持上传本地封面或填写图片 URL
- 自动生成最长边 256px 的缩略图，列表只加载可视区域附近的封面
- 编辑弹窗按需读取原图；双击可全屏查看，并支持缩放和平移
- 本地封面与 JSON 数据分开保存，更换和移除时同步清理相关缓存

### 为桌面环境设计

- 无原生菜单栏的自定义毛玻璃标题栏，支持置顶、全屏、最小化和最大化
- 系统托盘、单实例运行、原生文件对话框和全局快捷键
- 点击关闭按钮隐藏到托盘；从托盘退出时等待最新数据写入磁盘
- 亮暗主题、纯色/毛玻璃风格、浅色背景色调和中英文界面
- 针对高刷新率滚动优化合成、封面加载和导航同步；可选显示平均 FPS 与 `1% LOW`

## 功能概览

| 范围 | 能力 |
|---|---|
| 浏览 | 年份/年代分区、分组导航、滚动高亮、搜索结果翻页 |
| 筛选 | 标签多选、分数区间、NR、AOTY/SOTY 组合筛选 |
| 编辑 | 总分、日期、标签、备注、长评、封面、曲目与多碟信息 |
| 排序 | 同组拖拽、年代规则自动排序、AOTY/SOTY 置顶 |
| 批量 | Shift 范围选择、批量标签、批量移动、批量添加曲目 |
| 统计 | 专辑/单曲平均分、分数分布、已评分/未评分、年度平均分 |
| 外观 | 中英文、亮暗模式、纯色/毛玻璃、背景色调 |
| 数据 | 磁盘自动保存、备份恢复、JSON 导入导出、txt 数据生成 |

## 数据与可靠性

主数据保存在：

```text
%APPDATA%\com.xan.music-ratings\music-data.json
```

本地封面和缩略图保存在：

```text
%APPDATA%\com.xan.music-ratings\covers\
%APPDATA%\com.xan.music-ratings\covers\.thumbnails\
```

数据保护机制：

- 磁盘 JSON 是主数据源，`localStorage.musicData_desktop` 仅作为 WebView2 本地镜像
- Rust 写盘前校验 JSON，每次覆盖前生成 `.json.bak`
- 主文件无法读取时自动尝试备份文件
- 前端保存使用并发锁，连续编辑不会让较旧写入覆盖新数据
- 托盘退出时先等待保存完成，并保留超时退出保护
- JSON 导入会校验并修复 section、group、entry 和 track 字段

建议仍定期使用“导出 JSON”保存一份独立备份。

## 基本使用

1. 点击右下角 `+` 新建专辑或单曲。
2. 在编辑弹窗填写评分、日期、标签、乐评和曲目。
3. 通过侧边栏切换年份，使用工具栏搜索或组合筛选。
4. 在设置菜单调整主题、毛玻璃、语言、批量模式和帧率显示。
5. 使用导入/导出 JSON 在安装、迁移或备份时转移数据。

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+S` | 导出 JSON |
| `Ctrl+O` | 导入 JSON |
| `Ctrl+D` | 切换亮暗主题 |
| `Ctrl+G` | 切换纯色/毛玻璃 |
| `Ctrl+K` | 聚焦搜索 |
| `Ctrl+N` | 新建条目 |
| `Ctrl+T` | 窗口置顶 |
| `F11` | 全屏 |
| `Shift+Enter` | 保存编辑 |
| `Escape` | 关闭弹窗或菜单 |

## 开发与构建

环境要求：

- Windows 10/11
- Node.js 与 npm
- Rust stable toolchain
- WebView2 Runtime
- Visual Studio C++ Build Tools

安装依赖并启动开发模式：

```bash
npm install
npm run tauri dev
```

构建正式 exe 和 MSI：

```bash
npm run tauri build
```

输出位置：

```text
src-tauri/target/release/music-ratings.exe
src-tauri/target/release/bundle/msi/
```

## 项目结构

```text
├── desktop-ui/               # 打包进 WebView2 的桌面界面
│   ├── index.html
│   ├── css/                  # 基础、布局、组件和桌面专属样式
│   └── js/                   # 状态、渲染、筛选、弹窗、拖拽和桌面适配
├── src-tauri/                # Rust 后端、窗口、托盘和原生命令
├── build-frontend.js         # 将 desktop-ui 复制到 Tauri dist
├── dev-server.js             # 桌面开发模式资源服务器
├── dev-server.vbs            # 隐藏服务器控制台窗口
├── gen.js                    # txt 转桌面内置数据
├── package.json
└── CLAUDE.md
```

界面脚本加载顺序：

```text
state.js -> i18n.js -> utils.js -> dialog.js -> filter.js
-> modal.js -> render.js -> drag.js -> app.js
```

## 从 txt 生成内置数据

将源 `.txt` 文件放在项目根目录后运行：

```bash
node gen.js
```

也可以指定文件：

```bash
node gen.js path/to/source.txt
```

生成器会更新 `desktop-ui/index.html` 中的 `__MUSIC_DATA__`，并写入被 Git 忽略的 `desktop-ui/data.json`。`Vol. N - YYYY` 分区会自动合并到对应年份。

## 最近版本

`v1.4.1` 主要加入卡片复制粘贴、FPS/1% Low 监视器和封面缩略图，并优化高刷新率滚动、拖拽、搜索状态同步与封面读取安全。完整变更与安装包见 [v1.4.1 Release](https://github.com/DEVILISALIE/Xan-s-Music-Ratings-Data/releases/tag/v1.4.1)。
