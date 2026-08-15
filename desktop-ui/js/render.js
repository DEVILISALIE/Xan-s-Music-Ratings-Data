// HTML 缓存，避免无变化时的 DOM 重建
let _lastSidebarHtml = '';
let _lastContentHtml = '';

// 卡片只缓存小尺寸缩略图，原图由编辑弹窗按需读取并在关闭时释放
const coverThumbnailCache = new Map();
const coverThumbnailLoads = new Map();
const COVER_THUMBNAIL_CACHE_LIMIT = 64;
let coverThumbnailObserver = null;

function cacheCoverThumbnail(entryId, dataUrl) {
  coverThumbnailCache.delete(entryId);
  coverThumbnailCache.set(entryId, dataUrl);
  while (coverThumbnailCache.size > COVER_THUMBNAIL_CACHE_LIMIT) {
    coverThumbnailCache.delete(coverThumbnailCache.keys().next().value);
  }
}

function invalidateCoverThumbnail(entryId) {
  coverThumbnailCache.delete(entryId);
  coverThumbnailLoads.delete(entryId);
}

function applyCoverThumbnail(entryId, dataUrl) {
  document.querySelectorAll(`.album-cover-thumb[data-cover-id="${entryId}"]`).forEach(img => {
    img.src = dataUrl;
    img.removeAttribute('data-cover-id');
  });
}

async function loadLocalCoverThumbnail(entryId) {
  const cached = coverThumbnailCache.get(entryId);
  if (cached) {
    applyCoverThumbnail(entryId, cached);
    return;
  }

  if (coverThumbnailLoads.has(entryId)) {
    try {
      const dataUrl = await coverThumbnailLoads.get(entryId);
      if (dataUrl) applyCoverThumbnail(entryId, dataUrl);
    } catch (_) {}
    return;
  }

  const loadPromise = (async () => {
    if (!window.__TAURI__?.core?.invoke) {
      throw new Error('Tauri not ready');
    }
    try {
      return await window.__TAURI__.core.invoke('read_cover_thumbnail', { entryId });
    } catch (_) {
      return await window.__TAURI__.core.invoke('read_cover', { entryId });
    }
  })();

  coverThumbnailLoads.set(entryId, loadPromise);

  try {
    const dataUrl = await loadPromise;
    if (dataUrl) {
      cacheCoverThumbnail(entryId, dataUrl);
      applyCoverThumbnail(entryId, dataUrl);
    }
  } catch (_) {
    document.querySelectorAll(`.album-cover-thumb[data-cover-id="${entryId}"]`).forEach(img => {
      img.classList.add('cover-load-failed');
    });
  } finally {
    coverThumbnailLoads.delete(entryId);
  }
}

function loadObservedCover(img) {
  if (!img) return;
  const remoteUrl = img.dataset.coverUrl;
  if (remoteUrl) {
    img.src = remoteUrl;
    img.removeAttribute('data-cover-url');
    return;
  }
  const entryId = img.dataset.coverId;
  if (entryId) {
    loadLocalCoverThumbnail(entryId);
  }
}

function observeCoverThumbnails(root) {
  const container = root || document.getElementById('contentArea') || document.body;
  const images = container.querySelectorAll('.album-cover-thumb[data-cover-id], .album-cover-thumb[data-cover-url]');
  if (!images.length) return;

  if (!('IntersectionObserver' in window)) {
    images.forEach(loadObservedCover);
    return;
  }
  if (!coverThumbnailObserver) {
    coverThumbnailObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        coverThumbnailObserver.unobserve(entry.target);
        loadObservedCover(entry.target);
      }
    }, {
      rootMargin: '200px 0px'
    });
  }
  images.forEach(img => coverThumbnailObserver.observe(img));
}

// 滚动同步缓存：滚动帧只做二分查找，避免反复读取所有分组布局
let _cachedNavItems = [];
let _cachedGroupEls = [];
let _cachedGroupPositions = [];
let _navItemByGroup = new Map();
let _activeNavItem = null;
let _scrollActivationOffset = 0;
let _scrollCacheRaf = 0;
let _contentResizeObserver = null;

function rebuildScrollCache() {
  if (_scrollCacheRaf) cancelAnimationFrame(_scrollCacheRaf);
  _scrollCacheRaf = 0;
  const main = document.getElementById('mainContent');
  _cachedNavItems = [...document.querySelectorAll('.nav-item[data-nav]')];
  _cachedGroupEls = [...document.querySelectorAll('[id^="group-"]')];
  _navItemByGroup = new Map(_cachedNavItems.map(item => [item.dataset.nav, item]));
  _activeNavItem = document.querySelector('.nav-item.active');

  if (!main) {
    _cachedGroupPositions = [];
    return;
  }

  const mainRect = main.getBoundingClientRect();
  _scrollActivationOffset = Math.max(0, 60 - mainRect.top);
  _cachedGroupPositions = _cachedGroupEls.map(el => ({
    id: el.id.slice(6),
    top: el.getBoundingClientRect().top - mainRect.top + main.scrollTop
  })).sort((a, b) => a.top - b.top);
}

function animateCardChange(card) {
  if (!card || document.documentElement.dataset.desktop !== 'true' || !card.animate) return;
  card.animate([
    { opacity: 0.72, transform: 'translate3d(0, 5px, 0)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' }
  ], {
    duration: 180,
    easing: 'cubic-bezier(0.2, 0, 0, 1)'
  });
}

function scheduleScrollCacheRebuild() {
  if (_scrollCacheRaf) return;
  _scrollCacheRaf = requestAnimationFrame(rebuildScrollCache);
}

function setActiveNavItem(target) {
  const activeItems = [...document.querySelectorAll('.nav-item.active')];
  const targetIsOnlyActive = target && activeItems.length === 1 && activeItems[0] === target;
  if ((_activeNavItem === target && targetIsOnlyActive) || (!target && activeItems.length === 0)) return;

  // 统一清理旧高亮，避免年度锚点和普通分组同时高亮。
  activeItems.forEach(item => {
    if (item !== target) item.classList.remove('active');
  });
  target?.classList.add('active');
  _activeNavItem = target || null;
}

