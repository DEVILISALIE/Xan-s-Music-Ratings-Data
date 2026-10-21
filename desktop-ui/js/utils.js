function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 排序优先级：符号=0 数字=1 英文=2 中文=3
function charPriority(ch) {
  if (!ch) return 4;
  const c = ch.charCodeAt(0);
  if (c >= 0x4E00 && c <= 0x9FFF) return 3;
  if (/[a-zA-Z]/.test(ch)) return 2;
  if (/\d/.test(ch)) return 1;
  return 0;
}

// 统一根据分区年份规则对分组内的条目进行自动排序
function sortGroupEntries(group, sectionId) {
  if (!group || !Array.isArray(group.entries) || group.entries.length === 0) return;
  const year = parseInt(sectionId);
  const isFuture = !isNaN(year) && year >= 2025;
  const isOld = !isNaN(year) && year <= 1989;
  const needsSort = isFuture || (!isNaN(year) && year >= 1990 && year <= 2024) || isOld;
  if (!needsSort) return;

  const special = group.entries.filter(e => e.isAoty || e.isSoty);
  const normal = group.entries.filter(e => !e.isAoty && !e.isSoty);

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
}

function updateToolbarStats() {
  let albumCount = 0;
  let singleCount = 0;
  if (appData && Array.isArray(appData.sections)) {
    for (const section of appData.sections) {
      if (Array.isArray(section.groups)) {
        for (const group of section.groups) {
          const count = Array.isArray(group.entries) ? group.entries.length : 0;
          if (group.name === 'Singles') singleCount += count;
          else albumCount += count;
        }
      }
    }
  }
  const albumEl = document.getElementById('albumCount');
  const singleEl = document.getElementById('singleCount');
  if (albumEl) albumEl.textContent = t('toolbar.albums') + ': ' + albumCount;
  if (singleEl) singleEl.textContent = t('toolbar.singles') + ': ' + singleCount;
}

function getScoreClass(score) {
  if (score == null) return 'score-null';
  if (score >= 70) return 'score-high';
  if (score >= 50) return 'score-mid';
  return 'score-low';
}

function generateId() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function refreshAll() {
  buildEntryIndex();
  _lastSidebarHtml = '';
  _lastContentHtml = '';
  renderSidebar();
  renderContent();
  updateGlobalStatsSidebar();
  await saveData();
}

function findOrCreateSection(sectionId) {
  let section = appData.sections.find(s => s.id === sectionId);
  if (!section) {
    const yearNum = parseInt(sectionId);
    if (!isNaN(yearNum)) {
      section = appData.sections.find(s => s.id.match(new RegExp(`^vol\\d+-${yearNum}$`)));
    }
  }
  if (!section) {
    section = { id: sectionId, title: t('content.sectionTitle', { year: sectionId }), groups: [] };
    appData.sections.push(section);
  }
  return section;
}

function getGroupId(sectionId, groupName) {
  return sectionId + '-' + groupName.toLowerCase().replace(/\s+/g, '-');
}

function getSectionDisplayName(section) {
  const yearNum = parseInt(section.id);
  return (!isNaN(yearNum) && yearNum >= 1990)
    ? section.id
    : section.title.split(':')[0].replace(/Part \d+ /, '').trim();
}

// 确保每个 section 都有 Albums 和 Singles 两个默认分组
function ensureDefaultGroups() {
  let modified = false;
  for (const section of appData.sections) {
    if (!section.groups.some(g => g.name === 'Albums')) {
      section.groups.push({ name: 'Albums', entries: [] });
      modified = true;
    }
    if (!section.groups.some(g => g.name === 'Singles')) {
      section.groups.push({ name: 'Singles', entries: [] });
      modified = true;
    }
  }
  return modified;
}

let selectedSectionValue = '';

