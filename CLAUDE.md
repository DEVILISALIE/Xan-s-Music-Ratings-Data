# CLAUDE.md

## 语言要求

对话中必须使用中文回答用户，代码注释和解释说明也使用中文。

## 工作规则（必须遵守）

1. **默认只编译预览页**：日常修改、问题修复与功能调优完成后，默认只构建 HTML 预览页（`npm run build:preview` 或 `node build-preview.js`），便于快速秒级验证。
2. **打包 exe 权限与直接覆盖桌面**：**只有当用户明确说要打包 exe（如「打包 exe」「构建 exe」「编译 exe」）时，才允许运行 `npm run tauri build`**。打包完成后，exe 程序**直接覆盖桌面路径**：
   `C:\Users\lilxanyy\Desktop\music-ratings.exe`
   **牢记：用户日常只直接在桌面运行 exe，打包完成后直接覆盖桌面的 exe，而不是向用户汇报或指向 `C:\Users\lilxanyy\Desktop\music-ratings-main\src-tauri\target\release\music-ratings.exe`。**
3. **GitHub 发布权限**：只有用户明确说要发布/上传 GitHub（如「发布 github」「上传 github」「更新 release」）时，才允许 `git push`、创建/更新 GitHub Release、上传安装包。未明确要求时，禁止发布到 GitHub。

## 项目简介

Windows 桌面版交互式乐评管理应用，采用 iOS 风格界面。用户可在 Tauri WebView2 窗口中编辑分数、评论、标签和曲目，支持中英文切换、亮/暗主题、纯色/毛玻璃风格。

通过 `node gen.js` 从 txt 源文件生成数据并嵌入 `desktop-ui/index.html`。Vol sections 自动合并到对应年份。

应用基于 Tauri v2（Rust + WebView2），Windows 专用，包含自定义标题栏（无原生菜单栏）、系统托盘和全局快捷键。`desktop-ui/` 仅是打包进 exe 的内嵌界面，不作为网页版发布。

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
├── desktop-ui/            # 仅供桌面 WebView2 使用的内嵌界面
│   ├── index.html         # 入口，包含 __MUSIC_DATA__ 占位
│   ├── css/
│   │   ├── base.css       # CSS 变量、Reset、主题
│   │   ├── layout.css     # 侧边栏、工具栏、下拉菜单布局
│   │   ├── components.css # 卡片、弹窗、标签、按钮、动画
│   │   └── macos.css      # Tauri 窗口专属样式
│   └── js/                # 状态、渲染、筛选、弹窗、拖拽与桌面适配
├── gen.js                 # txt → JSON，嵌入 desktop-ui/index.html
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
| `musicData_desktop` | JSON 字符串 | 桌面版 localStorage 镜像；磁盘 JSON 仍是主数据源 |
| `lang` | `"en"` / `"zh"` | 界面语言偏好 |
| `theme` | `"light"` / `"dark"` | 亮/暗模式 |
| `style` | `"solid"` / `"glass"` | 纯色/毛玻璃风格（默认 glass） |
| `mustHearThreshold` | 数字字符串 | 必听专辑分数阈值，默认 `80` |
| `mustHearEnabled` | `"true"` / `"false"` | 必听专辑功能开关，默认 `true` |
| `bgHue` | `"default"` / `0–360` 数字字符串 | 浅色背景色调（仅浅色生效），默认 `default` |
| `showFps` | `"true"` / `"false"` | 桌面标题栏 FPS/1% Low 监视器，默认关闭 |
| `customFontZh` | 字符串 | 用户选中的全局中文字体（如 `"PingFang SC"`、`"华文楷体"` 等），默认 `"PingFang SC"` |
| `customFontEn` | 字符串 | 用户选中的全局英文字体（如 `"-apple-system"`、`"Georgia"` 等），默认 `"-apple-system"` |
| `customFontWeight` | 数字字符串 | 用户自定义全局字重（`100`–`900`），默认 `400` |
| `customFontWeightEnabled` | `"true"` / `"false"` | 自定义字重开关，默认 `false` |

## v1.6.5 更新（相对 v1.6.4）

- **弹窗分区下拉菜单体验全面革新与几何重构**：
  - **选项卡片与滚动条间距优化（彻底消除重叠）**：为分区下拉菜单预留专属 16px 呼吸间距（`padding: 4px 16px 4px 4px`），选项卡片右边缘与悬浮展开的自研滚动条滑块（宽 8px）始终保持 6px 安全呼吸间隙，高亮选中的蓝色背景卡片不再穿透压盖在滚动条下方；
  - **滚动条操作防误关机制**：为悬浮滚动条的轨道与滑块深度集成事件阻断与拖拽保护，修复点击或按住滑块拖拽滚动条时将操作误判为「点击外部」导致小面板被强行关闭的问题；
  - **零延迟物理焊死跟随（Zero-frame Lag）**：彻底剔除滚动事件中的 `requestAnimationFrame` 异步节流与旧版重定位中的闪烁清空逻辑，当弹窗滚动时在同一微任务内同步计算并写入坐标，下拉菜单与悬浮滚动条以 0 像素误差死死焊在触发框正下方，杜绝漂浮脱节；
  - **严格避险动态翻转与宽物理死区（彻底根除上下乱跳）**：彻底拔除中心线敏感判定，引入单向视口边缘溢出避险引擎，自带 90px~200px 物理死区；在常规中段滚动时坚决死死焊住不乱跳，仅在视口边缘真实受挤压（如菜单顶部触碰屏幕天花板）且另一侧空间充足时，才敏捷果断地跳向空间充裕一侧，体验极为平稳丝滑。

## v1.6.4 更新（相对 v1.6.3）

- **跑道开关按钮微动效与物理交互革新（Apple Design）**：
  - **白圈破框悬浮与柔和环境散射微光**：开关按钮仅在光标移入中间白色圆圈（`.toggle-knob`）时触发 `scale(1.22)` 破框微浮与温润克制的环境散射高光，跑道底框与文字区域保持纯净，移除整行误触判定，判定范围随圆圈物理移动实时更新；
  - **自然按压下潜受压感（Kill Latency）**：圆圈按下时敏捷下沉受压缩小至跑道内（`scale: 0.92`），释放后物理阻尼弹回，极具轻盈触感；
  - **保持高亮悬浮滑向对侧并在终点悬浮短暂停留**：圆圈滑向对侧的全程（320ms）保持破框高亮微浮姿态，滑到位后在终点稳定悬浮保持一小段时间（约 80ms）；
  - **光标未移动更新时自主脱离判定**：若滑到位后光标停留在原地未移动跟来，400ms 定时器触发自主脱离（`.disengaged`），在 320ms 阻尼过渡内优雅平缓降落变回原样（`scale: 1`）并自然熄灭环境微光；光标重新移入新圆圈时无缝唤醒高亮悬浮态；