function findCurrentScrollGroup(scrollTop) {
  let low = 0;
  let high = _cachedGroupPositions.length - 1;
  let match = '';
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (_cachedGroupPositions[mid].top <= scrollTop) {
      match = _cachedGroupPositions[mid].id;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return match;
}

function syncActiveNavItemToScrollPosition(main = document.getElementById('mainContent')) {
  if (!main || _cachedGroupPositions.length === 0) return;

  const currentGroup = findCurrentScrollGroup(main.scrollTop + _scrollActivationOffset);
  const currentSectionId = currentGroup ? currentGroup.split('-')[0] : '';
  setActiveNavItem(_navItemByGroup.get(currentGroup));

  if (!currentGroup) return;
  const group = document.querySelector(`.nav-group[data-section="${currentSectionId}"]`);
  if (!group) return;
  const header = group.querySelector('.nav-group-header');
  const items = group.querySelector('.nav-group-items');
  if (header && header.classList.contains('collapsed')) {
    header.classList.remove('collapsed');
    items.classList.remove('collapsed');
  }
}

function holdActiveNavItemDuringScroll(target) {
  const main = document.getElementById('mainContent');
  const content = document.getElementById('contentArea');
  if (!target || !main || !content) return;

  resetNavScrollLock();
  setActiveNavItem(target);
  content.classList.add('overview-scroll');
  window._navActiveTimeout = setTimeout(() => {
    window._navActiveTimeout = null;
    content.classList.remove('overview-scroll');
    syncActiveNavItemToScrollPosition(main);
  }, 1500);
}

function releaseNavScrollLockForManualScroll(main) {
  const content = document.getElementById('contentArea');
  if (!content?.classList.contains('overview-scroll')) return;
  resetNavScrollLock();
  content.classList.remove('overview-scroll');
  syncActiveNavItemToScrollPosition(main);
}

// 获取所有 sections 并按年份降序排列
// 旧版 localStorage 数据可能还有 vol sections，这里做兼容合并
function getMergedSections() {
  debugAotyCount('getMergedSections 开始');
  const volByYear = {};
  const normalSections = [];

  for (const section of appData.sections) {
    const volMatch = section.id.match(/^vol\d+-(\d{4})$/);
    if (volMatch) {
      const year = volMatch[1];
      if (!volByYear[year]) volByYear[year] = [];
      volByYear[year].push(section);
    } else {
      normalSections.push(section);
    }
  }

  const result = [];
  const volYears = Object.keys(volByYear).sort((a, b) => b - a);

  for (const section of normalSections) {
    const merged = { ...section, groups: section.groups.map(g => ({ ...g, entries: g.entries.map(e => ({...e})) })) };
    result.push(merged);
    const year = section.id;
    if (volByYear[year]) {
      for (const vol of volByYear[year]) {
        for (const vg of vol.groups) {
          let target = merged.groups.find(g => g.name === vg.name);
          if (!target) {
            target = { name: vg.name, entries: [] };
            merged.groups.push(target);
          }
          target.entries.push(...vg.entries);
        }
      }
      delete volByYear[year];
    }
  }

  for (const year of volYears) {
    if (!volByYear[year]) continue;
    const sections = volByYear[year];
    const merged = {
      id: year,
      title: t('content.sectionTitle', { year }),
      groups: []
    };
    for (const vol of sections) {
      for (const vg of vol.groups) {
        let target = merged.groups.find(g => g.name === vg.name);
        if (!target) {
          target = { name: vg.name, entries: [] };
          merged.groups.push(target);
        }
        target.entries.push(...vg.entries);
      }
    }
    result.push(merged);
  }

  // 按年份降序排列，非数字 ID（如 decade sections）排在最后
  result.sort((a, b) => {
    const ya = parseInt(a.id), yb = parseInt(b.id);
    const na = isNaN(ya), nb = isNaN(yb);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return yb - ya;
  });

  debugAotyCount('getMergedSections 结束');
  return result;
}

// 迁移旧版 vol sections 数据（合并到对应年份 section）
function migrateVolSections() {
  const volByYear = {};
  const nonVol = [];

  for (const section of appData.sections) {
    const volMatch = section.id.match(/^vol(\d+)-(\d{4})$/);
    if (volMatch) {
      const year = volMatch[2];
      const volNum = parseInt(volMatch[1]);
      if (!volByYear[year]) volByYear[year] = [];
      volByYear[year].push({ volNum, section });
    } else {
      nonVol.push(section);
    }
  }

  if (Object.keys(volByYear).length === 0) return false; // 无需迁移

  for (const [year, vols] of Object.entries(volByYear)) {
    // 按 vol 编号排序
    vols.sort((a, b) => a.volNum - b.volNum);

    // 找到已有的年份 section 或创建新的
    let target = nonVol.find(s => s.id === year);
    if (!target) {
      target = { id: year, title: year, groups: [{ name: "Albums", entries: [] }] };
      nonVol.push(target);
    }

    // 合并 vol sections 的 groups
    for (const { section } of vols) {
      for (const vg of section.groups) {
        let targetGroup = target.groups.find(g => g.name === vg.name);
        if (!targetGroup) {
          targetGroup = { name: vg.name, entries: [] };
          target.groups.push(targetGroup);
        }
        targetGroup.entries.push(...vg.entries);
      }
    }
  }

  appData.sections = nonVol;
  return true;
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  let html = '';
  // 添加新年份按钮
  html += `<div style="padding:8px 16px;">
    <button class="sidebar-add-year-btn" data-action="add-new-year">${t('sidebar.newYear')}</button>
  </div>`;
  const mergedSections = getMergedSections();
  for (const section of mergedSections) {
    const yearNum = parseInt(section.id);
    const displayName = getSectionDisplayName(section);
    const groupCount = section.groups.reduce((s, g) => s + g.entries.length, 0);

    html += `<div class="nav-group" data-section="${escapeHtml(section.id)}">`;
    html += `<div class="nav-group-header" role="button" tabindex="0" data-action="toggle-nav-group">`;
    html += `<span class="arrow">▾</span>${displayName}`;
    if (!isNaN(yearNum)) {
      html += `<span class="nav-group-delete" data-action="delete-year" data-section-id="${escapeHtml(section.id)}" title="${currentLang === 'zh' ? '删除' + yearNum + '年' : 'Delete ' + yearNum}">×</span>`;
    }
    html += `</div>`;
    html += `<div class="nav-group-items">`;

    // Sub-groups（AOTY 在 Albums 上方，SOTY 在 Singles 上方）
    const albumsGroup = section.groups.find(g => g.name === 'Albums');
    const singlesGroup = section.groups.find(g => g.name === 'Singles');
    const aotyCount = albumsGroup ? albumsGroup.entries.filter(e => e.isAoty).length : 0;
    const sotyCount = singlesGroup ? singlesGroup.entries.filter(e => e.isSoty).length : 0;

    if (aotyCount > 0) {
      const gid = getGroupId(section.id, 'aoty');
      html += `<a class="nav-item" href="#group-${escapeHtml(gid)}" data-nav="${escapeHtml(gid)}" data-action="nav-click">${t('sidebar.aoty')} (${aotyCount})</a>`;
    }
    if (albumsGroup && albumsGroup.entries.length > 0) {
      const gid = getGroupId(section.id, 'Albums');
      html += `<a class="nav-item" href="#group-${escapeHtml(gid)}" data-nav="${escapeHtml(gid)}" data-action="nav-click">${t('toolbar.albums')} (${albumsGroup.entries.length})</a>`;
    }
    if (sotyCount > 0) {
      const gid = getGroupId(section.id, 'soty');
      html += `<a class="nav-item" href="#group-${escapeHtml(gid)}" data-nav="${escapeHtml(gid)}" data-action="nav-click">${t('sidebar.soty')} (${sotyCount})</a>`;
    }
    if (singlesGroup && singlesGroup.entries.length > 0) {
      const gid = getGroupId(section.id, 'Singles');
      html += `<a class="nav-item" href="#group-${escapeHtml(gid)}" data-nav="${escapeHtml(gid)}" data-action="nav-click">${t('toolbar.singles')} (${singlesGroup.entries.length})</a>`;
    }

    html += `</div></div>`;
  }
  if (html === _lastSidebarHtml) return;
  _lastSidebarHtml = html;
  nav.innerHTML = html;
  scheduleScrollCacheRebuild();
}

function toggleNavGroup(el) {
  el.classList.toggle('collapsed');
  const items = el.nextElementSibling;
  items.classList.toggle('collapsed');
}

function scrollToGroup(gid, e, offset) {
  if (e) e.preventDefault();
  const el = document.getElementById('group-' + gid);
  const main = document.getElementById('mainContent');
  if (!el || !main) return;

  let cardGroupId = gid;
  let specialCardClass = '';
  if (gid.endsWith('-aoty')) {
    cardGroupId = gid.slice(0, -5) + '-albums';
    specialCardClass = 'aoty-card';
  } else if (gid.endsWith('-soty')) {
    cardGroupId = gid.slice(0, -5) + '-singles';
    specialCardClass = 'soty-card';
  }

  // 以第一张可见卡片为基准，让卡片上沿贴在粘性工具栏下方。
  const firstVisibleCard = [...document.querySelectorAll('.album-card, .aoty-card')].find(card => {
    if (card.classList.contains('hidden') || card.dataset.group !== cardGroupId) return false;
    return !specialCardClass || card.classList.contains(specialCardClass);
  });
  const target = firstVisibleCard || el;

  // 新导航开始时先停止旧的平滑滚动，避免旧动画继续影响新的目标位置。
  if (main._groupScrollAlignTimer) {
    clearTimeout(main._groupScrollAlignTimer);
    main._groupScrollAlignTimer = 0;
  }
  main.scrollTo({ top: main.scrollTop, behavior: 'auto' });

  const toolbar = main.querySelector('.toolbar');
  const toolbarBottom = toolbar
    ? toolbar.getBoundingClientRect().bottom
    : main.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  const desiredScrollTop = main.scrollTop + targetTop - toolbarBottom - (offset || 0);
  const maxScrollTop = Math.max(0, main.scrollHeight - main.clientHeight);
  const y = Math.max(0, Math.min(maxScrollTop, desiredScrollTop));

  // 只使用一次原生平滑滚动，避免固定延迟的 scrollBy 在动画末尾强行吸附。
  main.scrollTo({ top: y, behavior: 'smooth' });
}

async function addNewYear() {
  const year = await showPrompt(t('dialog.yearPrompt'), t('dialog.yearPromptHint'));
  if (!year) return;
  if (!/^\d{4}$/.test(year)) {
    showAlert(t('dialog.invalidYear'));
    return;
  }

  const exists = appData.sections.some(s => s.id === year);
  if (exists) {
    showAlert(t('dialog.yearExists', { year }));
    return;
  }

  const newSection = {
    id: year,
    title: t('content.sectionTitle', { year }),
    groups: [
      { name: "Albums", entries: [] },
      { name: "Singles", entries: [] }
    ]
  };

  appData.sections.push(newSection);
  refreshAll();

  setTimeout(() => scrollToGroup(getGroupId(year, 'Albums')), 100);
}

// 搜索结果跳转时激活侧边栏对应导航项
function activateNavItem(groupId) {
  // 找到目标导航项并激活
  var target = document.querySelector('.nav-item[data-nav="' + groupId + '"]');
  if (!target) return;
  setActiveNavItem(target);
  // 展开所属 section（如果折叠了）
  var sectionId = groupId.split('-')[0];
  var group = document.querySelector('.nav-group[data-section="' + sectionId + '"]');
  if (group) {
    var header = group.querySelector('.nav-group-header');
    var items = group.querySelector('.nav-group-items');
    if (header && header.classList.contains('collapsed')) {
      header.classList.remove('collapsed');
      items.classList.remove('collapsed');
    }
  }
  // 滚动侧边栏使目标导航项可见
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // 禁用滚动同步，防止内容区滚动覆盖侧边栏高亮
  holdActiveNavItemDuringScroll(target);
}

function setupScrollSync() {
  const main = document.getElementById('mainContent');
  if (main._scrollSyncBound) return;
  main._scrollSyncBound = true;
  let ticking = false;
  let lastSyncTime = -Infinity;

  main.addEventListener('scroll', () => {
    const now = performance.now();
    if (now - lastSyncTime < 32) return;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      lastSyncTime = performance.now();
      // 点击期间完全跳过滚动同步
      if (document.getElementById('contentArea').classList.contains('overview-scroll')) {
        ticking = false;
        return;
      }

      const currentGroup = findCurrentScrollGroup(main.scrollTop + _scrollActivationOffset);

      // 找到当前激活 group 所在的 section
      const currentSectionId = currentGroup ? currentGroup.split('-')[0] : '';

      setActiveNavItem(_navItemByGroup.get(currentGroup));

      // 自动展开当前 group 所在 section 的侧边栏
      if (currentGroup) {
        const group = document.querySelector(`.nav-group[data-section="${currentSectionId}"]`);
        if (group) {
          const header = group.querySelector('.nav-group-header');
          const items = group.querySelector('.nav-group-items');
          if (header && header.classList.contains('collapsed')) {
            header.classList.remove('collapsed');
            items.classList.remove('collapsed');
          }
        }
      }
      ticking = false;
    });
  }, { passive: true });

  // 用户主动滚动时立即解除点击导航锁定，旧的年度高亮不会继续滞留。
  const releaseForManualScroll = () => releaseNavScrollLockForManualScroll(main);
  main.addEventListener('wheel', releaseForManualScroll, { passive: true });
  main.addEventListener('touchstart', releaseForManualScroll, { passive: true });
  main.addEventListener('pointerdown', releaseForManualScroll, { passive: true });

  const content = document.getElementById('contentArea');
  if (content && 'ResizeObserver' in window && !_contentResizeObserver) {
    _contentResizeObserver = new ResizeObserver(scheduleScrollCacheRebuild);
    _contentResizeObserver.observe(content);
  }
}


