# Music Ratings 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构音乐评分应用的代码结构、渲染性能和数据安全性

**Architecture:** 将 render.js（1087行）拆分为渲染和拖拽两个模块；用事件委托替换全部内联事件处理器；审计并修复 innerHTML 安全漏洞；增强 JSON 导入校验和 localStorage 容量监控。

**Tech Stack:** 纯原生 HTML/CSS/JavaScript，无框架

---

## 文件结构

### 改动前
```
js/
├── state.js       # 全局状态
├── i18n.js        # 国际化
├── utils.js       # 工具函数
├── filter.js      # 筛选搜索
├── modal.js       # 编辑弹窗
├── render.js      # 侧边栏 + 内容渲染 + 拖拽排序（1087行）
└── app.js         # 初始化 + 主题 + 导入导出
```

### 改动后
```
js/
├── state.js       # 全局状态（不变）
├── i18n.js        # 国际化（不变）
├── utils.js       # 工具函数（不变）
├── filter.js      # 筛选搜索（不变）
├── modal.js       # 编辑弹窗（小改）
├── render.js      # 侧边栏 + 内容渲染（约500行）
├── drag.js        # 拖拽排序（约500行）  ← 新文件
└── app.js         # 初始化 + 事件委托 + 安全增强
```

**加载顺序：** `state.js → i18n.js → utils.js → filter.js → modal.js → render.js → drag.js → app.js`

---

## Task 1: 拆分 render.js — 提取拖拽模块

**目标：** 将 render.js 中的拖拽排序逻辑（DOMContentLoaded 回调内的所有代码）提取到独立的 `js/drag.js`。

**Files:**
- Modify: `js/render.js` — 删除第537–1087行（DOMContentLoaded 块）
- Create: `js/drag.js` — 拖拽排序逻辑
- Modify: `index.html` — 在 render.js 之后加载 drag.js

- [ ] **Step 1: 创建 drag.js**

将 render.js 中第537行 `document.addEventListener('DOMContentLoaded', () => {` 开始到文件末尾的全部代码剪切到新文件 `js/drag.js`。内容包括：`contentArea` 和 `mainEl` 获取、`state` 对象声明、`findSourceGroup`、`startAutoScroll`/`updateAutoScroll`/`stopAutoScroll`、`createPlaceholder`、`findInsertPosition`、`animateCards`、`updatePlaceholderPosition`、`updateGhostPosition`、`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`、`finishDrag`、`syncEntriesOrder`、`cancelDrag`、`resetState`、事件绑定、`selectstart`/`wheel` 监听器。

文件开头加注释：
```javascript
// 拖拽排序模块
// 使用 Pointer Events + FLIP 动画实现同组内卡片拖拽排序
```

- [ ] **Step 2: 从 render.js 删除已迁移代码**

render.js 保留第1–536行（`getMergedSections`、`migrateVolSections`、`renderSidebar`、`toggleNavGroup`、`scrollToSection`、`scrollToGroup`、`addNewYear`、`activateNavItem`、`setupScrollSync`、`renderContent`、`renderAlbumCard`、`renderAotyCard`、`toggleReview`、`deleteYearSection`）。删除第537行起的 `document.addEventListener('DOMContentLoaded', ...)` 整个块。

- [ ] **Step 3: 更新 index.html 加载顺序**

```html
<script src="js/render.js"></script>
<script src="js/drag.js"></script>
<script src="js/app.js"></script>
```

- [ ] **Step 4: 验证**

浏览器中打开 index.html，确认：侧边栏正常渲染、内容区正常渲染、拖拽排序功能正常、控制台无报错。

- [ ] **Step 5: 提交**

```bash
git add js/render.js js/drag.js index.html
git commit -m "refactor: 拆分 render.js，拖拽排序逻辑提取到 drag.js"
```

---

## Task 2: 事件委托 — 移除全部内联事件处理器