- **搜索卡片与侧边栏年份高光双向联动修复**：
  - **根治 1.5 秒后错误回跳**：彻底修复在搜索模式下卡片居中滚动后，1.5 秒定时器超时错误调用普通视口顶部滚动算法导致侧边栏高光跳到上方错误年份的顽固问题，精准锁定搜索卡片所属真实年份；
  - **双向高光实时响应**：侧边栏与当前视口搜索卡片始终保持 1:1 双向高亮同步，滚动或翻页时绝无闪烁跳动；
- **文字高浮抗模糊体系扩展与界面渲染调优**：
  - **字体清晰度抗锯齿体系扩展**：统一全站标签与悬浮组件在 GPU 合成加速下的字体清晰度渲染（`subpixel-antialiased` 与 `optimizeLegibility`），杜绝直接放大造成的模糊与锯齿；
  - **portal 下拉菜单与交互体验加固**：优化了设置下拉菜单及各类 portal 的定位稳定性，避免快速触发时的瞬态几何偏差与无限 rAF 递归开销。

## v1.6.3 更新（相对 v1.6.2）

- **大图/高分辨率封面上传彻底根治闪退**：
  - **移除失控的物理工作集回收线程**：彻底排查并移除了此前每 1.5 秒死循环调用 `EmptyWorkingSet` 回收整个进程与 WebView2 所有渲染管线物理内存的后台线程；在用户上传与解码高分辨率大图（如 3000×3000、几兆到十几兆）时，Windows 不再因物理页频繁置换（Page Thrashing）导致进程挂起死锁或被系统杀掉闪退；
  - **Rust 端图像处理内存加固与异常熔断保护**：在 `create_cover_thumbnail` 中增加 `image::Limits` 边界保护（宽度/高度限制 10000px，单图内存配额 256MB），配合 `catch_unwind` 彻底捕获图像解码异常，杜绝 Panic 闪退；引入 `IS_PROCESSING_IMAGE` 原子锁，确保在图像 IO 和缩略图生成期间完全屏蔽外部内存回收；
- **桌面版冷启动秒开极速优化**：
  - **恢复 WebView2 磁盘着色器缓存与 V8 吞吐**：移除阻断启动性能的 `--disable-gpu-shader-disk-cache` 与 `--max-semi-space-size=4` 启动参数，恢复 Chromium 原生极速图形着色器缓存；
  - **冷启动零多余写盘**：启动时检测到磁盘已有最新数据时跳过重复的磁盘保存（`await saveData()`），避免启动时的同步 IO 阻塞；localStorage 同步改为后台非阻塞空闲写入；
  - **首屏渐进直出机制**：采用两阶段渐进直出（优先挂载前 3 个年份分区），首屏瞬时直出 DOM 减少 95%，搭配 `show_main_window` 瞬开；第二阶段无感挂载剩余年份，并具备防竞态保护与搜索 DOM 一致性同步；
- **编辑详情页与大图查看器恢复高清原画**：
  - **编辑详情页原画质感**：编辑详情页的封面预览不再使用小尺寸模糊缩略图，而是优先无损载入本地原始高清大图（`read_cover`），在大屏幕上展现极致清晰的专辑细节；
  - **大图查看器保护机制**：Logo 三击查看应用图标时增加传参保护，避免被当前选中卡片的封面异步覆盖；
  - **幽灵残影与缓存防护**：条目切换或封面移除时及时清理 DOM 图片引用，修复了无缩略图或读取失败时上一条目封面残存的问题；工具栏条目总计统计改为直接读取 `appData`，消除了首屏数字跳动。
- **搜索卡片与侧边栏年份高光一一对应**：
  - **根治 1.5 秒后错误回跳**：修复了在搜索模式下卡片居中滚动后，1.5 秒定时器超时错误调用普通页面视口顶部（top <= 60px）滚动同步算法导致高光跳到上方错误年份的问题；
  - **全场景双向精准联动**：引入 `getNavGroupForCard` 精准映射体系，在翻页切换（↑/↓/下一个按钮）、点击卡片以及搜索浏览全过程中，侧边栏年份分区高光始终与当前选中的搜索卡片保持 100% 绝对一致并展开对应分区，清空搜索时平滑复原。

## v1.6.2 更新（相对 v1.6.1）

- **专辑/单曲标签智能流体收起与展开（Apple Design）**：
  - **业务规则与分区联动**：针对 EP、Mixtape、Live 等仅对专辑适用的标签，在添加或编辑条目时若切换到 Singles 分组，自动优雅收起；切回 Albums 分组时反向平滑展开；单曲保存时自动排除专辑标签，避免脏数据残留；
  - **流体动画质感**：基于 Apple 流体界面规范，采用现代 CSS `grid-template-rows: 0fr ↔ 1fr` 物理轨道折叠技术与 Apple 签名曲线 `cubic-bezier(0.32, 0.72, 0, 1)`（360ms），搭配 `translateY(-8px)`、`scale(0.98)` 与先行淡出，平稳舒展、克制高级，下方表单与曲目列表平滑顺推排开；
  - **开窗瞬态无动画机制**：点击专辑卡片打开弹窗直接静态完全展示（无展开动画），点击单曲卡片打开弹窗直接静态隐藏折叠（无收起动画），通过双重 rAF 与强制回流彻底消除开窗瞬间的微动闪烁，仅在用户手动下拉切换分区时展现物理动画。

## v1.6.1 更新（相对 v1.6.0）

- **弹窗遮罩层级与交互修复**：修复桌面模式下右下角悬浮按钮（新建 `+`、搜索翻页 `↑` / `↓`）原本 `z-index: 200` 高于弹窗遮罩层（`100`）导致穿透突兀、未被毛玻璃变暗模糊且拦截背景点击的问题；将桌面端 FAB z-index 调整为 `60`，日常保持在各内容层上方，进入编辑或各类弹窗时完全被全屏遮罩覆盖，视觉上融入背景，点击按钮区域由遮罩捕获直接触发取消退出。
- **年度平均分柱状图基准优化**：修复年度平均分（专辑 / 单曲）水平柱状图此前以历年最高平均分（`maxAvg`）作为分母导致 90 分就 100% 填满轨道的逻辑缺陷；统一改为以满分 100 分为标准基准满格显示（`pct = Math.min(100, Math.max(0, row.avg)).toFixed(1)`），距离满分的差距与比例真实直观呈现。