// ===== Content Rendering =====
function renderContent() {
  const area = document.getElementById('contentArea');
  let html = '';
  let totalCount = 0;
  let visibleCount = 0;

  const mergedSections = getMergedSections();
  for (const section of mergedSections) {
    html += `<div class="section" id="section-${escapeHtml(section.id)}">`;
    // 沿用侧边栏的显示逻辑（年代 sections 直接取 title，整十年份显示为 xxxxs）
    const displayYear = getSectionDisplayName(section);
    html += `<h2 class="section-title">${escapeHtml(displayYear)}</h2>`;

    // 动态重组：AOTY 条目(isAoty)归入 Albums 顶部，SOTY 条目(isSoty)归入 Singles 顶部
    const aotyAlbumEntries = [];
    const sotySingleEntries = [];
    const normalEntriesMap = {}; // groupName → normalEntries[]
    for (const group of section.groups) {
      if (group.name === 'AOTY') continue;
      normalEntriesMap[group.name] = [];
      for (const entry of group.entries) {
        if (group.name === 'Singles' && entry.isSoty) {
          sotySingleEntries.push(entry);
        } else if (group.name !== 'Singles' && entry.isAoty) {
          aotyAlbumEntries.push(entry);
        } else {
          normalEntriesMap[group.name].push(entry);
        }
      }
    }

    // 始终显示 Albums 和 Singles（即使为空），AOTY/SOTY 条目置顶
    const displayGroups = [];
    const albumEntries = [...aotyAlbumEntries, ...(normalEntriesMap['Albums'] || [])];
    const singleEntries = [...sotySingleEntries, ...(normalEntriesMap['Singles'] || [])];

    if (albumEntries.length > 0) displayGroups.push({ name: 'Albums', entries: albumEntries });
    if (singleEntries.length > 0) displayGroups.push({ name: 'Singles', entries: singleEntries });

    // AOTY/SOTY 锚点是否需要的标记
    const hasAoty = aotyAlbumEntries.length > 0;
    const hasSoty = sotySingleEntries.length > 0;

    // AOTY 锚点放在 section 顶部，Albums 标题上方
    if (hasAoty) {
      html += `<div id="group-${escapeHtml(getGroupId(section.id, 'aoty'))}" style="height:1px;margin:0;padding:0;overflow:hidden"></div>`;
    }

    for (const group of displayGroups) {
      const gid = getGroupId(section.id, group.name);

      // SOTY 锚点放在 Albums 下方、Singles 标题上方
      if (group.name === 'Singles' && hasSoty) {
        html += `<div id="group-${escapeHtml(getGroupId(section.id, 'soty'))}" style="height:1px;margin:0;padding:0;overflow:hidden"></div>`;
      }

      // 渲染分组标题（支持中英文）
      if (group.entries.length > 0) {
        const groupLabel = group.name === 'Albums' ? t('toolbar.albums') : group.name === 'Singles' ? t('toolbar.singles') : group.name;
        html += `<div class="group-title" id="group-${escapeHtml(gid)}">${escapeHtml(groupLabel)}</div>`;
      }

      // 卡片列表
      if (group.entries.length > 0) {
        html += `<div class="group-cards-list">`;
      }

      let idx = 0;
      for (const entry of group.entries) {
        idx++;
        totalCount++;
        const visible = matchesFilter(entry);
        if (visible) visibleCount++;

        const isSpecial = (group.name === 'Singles' && entry.isSoty) || (group.name !== 'Singles' && entry.isAoty);
        if (isSpecial) {
          html += renderAotyCard(entry, section.id, gid, visible, group.name);
        } else {
          html += renderAlbumCard(entry, idx, section.id, gid, group.name, visible);
        }
      }

      if (group.entries.length > 0) {
        html += `</div>`; // .group-cards-list
      }
    }

    html += `</div>`;
  }

  // 更新右侧固定统计面板
  updateGlobalStatsSidebar();

  // 缓存检查：HTML 未变化时跳过 DOM 重建
  if (html === _lastContentHtml) {
    updateToolbarStats();
    return;
  }
  _lastContentHtml = html;

  area.innerHTML = html;
  observeCoverThumbnails(area);
  rebuildCardCache();
  rebuildScrollCache();

  updateToolbarStats();
  searchResults = [];
  for (const { card } of allCards) {
    if (!card.classList.contains('hidden')) searchResults.push(card);
  }

  // 搜索状态下更新导航按钮
  const nextBtn = document.getElementById('searchNextBtn');
  const prevBtn = document.getElementById('searchPrevBtn');
  if (searchQuery && searchResults.length > 0) {
    nextBtn.style.display = 'flex';
    prevBtn.style.display = 'flex';
    searchIndex = 0;
    highlightSearchResult(0);
  } else {
    nextBtn.style.display = 'none';
    prevBtn.style.display = 'none';
    clearSearchHighlight();
    searchIndex = -1;
  }
}