function populateSectionSelector(selectedEntryId) {
  const menu = document.getElementById('editSectionMenu');
  const trigger = document.getElementById('editSectionTrigger');
  menu.innerHTML = '';
  let currentValue = '';

  let isFirstOption = true;
  for (const section of getMergedSections()) {
    // 始终列出 Albums 和 Singles
    const groupNames = ['Albums', 'Singles'];

    for (const groupName of groupNames) {
      const group = section.groups.find(g => g.name === groupName);
      const val = JSON.stringify({ sectionId: section.id, groupName: groupName });
      const label = getSectionDisplayName(section) + ' → ' + groupName;
      const opt = document.createElement('div');
      opt.className = 'custom-select-option';
      opt.dataset.value = val;
      opt.textContent = label;
      menu.appendChild(opt);

      if (selectedEntryId && group && group.entries.some(e => e.id === selectedEntryId)) {
        currentValue = val;
      } else if (!selectedEntryId && isFirstOption && !window.__TAURI__) {
        currentValue = val;
        isFirstOption = false;
      }
      if (!selectedEntryId) isFirstOption = false;
    }
  }

  selectedSectionValue = currentValue;
  if (currentValue) {
    const activeOpt = [...menu.querySelectorAll('.custom-select-option')].find(o => o.dataset.value === currentValue);
    trigger.textContent = activeOpt ? activeOpt.textContent : t('modal.placeholder.select');
    menu.querySelectorAll('.custom-select-option').forEach(o => {
      o.classList.toggle('active', o.dataset.value === currentValue);
    });
  } else {
    trigger.textContent = t('modal.placeholder.select');
  }
}