## v1.6.0 更新（相对 v1.5.4）

- **全局字体与字重体系**：
  - **中英双语分开独立选择**：提供中文与英文字体独立 Tab 切换与配置。默认采用 Apple 原生苹方（PingFang SC）与 SF Pro 黄金混排搭配；中文模式下中英文分开选择，英文模式下专注纯西文字体列表。
  - **Rust 后端原生枚举本机系统字体**：通过 Windows GDI `EnumFontFamiliesExW` 原生枚举本机 500+ 款已安装字体（过滤 `@` 垂直字体并去重排序），前端结合汉字 Unicode 与 30+ 拼音关键字精准归类；字体列表项以自身真实字形自渲染展示。
  - **100–900 无极字重调节**：滑块支持全档位字重平滑微调（步长 50），现代变长字体（Variable Fonts）原生平滑无级粗细渐变，传统字体引擎智能微合成。
  - **双层字重精准加权体系**：基准字重（`--custom-font-weight`）控制常规文本、标签、乐评与列表；加权层（`calc(var(--custom-font-weight) + 150)`）智能强化卡片分数徽标、大标题、年份与主操作按钮，维持排版主次节奏。
  - **全域穿透与无缝继承**：字体族与字重下发覆盖全站主界面、专辑卡片、年份侧边栏、工具栏、统计面板、二级编辑菜单、各种下拉菜单及各类弹窗。
- **高质感效果实时双向预览**：
  - 字体设置弹窗内嵌独立预览卡片（`.font-preview-card`），中英文模式动态切换示范专辑与混排评语，双向联动字形与粗细。
  - 预览卡片针对极窄视口（低于 480px）与特大字号深度适配，建立安全边距与盒模型溢出保护，接入 `text-wrap: balance / pretty`、`overflow-wrap: break-word` 与连字符自动断词（`-webkit-hyphens: auto`）。
- **一键恢复默认**：随时可一键重置为初始调校的苹方 + SF Pro 黄金比例。

## v1.5.0 更新（相对 v1.4.3）

- **全新原生 macOS 鼠标光标体系**：应用内全场景接入矢量级 macOS 原生光标（默认黑底白边经典箭头、交互元素圆润白手套食指指针、文本与数值编辑框 Apple 经典双向衬线工字钢 I-Beam、拖拽与图片查看器开掌/闭掌抓手光标），提供纯正的 macOS 桌面级操作手感。
- **设计工程微动效体系（Emil Kowalski / Apple Design Engineering）**：
  - **全局分数统计面板动效**：7 档分数分布柱状图引入 30ms 阶梯级联延展动画（`barGrow`）；支持单行悬停探索反馈（Row Exploration，文字高亮、柱状条增亮 15%、计数位移）；统计大卡片支持悬停等比放大（`scale(1.03)`）与按压下压回弹（`scale(0.97)`）。
  - **年度统计弹窗体验重构**：去除多余横向滚动条，优化盒模型与自适应宽度，支持单年数据悬停探索与柱状图自适应延展。
  - **编辑弹窗质感与防闪烁优化**：消除弹窗打开时因子层嵌套 `backdrop-filter` 导致的输入框纯白闪烁（FBO 隔离渲染问题）；统一曲目序号胶囊、封面操作按钮与输入框的质感底色与焦点高亮圈。
  - **搜索键盘快捷翻页**：搜索模式下支持使用键盘 ↑ / ↓ 方向键在匹配结果间丝滑循环翻页跳转。

## v1.4.3 更新（相对 v1.4.2）

- **搜索结果顺序修复**：搜索结果中新增符合关键词的专辑或单曲后，上下切换按钮会继续按照发行时间和当前卡片排序规则排列，避免新条目固定追加到结果末尾。

## v1.4.2 更新（相对 v1.4.1）

GitHub 上一次正式 Release 为 `v1.4.1`（commit `93cef28`，2026-07-28）。v1.4.2 主要修复桌面版侧边栏分组导航的滚动定位：

- **侧边栏导航定位**：以目标分组第一张可见卡片为定位基准，使用卡片与粘性工具栏的实际视口坐标计算滚动位置，确保卡片上沿贴在工具栏下方
- **连续导航稳定性**：点击新的年份分组时先停止旧的平滑滚动，移除固定延迟的 `scrollBy` 强制校准，避免动画末尾突然吸附以及连续点击后目标再次被工具栏遮挡
- **边界处理**：滚动目标限制在主内容区可用的滚动范围内，底部内容不足以完全对齐时保持浏览器允许的最大滚动位置

## v1.4.1 更新（相对 v1.4.0）

GitHub 上一次正式 Release 为 `v1.4.0`（commit `ede5a58`，2026-07-14）。v1.4.1 包含其后的全部桌面版更新：