// 全局统计面板（专辑 + 单曲两个）
function updateGlobalStatsSidebar() {
  const panel = document.getElementById('globalStatsSidebar');
  if (!panel || !appData) return;

  // 分类收集：专辑 vs 单曲
  const albumScores = [];
  const singleScores = [];
  for (const section of appData.sections) {
    for (const group of section.groups) {
      if (group.name === 'Albums') {
        for (const entry of group.entries) {
          if (entry.score != null) albumScores.push(entry.score);
        }
      } else if (group.name === 'Singles') {
        for (const entry of group.entries) {
          if (entry.score != null) singleScores.push(entry.score);
        }
      }
    }
  }

  function buildPanel(scores, label, totalEntries) {
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
    const nrCount = totalEntries - scores.length;
    // 100 单独一栏，90-99 为 90+
    const ranges = [[100, 100], [90, 99], [80, 89], [70, 79], [60, 69], [50, 59], [0, 49]];
    const dist = ranges.map(([lo, hi]) => scores.filter(s => s >= lo && s <= hi).length);
    const maxCount = Math.max(...dist, 1);

    let barsHtml = '';
    for (let i = 0; i < ranges.length; i++) {
      const pct = Math.round(dist[i] / maxCount * 100);
      const rangeLabel = i === 0 ? '100' : i === 1 ? '90-99' : i === ranges.length - 1 ? '0-49' : String(ranges[i][0]) + '-' + String(ranges[i][1]);
      barsHtml += '<div class="stats-row">' +
        '<span class="stats-label">' + rangeLabel + '</span>' +
        '<div class="stats-bar-track"><div class="stats-bar" style="width:' + pct + '%"></div></div>' +
        '<span class="stats-count">' + (dist[i] || '') + '</span>' +
        '</div>';
    }

    return '<div class="stats-card">' +
      '<div class="stats-card-title">' + label + '</div>' +
      '<div class="stats-header">' +
      '<span class="stats-avg-value">' + avg + '</span>' +
      '<span class="stats-avg-label">' + t('stats.avg') + '</span>' +
      '</div>' +
      '<div class="stats-dist">' + barsHtml + '</div>' +
      '<div class="stats-nr">' + t('stats.scored') + ': ' + scores.length + '</div>' +
      '<div class="stats-nr">' + t('stats.nr') + ': ' + nrCount + '</div>' +
      '<div class="stats-nr">' + t('stats.entries') + ': ' + totalEntries + '</div>' +
      '</div>';
  }

  const albumTotal = appData.sections.reduce((sum, s) => {
    const g = s.groups.find(g => g.name === 'Albums');
    return sum + (g ? g.entries.length : 0);
  }, 0);
  const singleTotal = appData.sections.reduce((sum, s) => {
    const g = s.groups.find(g => g.name === 'Singles');
    return sum + (g ? g.entries.length : 0);
  }, 0);

  panel.innerHTML = buildPanel(albumScores, t('toolbar.albums'), albumTotal) + buildPanel(singleScores, t('toolbar.singles'), singleTotal);

  // 绑定点击事件
  const cards = panel.querySelectorAll('.stats-card');
  if (cards[0]) cards[0].style.cursor = 'pointer';
  if (cards[0]) cards[0].addEventListener('click', () => openYearlyStats('albums'));
  if (cards[1]) cards[1].style.cursor = 'pointer';
  if (cards[1]) cards[1].addEventListener('click', () => openYearlyStats('singles'));
}