// ===== Universal macOS Overlay Scrollbars Engine =====
// 彻底根除 Chromium/WebView2 原生滚动条劫持系统光标并忽略 CSS cursor 的底层缺陷
function attachMacScrollbar(container, options = {}) {
  if (!container) return null;

  // 支持 options 直接传父级 wrapper 元素（向下兼容）
  if (options instanceof HTMLElement) {
    options = { parent: options };
  }

  const isFollow = !!options.follow;
  const isFixed = !!options.fixed || isFollow;
  const parent = options.parent || (isFixed ? document.body : (container.parentElement || container));
  if (!parent) return null;

  if (!isFixed) {
    const parentPos = window.getComputedStyle(parent).position;
    if (parentPos === 'static') {
      parent.style.position = 'relative';
    }
  }

  const trackId = options.id || ('track_' + (container.id || Math.random().toString(36).slice(2, 7)));
  let track = document.getElementById(trackId);
  if (!track) {
    track = document.createElement('div');
    track.id = trackId;
    track.className = 'mac-scrollbar-track' + (isFixed ? ' mac-scrollbar-fixed' : '');
    if (isFollow) track.style.zIndex = '999999';
    if (options.className) track.classList.add(options.className);
    const thumb = document.createElement('div');
    thumb.className = 'mac-scrollbar-thumb';
    track.appendChild(thumb);
    parent.appendChild(track);
  }
  track.dataset.targetId = container.id || '';
  track.dataset.scrollbar = 'mac';
  container.classList.add('has-mac-scrollbar');

  if (options.top != null && !isFollow) track.style.top = typeof options.top === 'number' ? options.top + 'px' : options.top;
  if (options.bottom != null && !isFollow) track.style.bottom = typeof options.bottom === 'number' ? options.bottom + 'px' : options.bottom;
  if (options.right != null && !isFollow) track.style.right = typeof options.right === 'number' ? options.right + 'px' : options.right;

  const thumb = track.querySelector('.mac-scrollbar-thumb');
  let fadeTimer = null;
  let isDragging = false;
  let startY = 0;
  let startScrollTop = 0;

  function show() {
    track.classList.add('visible');
    if (fadeTimer) clearTimeout(fadeTimer);
    if (!isDragging) {
      fadeTimer = setTimeout(() => {
        if (!isDragging && !track.matches(':hover') && !container.matches(':hover') && !parent.matches(':hover')) {
          track.classList.remove('visible');
        }
      }, 1200);
    }
  }

  function update() {
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const scrollTop = container.scrollTop;

    if (scrollHeight <= clientHeight + 2) {
      track.style.display = 'none';
      return;
    }

    if (options.sidebar && parent) {
      const header = parent.querySelector('.sidebar-header');
      const footer = parent.querySelector('.sidebar-footer');
      const gap = 6;
      const topOffset = (header ? header.offsetHeight : 64) + gap;
      const bottomOffset = (footer ? footer.offsetHeight : 64) + gap;
      track.style.top = topOffset + 'px';
      track.style.bottom = bottomOffset + 'px';
    }

    if (options.mainContent) {
      const toolbar = document.querySelector('.toolbar');
      const gap = 6;
      const isDesktop = document.body.dataset.desktop === 'true' || document.documentElement.dataset.desktop === 'true';
      const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom : (isDesktop ? 96 : 58);
      const topOffset = toolbarBottom + gap;
      track.style.top = topOffset + 'px';
      track.style.bottom = '6px';
    }

    if (isFollow) {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(container).display === 'none') {
        track.style.display = 'none';
        return;
      }
      track.style.position = 'fixed';
      track.style.top = (rect.top + (options.top || 6)) + 'px';
      track.style.left = (rect.right - (options.rightOffset || 8)) + 'px';
      track.style.height = (rect.height - (options.heightOffset || 12)) + 'px';
      track.style.width = '6px';
      track.style.right = 'auto';
      track.style.bottom = 'auto';
    }

    track.style.display = 'block';
    const trackHeight = track.clientHeight || (window.innerHeight - 38);
    const thumbHeight = Math.max(isFollow ? 20 : 32, Math.round((clientHeight / scrollHeight) * trackHeight));
    const maxScroll = scrollHeight - clientHeight;
    const maxTop = trackHeight - thumbHeight;
    const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * maxTop : 0;

    thumb.style.height = thumbHeight + 'px';
    thumb.style.transform = `translate3d(0, ${thumbTop}px, 0)`;
  }

  container.addEventListener('scroll', () => {
    update();
    show();
  }, { passive: true });

  container.addEventListener('mouseenter', () => {
    update();
    show();
  }, { passive: true });

  track.addEventListener('mouseenter', () => {
    update();
    show();
  }, { passive: true });

  container.addEventListener('mouseleave', () => {
    if (!isDragging && !track.matches(':hover')) {
      fadeTimer = setTimeout(() => {
        if (!isDragging && !track.matches(':hover')) {
          track.classList.remove('visible');
        }
      }, 600);
    }
  }, { passive: true });

  track.addEventListener('mouseleave', () => {
    if (!isDragging && !container.matches(':hover')) {
      fadeTimer = setTimeout(() => {
        if (!isDragging && !container.matches(':hover')) {
          track.classList.remove('visible');
        }
      }, 600);
    }
  }, { passive: true });

  // 鼠标按住拖拽滑块
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    try { thumb.setPointerCapture(e.pointerId); } catch (_) {}
    track.classList.add('dragging', 'visible');
    thumb.classList.add('dragging');
    if (fadeTimer) clearTimeout(fadeTimer);
    startY = e.clientY;
    startScrollTop = container.scrollTop;
  });

  thumb.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const trackHeight = track.clientHeight || (window.innerHeight - 38);
    const thumbHeight = thumb.offsetHeight || 32;
    const maxTop = trackHeight - thumbHeight;
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxTop > 0 && maxScroll > 0) {
      const deltaY = e.clientY - startY;
      container.scrollTop = startScrollTop + (deltaY / maxTop) * maxScroll;
      if (typeof syncPortalsImmediate === 'function') {
        syncPortalsImmediate();
      } else if (typeof window.__syncPortalsImmediate === 'function') {
        window.__syncPortalsImmediate();
      }
    }
  });

  let lastDragEndTime = 0;
  window.addEventListener('click', (e) => {
    if (Date.now() - lastDragEndTime < 250 && (e.target === thumb || e.target === track || track.contains(e.target))) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  function stopDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    lastDragEndTime = Date.now();
    try { if (e && e.pointerId != null) thumb.releasePointerCapture(e.pointerId); } catch (_) {}
    track.classList.remove('dragging');
    thumb.classList.remove('dragging');
    fadeTimer = setTimeout(() => {
      if (!track.matches(':hover') && !container.matches(':hover')) {
        track.classList.remove('visible');
      }
    }, 1200);
  }

  thumb.addEventListener('pointerup', stopDrag);
  thumb.addEventListener('pointercancel', stopDrag);
  window.addEventListener('pointerup', stopDrag);

  // 阻止滚动条上的 mousedown、click 事件冒泡到 document，彻底避免误触发全局关闭
  track.addEventListener('mousedown', (e) => e.stopPropagation());
  track.addEventListener('click', (e) => e.stopPropagation());
  thumb.addEventListener('mousedown', (e) => e.stopPropagation());
  thumb.addEventListener('click', (e) => e.stopPropagation());

  // 点击轨道快速跳转
  track.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === thumb) return;
    e.preventDefault();
    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const trackHeight = track.clientHeight;
    const thumbHeight = thumb.offsetHeight || 32;
    const maxTop = trackHeight - thumbHeight;
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxTop > 0 && maxScroll > 0) {
      const targetTop = Math.max(0, Math.min(maxTop, clickY - thumbHeight / 2));
      container.scrollTop = (targetTop / maxTop) * maxScroll;
    }
  });

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => update());
    ro.observe(container);
    if (container.firstElementChild) ro.observe(container.firstElementChild);
    if (parent !== container && !isFixed) ro.observe(parent);
  }

  // 挂载到容器对象上方便外部调用 update
  container.__macScrollbar = { update, show };

  update();
  return { update, show };
}