- **卡片复制粘贴**：普通卡片和 AOTY/SOTY 卡片 hover 显示复制图标；`copyEntry()` 将标题、艺术家、分数、日期、分数备注、标签、乐评、曲目和备注复制到内存剪贴板，编辑弹窗 `pasteEntry()` 填充主要可编辑字段；复制成功使用 `.toast` 提示，封面不复制
- **帧率监视器**：设置菜单新增桌面专属 `settingsFpsToggle`；标题栏版本号旁显示最近 600 帧平均 FPS 与 `1% LOW`，500ms 更新一次，至少收集 30 帧才显示；使用固定容量环形缓冲区，关闭后 `cancelAnimationFrame` 并清空样本，偏好键为 `showFps`
- **搜索交互**：保留 200ms debounce，同时支持 Enter 和点击 `.search-icon` 立即调用 `doSearch()`；局部更新、新建和自动排序替换卡片后同步维护 `searchResults`、计数器和前后翻页按钮
- **导入交互**：使用常驻 `#importFileInput` + `change` 监听，不再每次动态创建 input；选择完成后清空 value，允许连续导入同一个文件
- **存储键迁移**：桌面版固定使用 `musicData_desktop`，避免旧版浏览器存储数据覆盖磁盘主数据
- **封面缩略图**：Rust 新增 `read_cover_thumbnail`，用 `image` crate 生成最长边 256px 的 PNG 到 `covers/.thumbnails/`；前端通过 `IntersectionObserver` 在可视区前后 160px 内单并发加载，使用 96 项 LRU 缓存和请求去重
- **封面预览生命周期**：编辑弹窗只在需要时读取原图，关闭时释放预览与查看器引用；`coverPreviewRequestId` 防止快速切换条目时旧请求覆盖新预览；上传/替换/移除时调用 `invalidateCoverThumbnail()`
- **封面安全**：`validate_entry_id()` 拒绝空 ID、`.`、`..` 和路径分隔符；`find_cover_file()` 按完整 file stem 匹配，避免 `a1` 命中 `a10`；上传和原图读取统一 20MB 上限，缩略图读取上限 2MB；新增 2 个 Rust 单元测试
- **高刷新率滚动**：桌面卡片取消逐卡 `backdrop-filter`、初始入场动画和常驻 `will-change`，使用半透明背景；工具栏保持真实 `blur(20px) saturate(180%)` 并用 `translateZ(0)` 固定为独立合成层，滚动时不再切换或降级毛玻璃样式
- **滚动同步**：缓存 group 绝对位置，滚动时以二分查找定位当前 group；监听器 passive、32ms 限流，`ResizeObserver` 在内容高度变化时重建缓存，只切换前后两个 active 导航项
- **拖拽性能**：pointer move 合并到单个 rAF，幽灵卡片用 `translate3d`；自动滚动速度改为每秒单位并按帧时间增量计算；全局非被动 wheel 监听改为仅在实际拖拽时注册，结束立即移除
- **其他热路径**：无打开 portal 时 `schedulePortalReposition()` 直接返回；默认浅色背景不执行 `hue-rotate(0deg)`；编辑/新增卡片使用短 Web Animations 动画并继续保持局部 DOM 更新

## 关键技术细节

**数据流**：桌面版优先从磁盘文件加载（`AppData/Roaming/com.xan.music-ratings/music-data.json`），再 fallback 到 localStorage 的 `musicData_desktop` 和 `__MUSIC_DATA__`。`ensureDefaultGroups()` 在数据加载后和导入后调用，确保每个 section 都有 Albums/Singles 两个分组。`migrateVolSections()` 自动合并旧版 vol sections。**1950s 分区（v1.3.5）**：桌面版在磁盘加载、localStorage 恢复、内置数据三条路径上都会检查 `sections` 是否已有 `id === '1950s'`；缺失时注入空分区 `{ id: '1950s', title: '1950s', groups: [Albums, Singles] }`，不覆盖已有数据。

**浅色背景色调（v1.4.0）**：仅浅色模式在设置菜单显示「背景色调」区（预设色板 + 0–360 全色谱滑条 + 恢复默认）。纯色改 `--light-bg`，毛玻璃对 `body::before` 做 `hue-rotate`；深色不生效。偏好键 `bgHue`。

**下拉毛玻璃 portal（v1.4.0）**：所有下拉（标签/分数/必听/设置/分组/批量/封面移除/右键）统一无色高模糊；打开时挂到 `body` + `position: fixed`，避免嵌在已有 `backdrop-filter` 的父级里导致模糊失效。宽度：标签/分数/必听/编辑分组 `matchAnchor` 与触发器同宽；设置菜单用自身 min-width。编辑弹窗滚动时 portal 跟随，触发框滚出可视区自动收起。

**数据保护机制**：
- `saveData()` 为 async 函数，内置并发锁（`_saveLock` / `_saveQueued`）防止多次保存冲突，确保最新数据始终被写入
- JSON.parse(localStorage 数据) 有 try-catch 防护，损坏数据不阻断保存
- Rust 端 `save_data_to_disk` JSON 解析失败时返回错误拒绝写入，写入前自动备份到 `.json.bak`
- `load_data_from_disk` 主文件不可用时自动尝试 `.bak` 备份文件
- **即时保存（v1.3.3）**：托盘"退出"不再直接 `app.exit(0)`，改为发送 `request-shutdown` 事件给前端，前端 `await saveData()` 确保磁盘写入完成后调用 `graceful_exit` 延迟 500ms 退出；5秒强制退出保底防卡死
- 桌面版启动时优先从磁盘加载，加载成功后同步到 localStorage 的 `musicData_desktop`

