# Xan's Music Ratings Desktop

Windows 桌面版个人音乐评分与乐评管理工具，基于 Tauri v2、Rust 和 WebView2。

本仓库只维护桌面版源码，不提供网页版，也不用于静态网站部署。`desktop-ui/` 是打包进 exe 的 WebView2 界面资源，不是独立网页发行物。

## 下载

从 [GitHub Releases](https://github.com/DEVILISALIE/Xan-s-Music-Ratings-Data/releases) 下载最新的 Windows MSI 安装包。

当前版本：`v1.4.1`

## 主要功能

- 按年份和年代管理 Albums、Singles、AOTY 与 SOTY
- 专辑和单曲评分、标签、日期、备注、长评与多碟曲目评分
- 搜索、结果翻页、多条件筛选和年度平均分统计
- 卡片拖拽排序、批量选择、批量标签及跨分组移动
- 卡片复制粘贴，快速创建内容相近的条目
- 本地封面上传、URL 封面、缩略图懒加载和全屏查看
- 中英文切换、亮暗主题、纯色与毛玻璃风格、背景色调
- 自定义 Windows 标题栏、窗口置顶、全屏、系统托盘和单实例运行
- 全局快捷键与原生 JSON 导入、导出对话框
- 可选平均 FPS 与 `1% LOW` 帧率显示

## 桌面数据

主数据保存在：

```text
%APPDATA%\com.xan.music-ratings\music-data.json
```

每次写入前会自动生成 `.json.bak` 备份。桌面 WebView2 的 `localStorage.musicData_desktop` 只作为本地镜像，磁盘 JSON 始终是主要数据源。

本地封面位于同一应用数据目录下的 `covers/`，缩略图位于 `covers/.thumbnails/`。

## 开发

环境要求：

- Windows 10/11
- Node.js 与 npm
- Rust stable toolchain
- WebView2 Runtime
- Visual Studio C++ Build Tools

安装依赖：

```bash
npm install
```

启动桌面开发模式：

```bash
npm run tauri dev
```

构建正式 MSI 和 exe：

```bash
npm run tauri build
```

主要输出：

```text
src-tauri/target/release/music-ratings.exe
src-tauri/target/release/bundle/msi/
```

## 项目结构

```text
├── desktop-ui/               # 仅供桌面 WebView2 使用的内嵌界面
│   ├── index.html
│   ├── css/
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   └── macos.css         # Tauri 桌面窗口专属样式
│   └── js/
│       ├── state.js
│       ├── i18n.js
│       ├── utils.js
│       ├── dialog.js
│       ├── filter.js
│       ├── modal.js
│       ├── render.js
│       ├── drag.js
│       └── app.js
├── src-tauri/                # Rust 后端、窗口、托盘和原生命令
├── build-frontend.js         # 将 desktop-ui 复制到 Tauri dist
├── dev-server.js             # 桌面开发模式资源服务器
├── dev-server.vbs
├── gen.js                    # 从 txt 生成桌面内置数据
├── package.json
└── CLAUDE.md
```

## 数据生成

将源 `.txt` 文件放在项目根目录，运行：

```bash
node gen.js
```

或指定源文件：

```bash
node gen.js path/to/source.txt
```

生成器会更新 `desktop-ui/index.html` 中的 `__MUSIC_DATA__`，并写入被 Git 忽略的 `desktop-ui/data.json`。

## v1.4.1

相对 `v1.4.0` 的桌面版更新：

### 新增

- 普通卡片和 AOTY/SOTY 卡片支持复制，编辑弹窗支持粘贴主要字段、标签、乐评和曲目
- 设置菜单新增帧率显示开关，标题栏显示平均 FPS 与 `1% LOW`
- Rust 后端生成最长边 256px 的 PNG 封面缩略图
- 搜索支持 Enter 和点击图标立即执行

### 性能

- 针对 165Hz 显示器优化滚动和合成路径
- 顶部工具栏滚动时始终保留真实毛玻璃效果
- 卡片取消逐卡模糊、入场动画和常驻 `will-change`
- 封面通过 `IntersectionObserver` 懒加载，单并发读取并使用 96 项 LRU 缓存
- 滚动导航缓存分组位置并使用二分查找
- 拖拽 Pointer Move 合并到 `requestAnimationFrame`，幽灵卡片使用 `translate3d`

### 修复

- 编辑、新建和排序后同步刷新搜索结果引用与计数
- 使用请求序号避免封面异步串图
- 封面按完整文件 stem 匹配，避免相似 ID 误命中
- 导入同一个 JSON 文件时可以连续重复触发
- 桌面数据固定使用 `musicData_desktop`，避免旧浏览器数据覆盖桌面磁盘数据

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

## 安全与可靠性

- Rust 写盘前校验 JSON，写入前自动备份，主文件异常时尝试恢复备份
- 前端保存使用并发锁，退出应用前等待最新数据落盘
- JSON 导入执行结构和字段类型校验
- 用户内容进入 HTML 前统一转义
- 封面限制为支持的图片格式和 20MB 大小，并校验 entry ID