function openYearlyStats(type) {
  const groupName = type === 'albums' ? 'Albums' : 'Singles';
  const titleKey = type === 'albums' ? 'stats.yearlyAlbums' : 'stats.yearlySingles';

  // 收集每 section 的平均分
  const rows = [];
  for (const section of appData.sections) {
    const scores = [];
    for (const group of section.groups) {
      if (group.name === groupName) {
        for (const entry of group.entries) {
          if (entry.score != null) scores.push(entry.score);
        }
      }
    }
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      rows.push({ year: section.id, avg: avg, count: scores.length });
    }
  }

  // 按年份从新到旧排序（统一年代与具体年份解析降序规则）
  rows.sort((a, b) => {
    const ya = parseInt(a.year), yb = parseInt(b.year);
    const na = isNaN(ya), nb = isNaN(yb);
    if (na && nb) return b.year.localeCompare(a.year);
    if (na) return 1;
    if (nb) return -1;
    if (ya !== yb) return yb - ya;
    return b.year.localeCompare(a.year);
  });

  if (rows.length === 0) return;

  const maxAvg = Math.max(...rows.map(r => r.avg));

  const countLabel = type === 'albums'
    ? (currentLang === 'zh' ? '张' : 'A')
    : (currentLang === 'zh' ? '首' : 'S');

  let html = '';
  for (const row of rows) {
    const pct = Math.round(row.avg / maxAvg * 100);
    html += '<div class="yearly-stats-row">' +
      '<span class="yearly-stats-year">' + escapeHtml(row.year) + '</span>' +
      '<div class="yearly-stats-bar-track"><div class="yearly-stats-bar" style="width:' + pct + '%"></div></div>' +
      '<span class="yearly-stats-score">' + row.avg.toFixed(1) + '</span>' +
      '<span class="yearly-stats-count">' + row.count + countLabel + '</span>' +
      '</div>';
  }

  document.getElementById('yearlyStatsTitle').textContent = t(titleKey);
  document.getElementById('yearlyStatsList').innerHTML = html;
  document.getElementById('yearlyStatsModal').classList.add('active');
}