**桌面版（Tauri v2）**：
- 前端通过 `window.__TAURI__` 检测桌面环境，`app.js` 末尾的 `initTauriDesktop()` 自动激活桌面功能
- `desktop-ui/css/macos.css` 通过 `[data-desktop="true"]` 选择器提供桌面窗口专属样式（UI 放大 20%）
- **自定义标题栏**（`decorations: false`）：38px 常驻毛玻璃标题栏，左侧版本号和可选 FPS/1% Low，右侧窗口控件（📌置顶 / ⬚全屏 / —最小化 / □最大化 / ×关闭）。标题栏通过 JS `start_window_drag` 拖拽（不使用 `-webkit-app-region: drag` 以避免系统右键菜单），关闭按钮 hover 变红，最大化/全屏时中间按钮自动切换为还原图标。全屏按钮为四角取景框 SVG 图标，最大化状态下进入全屏先 `unmaximize()` 避免 WebView2 bug
- **Windows 任务栏双向最小化/还原（v1.5.4）**：Rust 端在窗口创建时通过 Win32 API 动态配置 `WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU` 窗口样式并调用 `SetWindowPos(SWP_FRAMECHANGED)`，完美支持 Windows 原生任务栏图标点击最小化与还原双向切换
- 窗口管理通过自定义 Tauri command：`minimize_window`、`toggle_maximize`、`close_window`、`start_window_drag`
- 托盘事件通过 `tauriEvent.listen('menu-action')` 接收，映射到前端函数
- 导出使用 Tauri 原生文件对话框（`__TAURI_PLUGIN_DIALOG__` + `__TAURI_PLUGIN_FS__`）
- 快捷键：Ctrl+S 导出、Ctrl+D 主题、Ctrl+G 风格、Ctrl+O 导入、Ctrl+K 搜索、Ctrl+N 新建、Ctrl+T 置顶、F11 全屏
- **设置按钮**：工具栏 stats 右侧 ⚙ 按钮，点击弹出 iOS 风格下拉菜单，集成深色模式/毛玻璃风格/帧率显示（桌面专属）/语言/多选模式，复用 `.toggle-switch` 样式，点击选项保持展开，点击外部自动关闭
- **系统托盘（v1.5.4）**：配置 `show_menu_on_left_click(false)` 确保仅鼠标右键弹出托盘菜单；托盘双击在后台/最小化时唤起并聚焦窗口，前台已显示时点击不触发最小化
- 点击 X 隐藏到系统托盘（任务栏按钮一并消失，仅保留托盘图标），通过 `on_window_event` 拦截 `CloseRequested` 并 `api.prevent_close()` + `win.hide()`
- 单实例模式：`tauri-plugin-single-instance` 确保只有一个窗口运行，第二次启动聚焦已有窗口
- 桌面版固定使用 `musicData_desktop` 作为 WebView2 本地镜像
- `build-frontend.js` 构建时将 `desktop-ui/index.html`、`desktop-ui/css`、`desktop-ui/js` 和可选 `desktop-ui/data.json` 复制到 `dist/`，再由 Tauri 打包进二进制
- Tauri 插件：dialog、fs、global-shortcut、shell、single-instance；Rust 依赖 `base64` 与 `image`
- **版本号**：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` 当前为 `1.6.5`；标题栏通过 `get_app_version` 读取 package info；About 弹窗文案也写为 `v1.6.5`

**v1.6.5 更新日志**：
- **弹窗分区下拉菜单体验全面重构**：选项卡片预留 16px 呼吸间距，与滚动条滑块保持 6px 安全留白彻底消除重叠；滚动条操作集成全方位冒泡拦截与拖拽保护，杜绝误关面板；弹窗滚动时实行零延迟即时同步，死死焊住触发框；引入严格避险单向边缘翻转引擎与宽物理死区，彻底根除中段滚动上下乱跳。

**v1.6.4 更新日志**：
- **跑道开关按钮微动效与物理交互革新（Apple Design）**：开关仅在光标移入白色圆圈时触发破框微浮与环境散射微光；按下敏捷下潜（`scale: 0.92`）；滑行全程保持高亮悬浮并在对侧悬浮短暂停留（80ms）；光标未移动更新时自主脱离判定（400ms），优雅平滑降落变回原样（`scale: 1`）并熄灭高光；移入新圆圈无缝恢复；
- **搜索卡片与侧边栏年份高光双向联动修复**：根治居中滚动 1.5 秒后错误回跳上方年份的问题，双向高光实时精准锁定搜索卡片所属真实年份；
- **文字高浮抗模糊体系扩展与界面调优**：全站悬浮放大按钮与标签接入 GPU subpixel-antialiased 与 optimizeLegibility 抗锯齿渲染，彻底消除文字位图模糊；加固 portal 下拉菜单定位与开销。

**v1.6.3 更新日志**：
- **大图/高分辨率封面上传彻底根治闪退**：移除后台 1.5 秒死循环 `EmptyWorkingSet` 内存回收线程，杜绝大图解码时的物理页频繁置换卡死闪退；Rust 端增加 `image::Limits` 解码配额安全边界与 `catch_unwind` 异常熔断；
- **冷启动极速优化**：移除 WebView2 阻断参数，恢复 Chromium 磁盘着色器缓存；消除冷启动多余写盘与 localStorage 阻塞；实现前 3 个年份渐进首屏秒开直出；
- **编辑详情页原画质感**：编辑弹窗恢复原始高清封面呈现（`read_cover`），移除模糊缩略图拉伸；全屏查看器增加防覆盖保护；修复卡片切换幽灵残影与工具栏数字闪烁。

**v1.6.2 更新日志**：
- **专辑/单曲标签智能流体收起与展开（Apple Design）**：添加/编辑弹窗中切换到 Singles 分区时，专辑标签基于现代 Grid 0fr↔1fr 轨道折叠与 Apple 签名阻尼曲线（360ms）优雅收起，切回 Albums 分区反向平滑展开；
- **开窗瞬态无动画机制**：点击专辑卡片打开弹窗直接静态显示标签（无展开动画），点击单曲卡片打开弹窗直接静态折叠隐藏（无收起动画），彻底消除开窗微动闪烁；
- **单曲保存数据纯净**：条目保存归属于 Singles 时自动排除专辑标签，避免脏数据残留。

**v1.6.1 更新日志**：
- **弹窗遮罩层级修复**：桌面版悬浮按钮（`+` / `↑` / `↓`）z-index 降至 60，避免穿透弹窗遮罩层（100），打开弹窗时自动被全屏遮罩覆盖变暗并毛玻璃模糊，点击按钮区域由遮罩捕获触发取消退出；
- **年度平均分柱状图基准优化**：年度平均分水平柱状图统一以满分 100 分为基准满格显示（`Math.min(100, Math.max(0, row.avg)).toFixed(1)`），修复此前以历年最高分当分母导致 90 分就顶格占满轨道的缺陷。

**v1.6.0 更新日志**：
- **全局字体与字重体系**：支持中英文分开独立选择字体，内置 500+ 款系统字体智能识别与多语种分类；支持 100-900 自定义字重平滑调节；下发覆盖全站主界面、专辑卡片、年份栏、二级编辑菜单与所有弹窗；
- **实时效果双向预览**：字体设置弹窗内嵌高质感实时预览卡片，动态联动多语种字形与粗细排版；
- **窄屏排版与优雅断词**：为预览卡片与弹窗建立视口自适应安全边距，采用 `text-wrap: balance / pretty` 与优雅断词，杜绝边缘贴紧与单词溢出；
- **全新自研 macOS 悬浮滚动条**：彻底移除 Chromium/WebView2 粗糙的原生滚动条，采用半透明自研悬浮滑块，不占布局空间，解决鼠标悬停时光标被系统粗箭头劫持的底层问题；
- **封面大图查看器体验升级**：编辑弹窗新增「查看大图」快捷按钮；滚轮以鼠标所在点为中心指数等比平滑缩放（最高支持 8x）；PointerCapture 消除大图拖拽平移丢帧撕裂；
- **光标穿透与交互手感加固**：全面加固按钮、标签与卡片内部子元素的光标继承，100% 保持 macOS 白手套与苹果工字钢光标，杜绝跳变闪烁；
- **单文件预览页大幅瘦身**：优化 `build-preview.js` 封面引用与内嵌逻辑，`preview.html` 单文件体积从 100MB+ 缩减 93% 至 7MB 左右，秒级极速打开。

**v1.5.4 更新日志**：
- **搜索图标重塑**：搜索栏放大镜更换为清晰纯正的 iOS 风格微图标（`assets/search-icon.png`），去除旧版噪点与 AI 味；
- **编辑弹窗分数即时同步**：修复编辑弹窗点击微调箭头修改分数后必须点击框外才能 Shift+Enter 保存的问题，现在调整分数后按 Shift+Enter 即可即时保存；
- **Windows 任务栏无缝切换**：无边框窗口底层注入标准 Win32 最小化样式，完美支持在 Windows 底部任务栏点击图标双向最小化与恢复前台；
- **移除软件内右键菜单**：移除软件内部冗余的自定义右键菜单，避免误触与交互冲突，操作更清爽自然；
- **高清圆角应用图标**：托盘与应用图标全尺寸升级为透明圆角高清矢量渲染，彻底消除黑色外边框；
- **系统托盘交互优化**：统一为仅鼠标右键唤出菜单，鼠标双击自后台唤醒窗口至前台聚焦；
- **侧边栏高保真 Logo**：侧边栏标题右侧置入高保真原生 Logo，支持悬停微交互与连续 3 击全屏放大查看细节。


**分数统计面板**：`render.js` 中 `updateGlobalStatsSidebar()` 在右侧固定位置渲染两个统计卡片（专辑 / 单曲），各自显示平均分、7 档分数分布柱状图（100 / 90-99 / 80-89 / 70-79 / 60-69 / 50-59 / 0-49）、已打分/未打分/条目数。所有标签均支持中英文切换，通过 `t()` 函数实现。每次数据变更后通过 `refreshAll()` 实时更新。**点击统计卡片弹出年度平均分弹窗**（`#yearlyStatsModal`），展示每一年的独立平均分和条目数，水平柱状图以满分 100 分为基准满格显示，支持 ESC / 点击遮罩关闭。