**目标：** 用 `data-action` 属性 + 事件委托替换所有 `onclick`/`onkeydown`/`oninput`/`onchange` 内联处理器，减少 HTML 体积，提升可维护性。

### Task 2a: 内容区卡片事件委托

**Files:**
- Modify: `js/render.js` — `renderAlbumCard`、`renderAotyCard` 函数
- Modify: `js/app.js` — `init()` 函数中添加内容区事件委托

- [ ] **Step 1: 修改 renderAlbumCard — 移除内联处理器，添加 data 属性**

将 render.js 中 `renderAlbumCard` 函数的返回值改为：

```javascript
function renderAlbumCard(entry, idx, sectionId, groupId, groupName, visible) {
  const scoreClass = getScoreClass(entry.score);
  const scoreText = entry.score != null ? entry.score : (entry.scoreNote === 'NR' ? 'NR' : '—');
  const tags = (entry.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const hasReview = entry.review && entry.review.trim().length > 0;
  const trackCount = entry.tracks && entry.tracks.length > 0 ? entry.tracks.length : 0;
  const hiddenClass = visible ? '' : 'hidden';
  const noteText = entry.scoreNote && entry.scoreNote !== 'NR' ? ` (${entry.scoreNote})` : '';
  const showMustHear = mustHearEnabled && groupName !== 'Singles' && entry.score != null && entry.score >= mustHearThreshold;

  return `<div class="album-card ${hiddenClass}" data-entry-id="${escapeHtml(entry.id)}" data-section="${escapeHtml(sectionId)}" data-group="${escapeHtml(groupId)}" data-action="open-edit" role="button" tabindex="0">
    <span class="album-index">${idx}</span>
    <div class="album-info">
      <div class="album-title">${escapeHtml(entry.title)}${noteText ? ' <span style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(noteText) + '</span>' : ''}</div>
      <div class="album-artist">${escapeHtml(entry.artist || '')}</div>
      ${showMustHear ? '<span class="must-hear">' + t('content.mustHear') + '</span>' : ''}
    </div>
    <div class="album-meta">
      ${tags ? '<div class="album-tags">' + tags + '</div>' : ''}
      ${trackCount > 0 ? '<span class="track-count" title="' + t('content.trackTooltip') + '">' + trackCount + t('content.trackUnit') + '</span>' : ''}
      <span class="album-date">${escapeHtml(entry.date || '')}</span>
      <span class="score-badge ${scoreClass}">${scoreText}</span>
      ${hasReview ? '<span class="review-indicator" title="' + t('content.reviewTooltip') + '"></span>' : ''}
    </div>
  </div>`;
}
```

关键改动：
- 移除 `onclick="openEditModal('${entry.id}','${sectionId}','${groupId}')"`
- 移除 `onkeydown="if(event.key==='Enter')openEditModal(...)"`
- 添加 `data-action="open-edit"`
- 所有 data 属性值加 `escapeHtml()` 保护

- [ ] **Step 2: 修改 renderAotyCard — 同样移除内联处理器**

```javascript
function renderAotyCard(entry, sectionId, groupId, visible, groupName) {
  const hiddenClass = visible ? '' : 'hidden';
  const scoreText = entry.score != null ? entry.score + '/100' : '—';
  const noteText = entry.scoreNote && entry.scoreNote !== 'NR' ? ` (${entry.scoreNote})` : '';
  const tags = (entry.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const hasReview = entry.review && entry.review.trim().length > 0;
  const trackCount = entry.tracks && entry.tracks.length > 0 ? entry.tracks.length : 0;
  const reviewHtml = entry.review ? `<div class="aoty-review" id="review-${escapeHtml(entry.id)}">${escapeHtml(entry.review)}</div>
    <button class="aoty-review-toggle" data-action="toggle-review" data-entry-id="${escapeHtml(entry.id)}">${t('content.showMore')}</button>` : '';

  return `<div class="aoty-card ${groupName === 'Singles' ? 'soty-card' : ''} ${hiddenClass}" data-entry-id="${escapeHtml(entry.id)}" data-section="${escapeHtml(sectionId)}" data-group="${escapeHtml(groupId)}" data-action="open-edit" role="button" tabindex="0">
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="flex:1;min-width:0">
        <div class="aoty-header">
          <span class="aoty-badge${groupName === 'Singles' ? ' soty' : ''}">${groupName === 'Singles' ? 'SOTY' : 'AOTY'}</span>
          <span class="aoty-title">${escapeHtml(entry.title)}${noteText ? ' <span style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(noteText) + '</span>' : ''}</span>
        </div>
        <div class="aoty-artist">${escapeHtml(entry.artist || '')}</div>
        ${reviewHtml}
      </div>
      <div class="album-meta">
        ${tags ? '<div class="album-tags">' + tags + '</div>' : ''}
        ${trackCount > 0 ? '<span class="track-count" title="' + t('content.trackTooltip') + '">' + trackCount + t('content.trackUnit') + '</span>' : ''}
        <span class="aoty-score">${scoreText}</span>
      </div>
    </div>
  </div>`;
}
```

- [ ] **Step 3: 在 app.js init() 中添加内容区事件委托**

在 `init()` 函数末尾（`mustHearSave` 监听器之后）添加：

```javascript
  // 内容区事件委托
  const contentArea = document.getElementById('contentArea');
  contentArea.addEventListener('click', (e) => {
    // 乐评展开/收起
    const reviewToggle = e.target.closest('[data-action="toggle-review"]');
    if (reviewToggle) {
      toggleReview(reviewToggle);
      return;
    }
    // 打开编辑弹窗
    const card = e.target.closest('[data-action="open-edit"]');
    if (card) {
      const entryId = card.dataset.entryId;
      const sectionId = card.dataset.section;
      const groupId = card.dataset.group;
      openEditModal(entryId, sectionId, groupId);
    }
  });
  contentArea.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const card = e.target.closest('[data-action="open-edit"]');
    if (card) {
      openEditModal(card.dataset.entryId, card.dataset.section, card.dataset.group);
    }
  });
```

- [ ] **Step 4: 修改 toggleReview 函数签名**

当前 `toggleReview(e, id)` 依赖内联 `onclick="toggleReview(event, '${entry.id}')"` 传入事件和 ID。改为接收 DOM 元素：

```javascript
function toggleReview(btn) {
  const id = btn.dataset.entryId;
  const el = document.getElementById('review-' + id);
  if (el.classList.contains('expanded')) {
    el.classList.remove('expanded');
    el.style.maxHeight = '120px';
    btn.textContent = t('content.showMore');
  } else {
    el.classList.add('expanded');
    el.style.maxHeight = 'none';
    btn.textContent = t('content.showLess');
  }
}
```

- [ ] **Step 5: 验证**

浏览器中确认：点击卡片能打开编辑弹窗、Enter 键也能打开、AOTY 乐评展开/收起正常、拖拽排序仍正常。

- [ ] **Step 6: 提交**

```bash
git add js/render.js js/app.js
git commit -m "refactor: 内容区卡片改用事件委托，移除内联 onclick/onkeydown"
```

### Task 2b: 侧边栏事件委托

**Files:**
- Modify: `js/render.js` — `renderSidebar` 函数
- Modify: `js/app.js` — `init()` 函数中添加侧边栏事件委托

- [ ] **Step 1: 修改 renderSidebar — 用 data-action 替换内联处理器**

renderSidebar 中的 HTML 生成改为使用 `data-action` 和 `data-` 属性。替换以下内联处理器：

**新年份按钮：**
```javascript
// 原: onclick="addNewYear()"
// 改: data-action="add-new-year"
html += `<div style="padding:8px 16px;">
  <button data-action="add-new-year" style="width:100%;padding:8px;border:1.5px dashed var(--separator);border-radius:10px;background:transparent;color:var(--accent);font-size:13px;font-weight:500;cursor:pointer;transition:background 0.15s;border-color 0.15s;">${t('sidebar.newYear')}</button>
</div>`;
```

**分组头部（折叠按钮）：**
```javascript
// 原: onclick="toggleNavGroup(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleNavGroup(this)}"
// 改: data-action="toggle-nav-group"
html += `<div class="nav-group-header" role="button" tabindex="0" data-action="toggle-nav-group">`;
```

**删除年份按钮：**
```javascript
// 原: onclick="event.stopPropagation();deleteYearSection('${section.id}')"
// 改: data-action="delete-year" data-section-id="${section.id}"
html += `<span class="nav-group-delete" data-action="delete-year" data-section-id="${section.id}" title="${currentLang === 'zh' ? '删除' + yearNum + '年' : 'Delete ' + yearNum}">×</span>`;
```

**导航项（AOTY/Albums/SOTY/Singles）：**

删除原来的 `navClick` 内联函数模板。改为只保留 `data-nav` 和 `href`：

```javascript
// 原: onclick="${navClick}(this);scrollToGroup('${gid}',event)"
// 改: 只保留 href 和 data-nav
html += `<a class="nav-item" href="#group-${gid}" data-nav="${gid}" data-action="nav-click">${t('sidebar.aoty')} (${aotyCount})a>`;
```

对 Albums、SOTY、Singles 导航项同理。

- [ ] **Step 2: 在 app.js init() 中添加侧边栏事件委托**

在 `init()` 函数中添加侧边栏事件委托（在内容区委托之前）：

```javascript
  // 侧边栏事件委托
  const sidebarNav = document.getElementById('sidebarNav');
  sidebarNav.addEventListener('click', (e) => {
    // 删除年份
    const deleteBtn = e.target.closest('[data-action="delete-year"]');
    if (deleteBtn) {
      e.stopPropagation();
      deleteYearSection(deleteBtn.dataset.sectionId);
      return;
    }
    // 导航项点击
    const navItem = e.target.closest('[data-action="nav-click"]');
    if (navItem) {
      e.preventDefault();
      // 先移除所有导航项的 active 类
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navItem.classList.add('active');
      // 禁用滚动同步
      const ca = document.getElementById('contentArea');
      ca.classList.add('overview-scroll');
      if (window._navActiveInterval) { clearInterval(window._navActiveInterval); window._navActiveInterval = null; }
      if (window._navActiveTimeout) { clearTimeout(window._navActiveTimeout); window._navActiveTimeout = null; }
      if (window._navScrollDelay) { clearTimeout(window._navScrollDelay); window._navScrollDelay = null; }
      window._navActiveInterval = setInterval(() => navItem.classList.add('active'), 50);
      window._navActiveTimeout = setTimeout(() => {
        clearInterval(window._navActiveInterval);
        window._navActiveInterval = null;
        window._navActiveTimeout = null;
        window._navScrollDelay = setTimeout(() => {
          ca.classList.remove('overview-scroll');
          window._navScrollDelay = null;
        }, 200);
      }, 1500);
      // 滚动到目标
      const gid = navItem.dataset.nav;
      scrollToGroup(gid, e);
      return;
    }
    // 折叠/展开分组
    const groupHeader = e.target.closest('[data-action="toggle-nav-group"]');
    if (groupHeader) {
      toggleNavGroup(groupHeader);
    }
  });
  // 分组头部键盘支持
  sidebarNav.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const groupHeader = e.target.closest('[data-action="toggle-nav-group"]');
    if (groupHeader) {
      e.preventDefault();
      toggleNavGroup(groupHeader);
    }
  });
```

**侧边栏新年份按钮** 事件委托（放在 sidebarNav 外，因为按钮在 sidebarNav 之外）：

```javascript
  document.querySelector('.sidebar').addEventListener('click', (e) => {
    const addYearBtn = e.target.closest('[data-action="add-new-year"]');
    if (addYearBtn) addNewYear();
  });
```

- [ ] **Step 3: 验证**

浏览器中确认：点击年份跳转正常、高亮正常、折叠/展开正常、删除年份正常、新年份按钮正常、键盘 Enter/Space 折叠正常。

- [ ] **Step 4: 提交**

```bash
git add js/render.js js/app.js
git commit -m "refactor: 侧边栏改用事件委托，移除内联 onclick/onkeydown"
```

### Task 2c: 弹窗曲目列表事件委托

**Files:**
- Modify: `js/modal.js` — `renderTracks` 函数
- Modify: `js/app.js` — `init()` 函数中添加曲目列表事件委托

- [ ] **Step 1: 修改 renderTracks — 移除内联处理器**

```javascript
function renderTracks() {
  const container = document.getElementById('trackList');
  container.innerHTML = editingTracks.map((tr, i) => `
    <div class="track-row" data-track-index="${i}">
      <span class="track-num">${i + 1}</span>
      <div class="track-name">
        <input class="form-input track-name-input" placeholder="${t('modal.placeholder.track')}" value="${escapeHtml(tr.name)}">
      </div>
      <div class="track-score">
        <input class="form-input track-score-input" type="text" placeholder="—" value="${tr.score != null ? tr.score : ''}">
      </div>
      <button type="button" class="track-remove" data-action="remove-track" data-track-index="${i}">×</button>
    </div>`).join('');
  updateTrackSummary();
}
```

- [ ] **Step 2: 在 app.js init() 中添加曲目列表事件委托**

```javascript
  // 曲目列表事件委托
  const trackList = document.getElementById('trackList');
  trackList.addEventListener('input', (e) => {
    const row = e.target.closest('.track-row');
    if (!row) return;
    const idx = parseInt(row.dataset.trackIndex);
    if (e.target.classList.contains('track-name-input')) {
      editingTracks[idx].name = e.target.value;
    } else if (e.target.classList.contains('track-score-input')) {
      e.target.value = e.target.value.replace(/[^0-9NR]/g, '');
      const v = e.target.value.trim();
      if (v === 'NR') { editingTracks[idx].score = 'NR'; }
      else if (v === '') { editingTracks[idx].score = null; }
      else {
        const n = parseInt(v);
        editingTracks[idx].score = (n >= 0 && n <= 100) ? n : null;
        e.target.value = editingTracks[idx].score != null ? editingTracks[idx].score : '';
      }
      updateTrackSummary();
    }
  });
  trackList.addEventListener('change', (e) => {
    const row = e.target.closest('.track-row');
    if (!row) return;
    const idx = parseInt(row.dataset.trackIndex);
    if (e.target.classList.contains('track-name-input')) {
      editingTracks[idx].name = e.target.value;
    } else if (e.target.classList.contains('track-score-input')) {
      const v = e.target.value.trim();
      if (v === 'NR') { editingTracks[idx].score = 'NR'; }
      else if (v === '') { editingTracks[idx].score = null; }
      else {
        const n = parseInt(v);
        editingTracks[idx].score = (n >= 0 && n <= 100) ? n : null;
        e.target.value = editingTracks[idx].score != null ? editingTracks[idx].score : '';
      }
      updateTrackSummary();
    }
  });
  trackList.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-action="remove-track"]');
    if (removeBtn) {
      removeTrack(parseInt(removeBtn.dataset.trackIndex));
    }
  });
```

- [ ] **Step 3: 验证**

浏览器中确认：添加曲目正常、输入曲名正常、输入分数正常（含 NR）、删除曲目正常、汇总数字实时更新。

- [ ] **Step 4: 提交**

```bash
git add js/modal.js js/app.js
git commit -m "refactor: 弹窗曲目列表改用事件委托，移除内联 oninput/onchange/onclick"
```

---

## Task 3: 渲染性能优化

**目标：** 减少不必要的 DOM 操作，优化 renderContent 流程。

**Files:**
- Modify: `js/render.js` — `renderContent` 函数

- [ ] **Step 1: 添加 HTML 缓存，跳过无变化的渲染**

在 render.js 顶部添加一个缓存变量：

```javascript
let _lastContentHtml = '';
```

修改 `renderContent()` 函数，在最后的 `area.innerHTML = html;` 之前加缓存检查：

```javascript
function renderContent() {
  const area = document.getElementById('contentArea');
  let html = '';
  // ... 原有 HTML 生成逻辑不变 ...

  // 缓存检查：HTML 未变化时跳过 DOM 重建
  if (html === _lastContentHtml) {
    updateToolbarStats();
    return;
  }
  _lastContentHtml = html;

  area.innerHTML = html;
  rebuildCardCache();
  // ... 后续逻辑不变 ...
}
```

- [ ] **Step 2: 在 refreshAll 中清除缓存**

修改 `utils.js` 中的 `refreshAll()` 函数，确保数据变更后强制重建：

```javascript
function refreshAll() {
  buildEntryIndex();
  _lastContentHtml = ''; // 清除缓存，强制重建
  renderSidebar();
  renderContent();
  saveData();
}
```

- [ ] **Step 3: 侧边栏同样加缓存**

在 render.js 顶部添加：

```javascript
let _lastSidebarHtml = '';
```

在 `renderSidebar()` 函数中，`nav.innerHTML = html;` 之前加缓存检查：

```javascript
  if (html === _lastSidebarHtml) return;
  _lastSidebarHtml = html;
  nav.innerHTML = html;
```

在 `refreshAll()` 中同样清除：

```javascript
function refreshAll() {
  buildEntryIndex();
  _lastContentHtml = '';
  _lastSidebarHtml = '';
  renderSidebar();
  renderContent();
  saveData();
}
```

- [ ] **Step 4: 验证**

浏览器中确认：编辑后刷新正常、筛选后刷新正常、拖拽排序后刷新正常、多次触发 refreshAll 不出现渲染遗漏。

- [ ] **Step 5: 提交**

```bash
git add js/render.js js/utils.js
git commit -m "perf: 添加侧边栏和内容区 HTML 缓存，跳过无变化的 DOM 重建"
```

---

## Task 4: 数据安全增强

**目标：** 修复 innerHTML 安全漏洞、增强 JSON 导入校验、添加 localStorage 容量监控。

### Task 4a: innerHTML 安全审计

**Files:**
- Modify: `js/render.js` — 修复未转义的 data 属性值
- Modify: `js/modal.js` — 检查曲目渲染

- [ ] **Step 1: 审计并修复 render.js 中的 escapeHtml 遗漏**

在 Task 2a 中已修复了 `renderAlbumCard` 和 `renderAotyCard` 中 data 属性的转义。此处确认 `renderSidebar` 中的 `data-section` 和 `data-section-id` 也需要转义：

```javascript
// data-section 属性（原: data-section="${section.id}"）
html += `<div class="nav-group" data-section="${escapeHtml(section.id)}">`;

// data-section-id 属性（原: data-section-id="${section.id}"）
html += `<span class="nav-group-delete" data-action="delete-year" data-section-id="${escapeHtml(section.id)}" ...>×</span>`;
```

- [ ] **Step 2: 审计 modal.js 中的 escapeHtml 遗漏**

检查 `renderTracks()` 函数，确认 `escapeHtml(tr.name)` 已使用（当前已使用，无需改动）。

- [ ] **Step 3: 提交**

```bash
git add js/render.js
git commit -m "security: 审计 innerHTML 转义，修复 data 属性值未转义的 XSS 风险"
```

### Task 4b: JSON 导入校验增强

**Files:**
- Modify: `js/app.js` — `handleImport` 函数

- [ ] **Step 1: 添加数据结构深度校验**

替换 `handleImport` 中的简单校验：

```javascript
function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed || !Array.isArray(parsed.sections)) {
        alert(t('alert.invalidJson'));
        return;
      }
      // 深度校验：确保每个 section 结构正确
      for (const section of parsed.sections) {
        if (!section.id || !Array.isArray(section.groups)) {
          alert(t('alert.invalidJson'));
          return;
        }
        for (const group of section.groups) {
          if (!group.name || !Array.isArray(group.entries)) {
            alert(t('alert.invalidJson'));
            return;
          }
          // 校验并修复每个 entry 的字段
          for (const entry of group.entries) {
            if (!entry.id) entry.id = generateId();
            if (typeof entry.title !== 'string') entry.title = String(entry.title || '');
            if (typeof entry.artist !== 'string') entry.artist = String(entry.artist || '');
            if (entry.score != null) entry.score = Math.max(0, Math.min(100, parseInt(entry.score) || 0));
            if (!Array.isArray(entry.tags)) entry.tags = [];
            if (!Array.isArray(entry.tracks)) entry.tracks = [];
            if (typeof entry.review !== 'string') entry.review = String(entry.review || '');
            if (typeof entry.scoreNote !== 'string') entry.scoreNote = String(entry.scoreNote || '');
            if (typeof entry.date !== 'string') entry.date = String(entry.date || '');
            if (typeof entry.notes !== 'string') entry.notes = String(entry.notes || '');
            if (typeof entry.isAoty !== 'boolean') entry.isAoty = false;
            if (typeof entry.isSoty !== 'boolean') entry.isSoty = false;
          }
        }
      }
      appData = parsed;
      ensureDefaultGroups();
      refreshAll();
    } catch (err) {
      alert(t('alert.invalidJsonGeneric'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
```

- [ ] **Step 2: 验证**

创建一个格式有缺陷的 JSON 文件（缺少字段、类型错误），导入后确认不会崩溃，字段被自动修复。

- [ ] **Step 3: 提交**

```bash
git add js/app.js
git commit -m "security: 增强 JSON 导入校验，自动修复格式缺陷防止运行时错误"
```

### Task 4c: localStorage 容量监控

**Files:**
- Modify: `js/app.js` — `saveData` 函数

- [ ] **Step 1: 在 saveData 中添加容量检查**

```javascript
function saveData() {
  try {
    const json = JSON.stringify(appData);
    localStorage.setItem('musicData', json);
    // 容量监控：超过 4MB 时警告（localStorage 上限通常为 5-10MB）
    if (json.length > 4 * 1024 * 1024) {
      console.warn('localStorage 数据量较大 (' + (json.length / 1024 / 1024).toFixed(1) + 'MB)，接近浏览器存储上限');
    }
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      alert('存储空间已满，请导出数据后清理部分年份。');
    } else {
      console.error('Failed to save data:', e);
    }
  }
}
```

- [ ] **Step 2: 验证**

在控制台确认正常保存时无警告，手动构造大体积数据时出现 console.warn。

- [ ] **Step 3: 提交**

```bash
git add js/app.js
git commit -m "security: 添加 localStorage 容量监控，QuotaExceeded 时提示用户"
```

---

## 自检清单

- [ ] Task 1: render.js 拆分后，浏览器中所有功能正常
- [ ] Task 2: 页面中零个 `onclick=`/`onkeydown=`/`oninput=`/`onchange=` 内联属性
- [ ] Task 3: 编辑单个条目后，只有受影响的区域被重建
- [ ] Task 4: 所有 `innerHTML` 插入的用户数据都经过 `escapeHtml()`
- [ ] Task 4: 导入畸形 JSON 不会导致页面崩溃
- [ ] Task 4: localStorage 超限时有明确提示