// 封面缩略图 HTML — 供 renderAlbumCard / renderAotyCard 共用
// 支持懒加载：缓存未命中时异步获取并就地更新
function getCoverHtml(entry) {
  if (!entry.cover) return '';
  if (/^https?:\/\//i.test(entry.cover)) {
    return '<img class="album-cover-thumb" data-cover-url="' + escapeHtml(entry.cover) + '" alt="" loading="lazy">';
  }
  const cached = coverThumbnailCache.get(entry.id);
  if (cached) {
    return '<img class="album-cover-thumb" src="' + escapeHtml(cached) + '" alt="" loading="lazy">';
  }
  return '<img class="album-cover-thumb" data-cover-id="' + escapeHtml(entry.id) + '" alt="" loading="lazy">';
}

// 卡片元数据渲染（标签、曲目数、备注文字）— 供 renderAlbumCard / renderAotyCard 共用
function buildCardMeta(entry) {
  const noteText = entry.scoreNote && entry.scoreNote !== 'NR' ? ` (${entry.scoreNote})` : '';
  const noteHtml = noteText ? ' <span style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(noteText) + '</span>' : '';
  const tagsHtml = (entry.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const trackCount = entry.tracks && entry.tracks.length > 0 ? entry.tracks.length : 0;
  const discCount = trackCount > 0 ? new Set(entry.tracks.map(tr => tr.disc || 1)).size : 0;
  const discPrefix = discCount > 1 ? t('content.discLabel', { count: discCount }) : '';
  const trackHtml = trackCount > 0 ? '<span class="track-count" data-track-count="' + trackCount + '" data-disc-count="' + discCount + '" title="' + t('content.trackTooltip') + '">' + discPrefix + trackCount + t('content.trackUnit') + '</span>' : '';
  const tagsBlock = tagsHtml ? '<div class="album-tags">' + tagsHtml + '</div>' : '';
  return { noteHtml, tagsBlock, trackHtml };
}

function renderAlbumCard(entry, idx, sectionId, groupId, groupName, visible) {
  const scoreClass = getScoreClass(entry.score);
  const scoreText = entry.score != null ? entry.score : (entry.scoreNote === 'NR' ? 'NR' : '—');
  const { noteHtml, tagsBlock, trackHtml } = buildCardMeta(entry);
  const hiddenClass = visible ? '' : 'hidden';
  const hasReview = entry.review && entry.review.trim().length > 0;
  const isSingles = groupName === 'Singles' || (groupId && groupId.toLowerCase().includes('singles'));
  const showMustHear = mustHearEnabled && !isSingles && entry.score != null && entry.score >= mustHearThreshold;
  const selectedClass = batchSelectedIds.has(entry.id) ? 'batch-selected' : '';
  const checkedClass = batchSelectedIds.has(entry.id) ? 'checked' : '';

  return `<div class="album-card ${hiddenClass} ${selectedClass}" data-entry-id="${escapeHtml(entry.id)}" data-section="${escapeHtml(sectionId)}" data-group="${escapeHtml(groupId)}" data-action="open-edit" role="button" tabindex="0">
    <div class="batch-checkbox ${checkedClass}" data-action="batch-toggle-entry" data-entry-id="${escapeHtml(entry.id)}"></div>
    <span class="album-index">${idx}</span>
    ${getCoverHtml(entry)}
    <div class="album-info">
      <div class="album-title">${escapeHtml(entry.title)}${noteHtml}</div>
      <div class="album-artist">${escapeHtml(entry.artist || '')}</div>
      ${showMustHear ? '<span class="must-hear">' + t('content.mustHear') + '</span>' : ''}
    </div>
    <div class="album-meta">
      ${tagsBlock}
      ${trackHtml}
      <span class="album-date">${escapeHtml(entry.date || '')}</span>
      <span class="score-badge ${scoreClass}">${scoreText}</span>
      ${hasReview ? '<span class="review-indicator" title="' + t('content.reviewTooltip') + '"></span>' : ''}
      <button class="card-copy-btn" data-action="copy-entry" data-entry-id="${escapeHtml(entry.id)}" title="${t('tooltip.copy')}">
        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="3" ry="3"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>
  </div>`;
}

function renderAotyCard(entry, sectionId, groupId, visible, groupName) {
  const hiddenClass = visible ? '' : 'hidden';
  const scoreText = entry.score != null ? entry.score : (entry.scoreNote === 'NR' ? 'NR' : '—');
  const { noteHtml, tagsBlock, trackHtml } = buildCardMeta(entry);
  const reviewHtml = entry.review ? `<div class="aoty-review" id="review-${escapeHtml(entry.id)}">${escapeHtml(entry.review)}</div>
    <button class="aoty-review-toggle" data-action="toggle-review" data-entry-id="${escapeHtml(entry.id)}">${t('content.showMore')}</button>` : '';
  const selectedClass = batchSelectedIds.has(entry.id) ? 'batch-selected' : '';
  const checkedClass = batchSelectedIds.has(entry.id) ? 'checked' : '';

  return `<div class="aoty-card ${groupName === 'Singles' ? 'soty-card' : ''} ${hiddenClass} ${selectedClass}" data-entry-id="${escapeHtml(entry.id)}" data-section="${escapeHtml(sectionId)}" data-group="${escapeHtml(groupId)}" data-action="open-edit" role="button" tabindex="0">
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div class="batch-checkbox ${checkedClass}" data-action="batch-toggle-entry" data-entry-id="${escapeHtml(entry.id)}"></div>
      ${entry.cover ? '<div class="aoty-cover-wrap">' + getCoverHtml(entry) + '</div>' : ''}
      <div style="flex:1;min-width:0">
        <div class="aoty-header">
          <span class="aoty-badge${groupName === 'Singles' ? ' soty' : ''}">${groupName === 'Singles' ? 'SOTY' : 'AOTY'}</span>
          <span class="aoty-title">${escapeHtml(entry.title)}${noteHtml}</span>
        </div>
        <div class="aoty-artist">${escapeHtml(entry.artist || '')}</div>
        ${reviewHtml}
      </div>
      <div class="album-meta">
        ${tagsBlock}
        ${trackHtml}
        <span class="aoty-date">${escapeHtml(entry.date || '')}</span>
        <span class="aoty-score">${scoreText}</span>
        <button class="card-copy-btn" data-action="copy-entry" data-entry-id="${escapeHtml(entry.id)}" title="${t('tooltip.copy')}">
        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="3" ry="3"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      </div>
    </div>
  </div>`;
}

function updateCardInPlace(entryId) {
  const entry = findEntry(entryId);
  if (!entry) return;
  const card = document.querySelector(`.album-card[data-entry-id="${entryId}"], .aoty-card[data-entry-id="${entryId}"]`);
  if (!card) return;

  const sectionId = card.dataset.section;
  const groupId = card.dataset.group;
  const isVisible = !card.classList.contains('hidden');
  const isAoty = entry.isAoty || entry.isSoty;
  const groupName = groupId.includes('singles') ? 'Singles' : 'Albums';

  const tmp = document.createElement('div');
  if (isAoty) {
    tmp.innerHTML = renderAotyCard(entry, sectionId, groupId, isVisible, groupName);
  } else {
    const idx = card.querySelector('.album-index');
    tmp.innerHTML = renderAlbumCard(entry, idx ? parseInt(idx.textContent) : 1, sectionId, groupId, groupName, isVisible);
  }
  const newCard = tmp.firstElementChild;
  card.replaceWith(newCard);
  observeCoverThumbnails(newCard);
  animateCardChange(newCard);

  // 更新 allCards 缓存中对应条目
  const cached = allCards.find(c => c.entry && c.entry.id === entryId);
  if (cached) cached.card = newCard;
  // 同步更新 searchResults 中的引用，避免搜索结果导航跳过这张卡片
  const srIdx = searchResults.indexOf(card);
  if (srIdx !== -1) searchResults[srIdx] = newCard;
}

function insertNewCardInSection(entry, sel) {
  const sectionId = sel.sectionId;
  const groupName = sel.groupName;
  const groupId = getGroupId(sectionId, groupName);
  const preserveEntryId = searchQuery ? searchResults[searchIndex]?.dataset.entryId : '';
  const sectionEl = document.getElementById('section-' + sectionId);
  if (!sectionEl) { _lastContentHtml = ''; renderContent(); return; }

  const isAoty = entry.isAoty || entry.isSoty;
  const tmp = document.createElement('div');
  if (isAoty) {
    tmp.innerHTML = renderAotyCard(entry, sectionId, groupId, true, groupName);
  } else {
    // 计算正确序号
    const groupCards = document.querySelectorAll('.album-card[data-group="' + groupId + '"]');
    const newIdx = groupCards.length + 1;
    tmp.innerHTML = renderAlbumCard(entry, newIdx, sectionId, groupId, groupName, true);
  }
  const newCard = tmp.firstElementChild;

  // 找到目标 group 的卡片列表
  const groupLists = sectionEl.querySelectorAll('.group-cards-list');
  let targetList = null;
  for (const list of groupLists) {
    const firstCard = list.querySelector('[data-group="' + groupId + '"]');
    if (firstCard) { targetList = list; break; }
  }
  if (!targetList) {
    // group 不存在，全量重建
    _lastContentHtml = '';
    renderContent();
    return;
  }

  // 插入新卡片到正确位置
  targetList.appendChild(newCard);
  observeCoverThumbnails(newCard);
  animateCardChange(newCard);
  allCards.push({ card: newCard, entry: entry });
  // 搜索态下：不匹配的新卡片隐藏，匹配结果稍后按 DOM 顺序同步。
  if (searchQuery) {
    if (!matchesFilter(entry)) newCard.classList.add('hidden');
  }
  if (searchQuery) syncSearchResultsInDomOrder(preserveEntryId);
  _lastContentHtml = '';
}

function reorderGroupCards(entry, sel) {
  for (const section of appData.sections) {
    if (section.id !== sel.sectionId) continue;
    for (const group of section.groups) {
      if (group.name !== sel.groupName) continue;
      const idx = group.entries.findIndex(e => e.id === entry.id);
      if (idx === -1) continue;
      const special = group.entries.filter(e => e.isAoty || e.isSoty);
      const normal = group.entries.filter(e => !e.isAoty && !e.isSoty);
      const year = parseInt(section.id);
      const isFuture = !isNaN(year) && year >= 2025;
      const isOld = !isNaN(year) && year <= 1989;
      normal.sort((a, b) => {
        if (isFuture) {
          const da = a.date || '';
          const db = b.date || '';
          const aHas = !!da, bHas = !!db;
          if (!aHas && !bHas) { /* fall through to title */ }
          else if (!aHas) return 1;
          else if (!bHas) return -1;
          else {
            const aDot = da.includes('.');
            const bDot = db.includes('.');
            if (aDot && !bDot) return -1;
            if (!aDot && bDot) return 1;
            if (aDot && bDot) {
              if (da !== db) return da.localeCompare(db);
            } else {
              if (da !== db) return db.localeCompare(da); // 年份越新越靠前
            }
          }
        }
        if (isOld) {
          const ya = a.date || '9999';
          const yb = b.date || '9999';
          if (ya !== yb) return yb.localeCompare(ya); // 年份越新越靠前
        }
        const ta = (a.title || '');
        const tb = (b.title || '');
        const oa = charPriority(ta.charAt(0));
        const ob = charPriority(tb.charAt(0));
        if (oa !== ob) return oa - ob;
        if (oa === 3) return ta.localeCompare(tb, 'zh-CN');
        return ta.localeCompare(tb, undefined, { numeric: true });
      });
      group.entries = [...special, ...normal];
      const groupId = getGroupId(section.id, group.name);
      // 修复：在当前 section 中查找，避免跨 section 的全局查询错误
      const sectionEl = document.getElementById('section-' + section.id);
      const list = sectionEl?.querySelector('.group-cards-list [data-group="' + groupId + '"]')?.closest('.group-cards-list');
      if (!list) { _lastContentHtml = ''; renderContent(); return; }

      // 重建被编辑的卡片（可能类型变了：aoty ↔ 普通）
      const oldCard = list.querySelector('[data-entry-id="' + entry.id + '"]');
      const preserveEntryId = searchQuery ? searchResults[searchIndex]?.dataset.entryId : '';
      if (oldCard) oldCard.remove();
      const isAoty = entry.isAoty || entry.isSoty;
      const tmp = document.createElement('div');
      if (isAoty) {
        tmp.innerHTML = renderAotyCard(entry, section.id, groupId, true, group.name);
      } else {
        tmp.innerHTML = renderAlbumCard(entry, 1, section.id, groupId, group.name, true);
      }
      const newCard = tmp.firstElementChild;
      const cached = allCards.find(c => c.entry && c.entry.id === entry.id);
      if (cached) cached.card = newCard;
      else allCards.push({ card: newCard, entry: entry });
      const srIdx = searchResults.indexOf(oldCard);
      if (srIdx !== -1) searchResults[srIdx] = newCard;
      // 新条目：不匹配当前搜索时隐藏，匹配结果在 DOM 重排后统一同步。
      if (!cached && searchQuery) {
        if (!matchesFilter(entry)) newCard.classList.add('hidden');
      }

      // 按排序顺序重排整个 group 的 DOM
      for (const e of group.entries) {
        if (e.id === entry.id) {
          list.appendChild(newCard);
        } else {
          const card = list.querySelector('[data-entry-id="' + e.id + '"]');
          if (card) list.appendChild(card);
        }
      }
      observeCoverThumbnails(newCard);
      animateCardChange(newCard);
      // 更新序号
      const normalCards = list.querySelectorAll('.album-card[data-group="' + groupId + '"]');
      normalCards.forEach((c, i) => { const el = c.querySelector('.album-index'); if (el) el.textContent = i + 1; });
      if (searchQuery) syncSearchResultsInDomOrder(preserveEntryId);
      _lastContentHtml = '';
      return;
    }
  }
}

function toggleReview(btn) {
  const id = btn.dataset.entryId;
  const el = document.getElementById('review-' + id);
  if (!el) return;
  if (el.classList.contains('expanded')) {
    el.classList.remove('expanded');
    el.style.maxHeight = '120px';
    btn.textContent = t('content.showMore');
  } else {
    el.classList.add('expanded');
    el.style.maxHeight = 'none';
    btn.textContent = t('content.showLess');
  }
  scheduleScrollCacheRebuild();
}

// ===== Delete Year Section =====
async function deleteYearSection(sectionId) {
  const yearNum = parseInt(sectionId);
  if (isNaN(yearNum)) return;

  const entryCount = appData.sections
    .filter(s => s.id === sectionId)
    .reduce((sum, s) => sum + s.groups.reduce((s2, g) => s2 + g.entries.length, 0), 0);

  // 自定义确认框，确认按钮带 5 秒倒计时
  const confirmed = await new Promise((resolve) => {
    const msg = t('dialog.deleteYearMsg', { year: yearNum, count: entryCount });
    let countdown = 5;
    const container = document.getElementById('dialogContainer');
    container.innerHTML =
      '<div class="dialog-overlay">' +
        '<div class="dialog-sheet">' +
          '<div class="dialog-title">' + escapeHtml(t('dialog.deleteYear')) + '</div>' +
          '<div class="dialog-message">' + escapeHtml(msg) + '</div>' +
          '<div class="dialog-buttons">' +
            '<button class="dialog-btn cancel" data-action="dialog-cancel">' + escapeHtml(t('dialog.cancel')) + '</button>' +
            '<button class="dialog-btn confirm" data-action="dialog-confirm" disabled style="opacity:0.4;cursor:not-allowed">' +
              escapeHtml(t('dialog.confirm')) + ' (' + countdown + ')' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    requestAnimationFrame(() => container.querySelector('.dialog-overlay').classList.add('active'));

    const confirmBtn = container.querySelector('[data-action="dialog-confirm"]');
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '';
        confirmBtn.style.cursor = '';
        confirmBtn.textContent = t('dialog.confirm');
      } else {
        confirmBtn.textContent = t('dialog.confirm') + ' (' + countdown + ')';
      }
    }, 1000);

    function cleanup(result) {
      clearInterval(timer);
      const overlay = container.querySelector('.dialog-overlay');
      if (overlay) overlay.classList.remove('active');
      setTimeout(() => { container.innerHTML = ''; }, 250);
      resolve(result);
    }

    const sheet = container.querySelector('.dialog-sheet');
    sheet.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'dialog-confirm' && !confirmBtn.disabled) {
        cleanup(true);
      } else if (action.dataset.action === 'dialog-cancel') {
        cleanup(false);
      }
    });

    container.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        cleanup(false);
        container.removeEventListener('keydown', onKey);
      } else if (e.key === 'Enter' && !confirmBtn.disabled) {
        cleanup(true);
        container.removeEventListener('keydown', onKey);
      }
    });
  });
  if (!confirmed) return;

  if (window.__TAURI__) {
    const deletedSections = appData.sections.filter(s => s.id === sectionId);
    for (const sec of deletedSections) {
      for (const grp of sec.groups) {
        for (const en of grp.entries) {
          window.__TAURI__.core.invoke('remove_cover', { entryId: en.id }).catch(() => {});
        }
      }
    }
  }

  appData.sections = appData.sections.filter(s => s.id !== sectionId);

  refreshAll();
}