**搜索结果计数**：搜索框内右侧 `.search-counter` 显示 `当前/总数`，`applyFilters()` 初始化时设置，`goToNextResult()` / `goToPrevResult()` 翻页时同步更新，清空搜索时隐藏。

**Shift+click 批量选择**：批量模式下，点击第一张卡片后 Shift+点击另一张卡片，自动选中两者之间的所有卡片。退出批量模式时清除选择记忆。

**渲染与筛选分离**：`renderContent()` 重建 DOM 时同步应用筛选（通过 `matchesFilter(entry)` 传入 `visible`），并维护 `allCards` 缓存和 `searchResults` 数组。`applyFilters()` 仅切换 `hidden` 类，不触发 DOM 重建。`rebuildCardCache()` 仅在 DOM 重建后调用。

**国际化**：`i18n.js` 包含 `I18N` 字典（en/zh）和 `t(key, params)` 翻译函数。HTML 中通过 `data-i18n`、`data-i18n-placeholder`、`data-i18n-title` 属性标记需翻译的元素。`applyI18nToDOM()` 批量替换 DOM 文本。语言偏好持久化到 localStorage（key: `lang`）。切换语言时同步更新 tooltip 文字、分组标题（Albums→专辑 / Singles→单曲）和统计面板标签（avg→平均 / NR→未打分 / Entries→条目 / scored→已打分）。

**主题与风格**：iOS 15 设计语言。两个维度独立切换：亮/暗模式（`[data-theme="dark"]`）和风格预设（纯色 vs 毛玻璃 `[data-style="glass"]`），状态持久化到 localStorage。默认风格为毛玻璃。

**毛玻璃性能优化**：
- backdrop-filter 为唯一模糊来源，不使用 `::before` 伪元素的额外 `filter: blur()`
- 桌面 sidebar/toolbar/titlebar/batch bar 使用 `blur(20px) saturate(180%)`；toolbar 通过 `will-change: transform` + `translateZ(0)` 固定为独立合成层，滚动时始终保留真实毛玻璃
- 桌面普通/AOTY/SOTY 卡片取消逐卡 `backdrop-filter`、初始动画与常驻 `will-change`，改用半透明背景；网页端仍保留原卡片毛玻璃规则
- body 背景使用 `position: fixed` 伪元素替代 `background-attachment: fixed`
- 只有自定义 `bgHue` 时才给 body 背景执行 `hue-rotate`，默认值不运行整屏 filter
- 拖拽期间通过 `.content.is-dragging` 类临时禁用所有卡片的 backdrop-filter

**AOTY/SOTY 管理**：`isAoty` 标记年度专辑，`isSoty` 标记年度单曲。`renderContent()` 在渲染时动态将 `isAoty=true` 的条目归入 Albums 顶部的 AOTY 组，`isSoty=true` 的条目归入 Singles 顶部的 SOTY 组。编辑弹窗根据当前选择的分组动态切换 AOTY/SOTY 开关（Albums 组显示 AOTY，Singles 组显示 SOTY）。筛选系统中"AOTY"选项同时匹配 `isAoty` 和 `isSoty`。

**AOTY/SOTY 锚点定位**：`renderContent()` 在每个 section 中渲染两个不可见锚点（1px div）用于侧边栏导航跳转：AOTY 锚点在 section 顶部、Albums 标题上方；SOTY 锚点在 Albums 下方、Singles 标题上方。锚点仅在对应条目存在时渲染。

**侧边栏导航高亮**：`rebuildScrollCache()` 在 DOM 或尺寸变化后缓存 group 绝对位置和 nav Map；`setupScrollSync()` 使用 passive scroll + rAF + 32ms 限流，`findCurrentScrollGroup()` 通过二分查找确定当前 group，`setActiveNavItem()` 只更新旧/新 active 项。`ResizeObserver` 监听 `#contentArea`，展开乐评后也会调度缓存重建。点击导航项期间仍通过 `overview-scroll` 和统一定时器避免滚动同步抢占高亮。

**必听专辑**：Albums 分组中 `score >= mustHearThreshold` 的条目自动显示 `★Must Hear Album` 标记（Singles 不显示）。阈值默认 80，用户可通过工具栏弹出菜单自定义（0–100），并可通过开关关闭整个功能。开关和阈值均需点击「保存」后生效，持久化到 localStorage（key: `mustHearEnabled`、`mustHearThreshold`）。逻辑在 `renderAlbumCard()` 中通过 `showMustHear` 控制。**点击框外丢弃未保存的修改**，恢复为已保存值，重新打开时输入框显示正确的当前阈值。保存时调用 `updateMustHearBadges()` 只更新每张卡片上的标记，不全量重建 DOM。

**封面 URL 输入**：点击「URL」按钮弹出 iOS 风格 `showPrompt` 弹窗（`dialog.js`），替代浏览器原生 `prompt()`，支持中英文标题。

**语言切换优化（v1.3.3）**：`toggleLang()` 调用 `updateLangTexts()` 只更新分组标题（`.group-title`）、Must Hear 标记、统计面板和侧边栏，跳过 `renderContent()` 全量重建。

**z-index 层级（桌面版 v1.3.3）**：统计面板 `z-index: 40`，toolbar `z-index: 50`（低于模态弹窗遮罩 100，弹窗打开时 toolbar 会被模糊），设置下拉菜单 `z-index: 150`（在 toolbar 内部，有效层级 50，高于统计面板）。

**筛选系统**：`currentFilter` 为数组，支持多选标签。分数筛选支持 100、90+、80+、70+、60+、50+、<50、NR、AOTY（同时匹配 `isAoty` 和 `isSoty`）。标签下拉多选（选择后保持展开），分数下拉单选（选择后关闭）。

**搜索导航**：搜索时自动滚动到第一个结果并高亮蓝色描边，右下角上下按钮循环跳转搜索结果。输入使用 200ms debounce，Enter 或点击放大镜立即执行。搜索字段包括 title、artist、scoreNote、notes、review。局部替换/新增/排序卡片时必须同步更新 `searchResults` 的 DOM 引用、结果计数和按钮可见性。

**Entry 索引**：`buildEntryIndex()` 构建 `Map<id, entry>` 实现 O(1) 查找。

**编辑弹窗**：`populateSectionSelector()` 始终为每个 section 列出 Albums 和 Singles 两个选项。`saveEntry()` 中 `JSON.parse(selectedSectionValue)` 有 try-catch 防护。Shift+回车快速保存。

**卡片复制粘贴（v1.4.1）**：普通卡片和 AOTY/SOTY 卡片均渲染 `data-action="copy-entry"` 图标按钮，通过内容区事件委托调用 `copyEntry()`。内存变量 `clipboardEntry` 保存复制数据；编辑弹窗底部 `#pasteBtn` 调用 `pasteEntry()`，复制成功以 `.toast` 显示标题。复制不包含封面，关闭应用后剪贴板清空。

**批量添加曲目（v1.3.4）**：编辑弹窗每碟底部有「批量添加」按钮（`data-action="batch-add-to-disc"`），调用 `batchAddTracks(disc)`。通过 `showPrompt` 输入目标曲目数（1–999）：数量大于现有则在该 disc 末尾补空白曲目，小于现有则从该 disc 末尾删多余行，相等则无操作。完成后聚焦该 disc 第一个空白曲目输入框。i18n 键：`modal.batchAddTracks` / `modal.batchAddPrompt` / `modal.batchAddPlaceholder`。

**拖拽排序**：Pointer Events + FLIP 实现同组排序，AOTY 卡片不参与。pointermove 只保存最新坐标并合并到单个 rAF，幽灵元素用 `translate3d` 更新；自动滚动以 `720px/s` 为最大速度并按帧时间增量计算。非被动 wheel 监听只在拖拽激活后注册，`resetState()` 立即移除，普通滚动可继续走 WebView2 异步合成路径。

**AOTY/SOTY 卡片宽度（v1.3.3）**：桌面版 AOTY/SOTY 卡片通过 `:has(.aoty-card)` 让 `.group-cards-list` 允许溢出，再设置 `width: calc(100% + 20px)` + `margin-left: -10px` 居中扩展，左右各比普通卡片宽 20px。

**编辑保存优化（v1.3.4）**：`saveEntry()` 编辑已有条目时，如果未跨组移动，调用 `updateCardInPlace(entryId)` 只替换单张卡片 DOM，跳过全量 `renderContent()`，配合 CSS `fadeInUp` 动画提供视觉反馈。跨组移动仍走 `refreshAll()` 全量重建。新建/编辑后凡命中排序规则的 section 都走 `reorderGroupCards()` 自动排序并插入到正确位置。

**自动排序（v1.3.3 / v1.3.4 扩展）**：1990-2024 年的 section 新建或编辑条目后自动按标题排序，优先级：符号 → 数字 → 英文 → 中文拼音（`localeCompare('zh-CN')`），AOTY/SOTY 永远置顶不参与排序。2025 及以后的 section 根据日期格式自动判断排序方式：`MM.DD` 格式按日期升序排在最前，`XXXX` 格式按年份降序（新在前）排在中间，无日期排最后按标题排序；MM.DD 条目始终在 XXXX 条目前面。1980s 及以前（含 1950s）的 section 按年份降序（新在前），无年份排最后，同一年份再按标题排序。编辑时调用 `reorderGroupCards()` 重排整个 group 的 DOM 并更新序号，AOTY/SOTY 状态变化时自动重建卡片类型。`charPriority(ch)` 在 `filter.js` 中定义。

**EscapeHtml**：转义 `&`、`<`、`>`、`"`、`'`，防止 HTML 注入。所有 innerHTML 中的用户数据（data 属性值、id 属性值、显示文本）均经过 `escapeHtml()` 处理。

**事件委托**：全部交互事件通过 `data-action` 属性 + 事件委托实现，无内联 `onclick`/`onkeydown`/`oninput`/`onchange`。委托层级：侧边栏 `.sidebar` → 导出/导入按钮；`#sidebarNav` → 折叠/删除/导航跳转；`#contentArea` → 卡片点击/复制/Enter 键/乐评展开；`#editModal` → 取消/删除/保存/粘贴/添加曲目/批量添加曲目；`#trackList` → 曲目输入/分数输入/删除曲目。

**HTML 缓存**：`renderSidebar()` 和 `renderContent()` 各维护一份 HTML 字符串缓存（`_lastSidebarHtml`、`_lastContentHtml`），内容未变化时跳过 DOM 重建。`refreshAll()` 中清除缓存强制重建。

**JSON 导入校验**：`handleImport()` 对导入数据做深度结构校验，验证每个 section/group/entry 的字段类型，自动修复缺失字段（补默认值）和类型错误（score 限制 0–100，tags/tracks 确保为数组等）。

**JSON 导入 input（v1.4.1）**：页面内保留隐藏的 `#importFileInput`，`importJSON()` 清空 value 后触发 click，静态 change 监听调用 `handleImport()` 并再次清空，确保选择同一文件也会触发导入。

**localStorage 容量监控**：`saveData()` 在保存后检查 JSON 大小，超过 4MB 时输出 `console.warn`；捕获 `QuotaExceededError` 时弹窗提示用户导出清理。

**下拉菜单交互**：标签下拉多选，选择后保持展开，点击外部关闭；分数下拉单选，选择后关闭；切换下拉时其他已打开的自动收回。

**解析器注意事项**（gen.js）：日期提取在标签移除之后执行。`psl()` 中分数提取在括号注释移除之后执行。正则 `/^\d+[\.\s]/` 同时匹配 `1. Title` 和 `1 Title` 两种格式。Vol headers 匹配 `/^Vol\.\s*\d+\s*-\s*(\d{4})/` 并合并到已有年份 section。`me()` 函数输出包含 `isSoty: false` 字段（SOTY 通过编辑弹窗手动标记）。

**专辑封面管理**：
- 数据模型：entry 新增 `cover` 字段，值为本地文件名（如 `"a1.jpg"`）或完整 URL；`null` 表示无封面。通过判断是否以 `http` 开头区分类型
- 本地原图存储在 `{appDataDir}/covers/`，缩略图存储在 `{appDataDir}/covers/.thumbnails/{entryId}.png`；按完整 file stem 匹配，禁止路径型 entry ID
- Rust 端四个 Tauri 命令：`upload_cover`、`remove_cover`、`read_cover_thumbnail`、`read_cover`。上传时尽力生成最长边 256px PNG；旧数据首次读取缩略图时补生成，格式不支持时回退原图
- 前端 `coverThumbnailCache` 为最多 96 项的 LRU Map；`coverThumbnailLoads` 去重，同一时间只执行 1 个 Tauri 缩略图请求；`IntersectionObserver` 使用 `rootMargin: 160px 0px`，远程 URL 也在进入预加载范围后才赋值 src
- 编辑弹窗原图不进入卡片缓存；`coverPreviewRequestId` 防止异步串图，关闭弹窗时 `releaseCoverPreview()` 清空预览和查看器 src
- 编辑弹窗封面区域：顶部大图预览 + 上传/URL/移除按钮；移除按钮有二级确认 dropdown（确认/取消），点击外部自动关闭
- 卡片缩略图：普通卡片 48px（桌面版 58px），AOTY/SOTY 卡片使用固定尺寸容器 `.aoty-cover-wrap`（80px/96px），无封面时不显示占位
- 全屏查看器：双击封面打开，支持滚轮缩放（0.3x–5x，以鼠标位置为锚点）和按住左键拖拽平移；Escape/点击背景/点击 × 关闭
- 文件大小限制：上传和读取均限制 20MB；支持格式：jpg、jpeg、png、webp、gif、bmp、avif
- 缩略图最大读取 2MB；上传、替换、移除后失效对应前端缩略图缓存
- Rust 单元测试覆盖缩略图尺寸上限和 `a1`/`a10` 精确匹配
- `saveEntry()` 自动包含 `cover` 字段，`refreshAll()` 触发卡片重渲染

**曲目碟号（disc）**：
- 每首曲目有 `disc` 字段（number，默认 1），用于多碟专辑分组
- 卡片曲目标签：多碟时显示 `2 Discs 28T`（英文）/ `2碟 28首`（中文），单碟保持原样
- 编辑弹窗内多碟专辑额外显示每碟独立平均分，用「·」分隔，如 `碟1：平均 85.2 · 碟2：平均 79.4`
- i18n 键：`content.discLabel`（`{count} Discs ` / `{count}碟 `）、`modal.discAvg`（`Disc {disc}: avg {avg}` / `碟{disc}：平均 {avg}`）

**全局字体与字重体系（v1.6.0）**：
- **数据持久化**：全局字体与字重偏好保存在 localStorage：`customFontZh`（默认 `"PingFang SC"`）、`customFontEn`（默认 `"-apple-system"`）、`customFontWeight`（默认 `400`）、`customFontWeightEnabled`（默认 `false`）。启动时由 `initCustomFontSettings()` 自动还原。
- **系统字体枚举**：Rust 端实现 `get_system_fonts` 命令，调用 Windows GDI `EnumFontFamiliesExW` 枚举本机所有字体，过滤 `@` 垂直排版字体并去重排序返回 `Vec<String>`；前端缓存至 `_allSystemFonts`。
- **字体智能分类与独立 Tab**：`isChineseFont(fontName)` 结合汉字 Unicode 范围（`\u4e00-\u9fa5`）与 30+ 常用中文字体拼音关键字（`kaiti`、`fangzheng`、`huawen`、`simsun`、`yahei`、`pingfang` 等）精准划分。中文模式下提供「中文字体」与「英文字体」两个分段选项卡；英文模式下自动隐藏选项卡并专注西文字体列表。字体列表项通过 `font-family: "${fontName}", sans-serif !important;` 实现自身真实字形自渲染展示。
- **字体堆叠构建与全域下发**：`buildFontFamilyStack(en, zh)` 生成标准 CSS font-family 字符串并绑定到根变量 `--custom-font-family`。CSS 中通过通配与全域选择器强制下发覆盖 `body`、所有表单输入框、卡片、侧边栏、工具栏、统计面板、二级编辑菜单、各种下拉菜单与各类模态弹窗。
- **双层字重穿透体系**：滑块支持 100–900 范围调节（步长 50）。开启自定义字重时，通过 `[data-font-weight-custom="true"]` 激活：常规元素采用基准字重 `var(--custom-font-weight) !important`；标题、年份、分数徽标、统计大标题与关键按钮采用阶梯加权 `calc(var(--custom-font-weight) + 150) !important`，确保视觉层次清晰。
- **实时效果双向预览**：字体弹窗内嵌独立预览卡片（`#fontPreviewCard`），中英文模式动态切换示范专辑与混排评语，双向联动字形与粗细。具备极窄视口（低于 480px）自适应安全边距与盒模型保护（`width: min(580px, calc(100vw - 32px))`），并接入 `text-wrap: balance / pretty`、`overflow-wrap: break-word`、`word-break: break-word` 与连字符自动断词（`-webkit-hyphens: auto`）。
- **一键重置与防误触**：提供「恢复默认」按钮一键重置为苹方 + SF Pro 系统原生组合；搜索框防止输入法回车误保存，需点击保存、按 Shift+Enter 或失焦后 Enter 确认保存。
