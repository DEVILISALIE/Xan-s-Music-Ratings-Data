// 获取所有 sections 并按年份降序排列
// 旧版 localStorage 数据可能还有 vol sections，这里做兼容合并
function getMergedSections() {
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
    const merged = { ...section, groups: section.groups.map(g => ({ ...g, entries: [...g.entries] })) };
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
    <button onclick="addNewYear()" style="width:100%;padding:8px;border:1.5px dashed var(--separator);border-radius:10px;background:transparent;color:var(--accent);font-size:13px;font-weight:500;cursor:pointer;transition:background 0.15s;border-color 0.15s;">${t('sidebar.newYear')}</button>
  </div>`;
  const mergedSections = getMergedSections();
  for (const section of mergedSections) {
    const yearNum = parseInt(section.id);
    const displayName = getSectionDisplayName(section);
    const groupCount = section.groups.reduce((s, g) => s + g.entries.length, 0);

    html += `<div class="nav-group" data-section="${section.id}">`;
    html += `<div class="nav-group-header" role="button" tabindex="0" onclick="toggleNavGroup(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleNavGroup(this)}">`;
    html += `<span class="arrow">▾</span>${displayName}`;
    if (!isNaN(yearNum)) {
      html += `<span class="nav-group-delete" onclick="event.stopPropagation();deleteYearSection('${section.id}')" title="${currentLang === 'zh' ? '删除' + yearNum + '年' : 'Delete ' + yearNum}">×</span>`;
    }
    html += `</div>`;
    html += `<div class="nav-group-items">`;

    // 通用侧边栏点击高亮函数 - 确保只高亮当前点击的导航项
    const navClick = `(function(self){
      // 先移除所有导航项的 active 类
      document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active')});
      // 给当前点击的导航项添加 active 类
      self.classList.add('active');
      // 禁用滚动同步，防止后续滚动覆盖当前高亮
      var ca=document.getElementById('contentArea');
      ca.classList.add('overview-scroll');
      // 持续强化 active 状态一段时间，防止异步操作覆盖
      // 清除上一次点击的所有定时器，防止相互干扰
      if (window._navActiveInterval) { clearInterval(window._navActiveInterval); window._navActiveInterval = null; }
      if (window._navActiveTimeout) { clearTimeout(window._navActiveTimeout); window._navActiveTimeout = null; }
      if (window._navScrollDelay) { clearTimeout(window._navScrollDelay); window._navScrollDelay = null; }
      window._navActiveInterval = setInterval(function(){self.classList.add('active')},50);
      window._navActiveTimeout = setTimeout(function(){
        clearInterval(window._navActiveInterval);
        window._navActiveInterval = null;
        window._navActiveTimeout = null;
        window._navScrollDelay = setTimeout(function(){
          ca.classList.remove('overview-scroll');
          window._navScrollDelay = null;
        },200);
      },1500);
    })`;

    // Sub-groups（AOTY 在 Albums 上方，SOTY 在 Singles 上方）
    const albumsGroup = section.groups.find(g => g.name === 'Albums');
    const singlesGroup = section.groups.find(g => g.name === 'Singles');
    const aotyCount = albumsGroup ? albumsGroup.entries.filter(e => e.isAoty).length : 0;
    const sotyCount = singlesGroup ? singlesGroup.entries.filter(e => e.isSoty).length : 0;

    if (aotyCount > 0) {
      const gid = getGroupId(section.id, 'aoty');
      html += `<a class="nav-item" href="#group-${gid}" data-nav="${gid}" onclick="${navClick}(this);scrollToGroup('${gid}',event)">AOTY (${aotyCount})</a>`;
    }
    if (albumsGroup && albumsGroup.entries.length > 0) {
      const gid = getGroupId(section.id, 'Albums');
      html += `<a class="nav-item" href="#group-${gid}" data-nav="${gid}" onclick="${navClick}(this);scrollToGroup('${gid}',event)">Albums (${albumsGroup.entries.length})</a>`;
    }
    if (sotyCount > 0) {
      const gid = getGroupId(section.id, 'soty');
      html += `<a class="nav-item" href="#group-${gid}" data-nav="${gid}" onclick="${navClick}(this);scrollToGroup('${gid}',event)">SOTY (${sotyCount})</a>`;
    }
    if (singlesGroup && singlesGroup.entries.length > 0) {
      const gid = getGroupId(section.id, 'Singles');
      html += `<a class="nav-item" href="#group-${gid}" data-nav="${gid}" onclick="${navClick}(this);scrollToGroup('${gid}',event)">Singles (${singlesGroup.entries.length})</a>`;
    }

    html += `</div></div>`;
  }
  nav.innerHTML = html;
}

function toggleNavGroup(el) {
  el.classList.toggle('collapsed');
  const items = el.nextElementSibling;
  items.classList.toggle('collapsed');
}

function scrollToSection(id, e) {
  if (e) e.preventDefault();
  const el = document.getElementById('section-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToGroup(gid, e, offset) {
  if (e) e.preventDefault();
  const el = document.getElementById('group-' + gid);
  const main = document.getElementById('mainContent');
  if (el && main) {
    const y = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - (offset || 0);
    main.scrollTo({ top: y, behavior: 'smooth' });
  }
}

function addNewYear() {
  const year = prompt(t('alert.yearPrompt'));
  if (!year || !/^\d{4}$/.test(year)) {
    if (year) alert(t('alert.invalidYear'));
    return;
  }

  const exists = appData.sections.some(s => s.id === year);
  if (exists) {
    alert(t('alert.yearExists', { year }));
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

  setTimeout(() => scrollToSection(year), 100);
}

function setupScrollSync() {
  const main = document.getElementById('mainContent');
  if (main._scrollSyncBound) return;
  main._scrollSyncBound = true;
  let ticking = false;

  main.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      // 点击期间完全跳过滚动同步
      if (document.getElementById('contentArea').classList.contains('overview-scroll')) {
        ticking = false;
        return;
      }

      const navItems = document.querySelectorAll('.nav-item[data-nav]');
      const groupEls = document.querySelectorAll('[id^="group-"]');

      let currentGroup = '';
      for (const grp of groupEls) {
        if (grp.getBoundingClientRect().top <= 60) {
          currentGroup = grp.id.replace('group-', '');
        }
      }

      // 找到当前激活 group 所在的 section
      const currentSectionId = currentGroup ? currentGroup.split('-')[0] : '';

      navItems.forEach(item => {
        // 只处理当前 section 的导航项，避免跨 section 高亮
        const itemNavId = item.dataset.nav;
        const itemSectionId = itemNavId ? itemNavId.split('-')[0] : '';

        if (itemSectionId === currentSectionId) {
          item.classList.toggle('active', itemNavId === currentGroup);
        } else {
          // 清除不属于当前 section 的高亮，防止多 group 同时高亮
          item.classList.remove('active');
        }
      });

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
  });
}

// ===== Content Rendering =====
function renderContent() {
  const area = document.getElementById('contentArea');
  let html = '';
  let totalCount = 0;
  let visibleCount = 0;

  const mergedSections = getMergedSections();
  for (const section of mergedSections) {
    html += `<div class="section" id="section-${section.id}">`;
    html += `<h2 class="section-title">${escapeHtml(section.title)}</h2>`;

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
      html += `<div id="group-${getGroupId(section.id, 'aoty')}" style="height:1px;margin:0;padding:0;overflow:hidden"></div>`;
    }

    for (const group of displayGroups) {
      const gid = getGroupId(section.id, group.name);

      // SOTY 锚点放在 Albums 下方、Singles 标题上方
      if (group.name === 'Singles' && hasSoty) {
        html += `<div id="group-${getGroupId(section.id, 'soty')}" style="height:1px;margin:0;padding:0;overflow:hidden"></div>`;
      }

      // 渲染分组标题
      if (group.entries.length > 0) {
        const singlesBottom = group.name === 'Singles' ? 'margin-bottom:40px;' : '';
        html += `<div class="group-title" id="group-${gid}" style="${singlesBottom}">${escapeHtml(group.name)}</div>`;
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
    }

    html += `</div>`;
  }

  area.innerHTML = html;
  rebuildCardCache();

  updateToolbarStats();
  searchResults = [];
  for (const { card } of allCards) {
    if (!card.classList.contains('hidden')) searchResults.push(card);
  }

  // 搜索状态下更新导航按钮
  const nextBtn = document.getElementById('searchNextBtn');
  if (searchQuery && searchResults.length > 0) {
    nextBtn.style.display = 'flex';
    searchIndex = 0;
    highlightSearchResult(0);
  } else {
    nextBtn.style.display = 'none';
    clearSearchHighlight();
    searchIndex = -1;
  }
}

function renderAlbumCard(entry, idx, sectionId, groupId, groupName, visible) {
  const scoreClass = getScoreClass(entry.score);
  const scoreText = entry.score != null ? entry.score : (entry.scoreNote === 'NR' ? 'NR' : '—');
  const tags = (entry.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const hasReview = entry.review && entry.review.trim().length > 0;
  const trackCount = entry.tracks && entry.tracks.length > 0 ? entry.tracks.length : 0;
  const hiddenClass = visible ? '' : 'hidden';
  const noteText = entry.scoreNote && entry.scoreNote !== 'NR' ? ` (${entry.scoreNote})` : '';
  const showMustHear = groupName !== 'Singles' && entry.score != null && entry.score >= mustHearThreshold;

  return `<div class="album-card ${hiddenClass}" data-entry-id="${entry.id}" data-section="${sectionId}" data-group="${groupId}" role="button" tabindex="0" onclick="openEditModal('${entry.id}','${sectionId}','${groupId}')" onkeydown="if(event.key==='Enter')openEditModal('${entry.id}','${sectionId}','${groupId}')">
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

function renderAotyCard(entry, sectionId, groupId, visible, groupName) {
  const hiddenClass = visible ? '' : 'hidden';
  const scoreText = entry.score != null ? entry.score + '/100' : '—';
  const noteText = entry.scoreNote && entry.scoreNote !== 'NR' ? ` (${entry.scoreNote})` : '';
  const tags = (entry.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const hasReview = entry.review && entry.review.trim().length > 0;
  const trackCount = entry.tracks && entry.tracks.length > 0 ? entry.tracks.length : 0;
  const reviewHtml = entry.review ? `<div class="aoty-review" id="review-${entry.id}">${escapeHtml(entry.review)}</div>
    <button class="aoty-review-toggle" onclick="toggleReview(event, '${entry.id}')">${t('content.showMore')}</button>` : '';

  return `<div class="aoty-card ${hiddenClass}" data-entry-id="${entry.id}" data-section="${sectionId}" data-group="${groupId}" role="button" tabindex="0" onclick="openEditModal('${entry.id}','${sectionId}','${groupId}')" onkeydown="if(event.key==='Enter')openEditModal('${entry.id}','${sectionId}','${groupId}')">
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

function toggleReview(e, id) {
  e.stopPropagation();
  const el = document.getElementById('review-' + id);
  const toggle = e.target;
  if (el.classList.contains('expanded')) {
    el.classList.remove('expanded');
    el.style.maxHeight = '120px';
    toggle.textContent = t('content.showMore');
  } else {
    el.classList.add('expanded');
    el.style.maxHeight = 'none';
    toggle.textContent = t('content.showLess');
  }
}

// ===== Delete Year Section =====
function deleteYearSection(sectionId) {
  const yearNum = parseInt(sectionId);
  if (isNaN(yearNum)) return;

  const entryCount = appData.sections
    .filter(s => s.id === sectionId)
    .reduce((sum, s) => sum + s.groups.reduce((s2, g) => s2 + g.entries.length, 0), 0);

  if (!confirm(t('confirm.deleteYear', { year: yearNum, count: entryCount }))) return;

  appData.sections = appData.sections.filter(s => s.id !== sectionId);

  refreshAll();
}

// ===== Drag & Drop Reorder =====
// 使用 Pointer Events 实现类似 iOS/Edge 的流畅拖拽体验
// 应用 Disney 动画原则：Anticipation, Follow Through, Ease In/Out
document.addEventListener('DOMContentLoaded', () => {
  const contentArea = document.getElementById('contentArea');
  const mainEl = document.getElementById('mainContent');

  let state = {
    active: false,
    entryId: null,
    group: null,
    card: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    origWidth: 0,
    origHeight: 0,
    ghost: null,
    placeholder: null,
    scrollAnimId: null,
    lastClientY: 0,
    lastMoveX: 0,
    lastMoveY: 0,
    isAnimating: false,
    currentInsertTarget: null, // 当前插入目标
  };

  // 找到包含指定 entry 的 group
  function findSourceGroup(entryId) {
    for (const section of appData.sections) {
      for (const group of section.groups) {
        if (group.entries.some(en => en.id === entryId)) return group;
      }
    }
    return null;
  }

  // ===== Auto Scroll =====

  function startAutoScroll() {
    stopAutoScroll();
    const zone = 80, maxSpeed = 12;
    function tick() {
      if (!state.active) { stopAutoScroll(); return; }
      const cy = state.lastClientY;
      let speed = 0;
      if (cy < zone) speed = -maxSpeed * (1 - cy / zone);
      else if (cy > window.innerHeight - zone) speed = maxSpeed * (1 - (window.innerHeight - cy) / zone);
      if (speed !== 0) { mainEl.scrollBy(0, speed); state.scrollAnimId = requestAnimationFrame(tick); }
      else stopAutoScroll();
    }
    state.scrollAnimId = requestAnimationFrame(tick);
  }

  function updateAutoScroll(clientY) {
    state.lastClientY = clientY;
    if (!state.active) { stopAutoScroll(); return; }
    const zone = 80;
    if (clientY < zone || clientY > window.innerHeight - zone) { if (!state.scrollAnimId) startAutoScroll(); }
    else stopAutoScroll();
  }

  function stopAutoScroll() {
    if (state.scrollAnimId) { cancelAnimationFrame(state.scrollAnimId); state.scrollAnimId = null; }
  }

  // ===== 创建空位占位符 =====

  function createPlaceholder(height) {
    const placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.height = height + 'px';
    return placeholder;
  }

  // ===== 查找插入位置 =====

  function findInsertPosition(clientY) {
    const groupId = state.card.dataset.group;
    const parent = state.card.parentNode;

    // 获取所有同组卡片（排除被拖拽的原卡片）
    const cards = [];
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === state.card) continue; // 跳过原卡片
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        const rect = child.getBoundingClientRect();
        cards.push({
          element: child,
          entryId: child.dataset.entryId,
          midY: rect.top + rect.height / 2,
          top: rect.top,
          bottom: rect.bottom
        });
      }
    }

    if (cards.length === 0) return null;

    // 找到最近的卡片
    let bestCard = null;
    let bestDist = Infinity;

    for (const card of cards) {
      const dist = Math.abs(clientY - card.midY);
      if (dist < bestDist) {
        bestDist = dist;
        bestCard = card;
      }
    }

    if (!bestCard) return null;

    // 判断是插入到该卡片之前还是之后
    const insertBefore = clientY < bestCard.midY;

    return {
      element: bestCard.element,
      insertBefore: insertBefore
    };
  }

  // ===== FLIP 动画：平滑移动卡片 =====

  function animateCards(oldPositions) {
    const groupId = state.card.dataset.group;
    const parent = state.card.parentNode;

    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === state.card || child === state.placeholder) continue;
      if (!child.classList.contains('album-card') || child.dataset.group !== groupId) continue;

      const oldRect = oldPositions.get(child);
      if (!oldRect) continue;

      const newRect = child.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;

      if (Math.abs(dy) < 0.5) continue;

      // 应用 FLIP 动画
      child.style.transition = 'none';
      child.style.transform = `translateY(${dy}px)`;

      // 强制重排
      child.offsetHeight;

      child.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
      child.style.transform = '';
    }
  }

  // ===== 更新占位符位置 =====

  function updatePlaceholderPosition(insertPos) {
    if (!insertPos || !state.placeholder) return;
    if (!insertPos.element || !insertPos.element.parentNode) return;

    // 检查是否和当前目标相同
    const targetId = insertPos.element.dataset.entryId;
    const insertKey = targetId + (insertPos.insertBefore ? '-before' : '-after');
    if (state.currentInsertTarget === insertKey) return;
    state.currentInsertTarget = insertKey;

    const parent = state.card.parentNode;
    const placeholder = state.placeholder;
    const groupId = state.card.dataset.group;

    // 记录所有卡片当前位置（FLIP First）
    const oldPositions = new Map();
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === state.card) continue;
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        oldPositions.set(child, child.getBoundingClientRect());
      }
    }

    // 移动占位符到新位置（FLIP Last）
    if (insertPos.insertBefore) {
      parent.insertBefore(placeholder, insertPos.element);
    } else {
      parent.insertBefore(placeholder, insertPos.element.nextSibling);
    }

    // Invert + Play：执行挤开动画
    animateCards(oldPositions);
  }

  // ===== 更新幽灵位置 =====

  function updateGhostPosition(clientX, clientY) {
    if (!state.ghost) return;
    state.ghost.style.left = (clientX - state.offsetX) + 'px';
    state.ghost.style.top = (clientY - state.offsetY) + 'px';
  }

  // ===== Pointer Handlers =====

  function onPointerDown(e) {
    const card = e.target.closest('.album-card');
    if (!card) return;
    if (card.classList.contains('aoty-card')) return;
    if (e.target.closest('button, a, .tag, .review-indicator, .score-badge')) return;

    const rect = card.getBoundingClientRect();

    state.startX = e.clientX;
    state.startY = e.clientY;
    state.offsetX = e.clientX - rect.left;
    state.offsetY = e.clientY - rect.top;
    state.origWidth = rect.width;
    state.origHeight = rect.height;
    state.card = card;
    state.entryId = card.dataset.entryId;
    state.group = null;

    card.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!state.card) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!state.active) {
      if (dist < 6) return;

      state.active = true;
      state.group = findSourceGroup(state.entryId);
      if (!state.group) { cancelDrag(); return; }
      state.lastMoveX = e.clientX;
      state.lastMoveY = e.clientY;

      // 拖拽期间禁用所有卡片的 backdrop-filter，降低 GPU 负担
      contentArea.classList.add('is-dragging');

      const card = state.card;
      const rect = card.getBoundingClientRect();
      const parent = card.parentNode;

      // 创建幽灵元素（跟随鼠标）
      const ghost = card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.cssText = `
        position: fixed;
        width: ${rect.width}px;
        left: ${e.clientX - state.offsetX}px;
        top: ${e.clientY - state.offsetY}px;
        z-index: 10000;
        pointer-events: none;
        transition: none;
        transform: scale(1.03) rotate(0.8deg);
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        border-radius: 12px;
        opacity: 0.92;
        cursor: grabbing;
      `;
      document.body.appendChild(ghost);
      state.ghost = ghost;

      // 创建占位符（高度已正确）
      const placeholder = createPlaceholder(rect.height);
      state.placeholder = placeholder;

      // 隐藏原卡片（先隐藏，再插入占位符，避免抖动）
      card.style.opacity = '0';
      card.style.pointerEvents = 'none';

      // 在原卡片位置插入占位符（原卡片仍占据布局空间）
      parent.insertBefore(placeholder, card);

      // 现在原卡片和占位符都占据空间，移除原卡片的布局影响
      // 使用 height:0 + margin:0 让原卡片"消失"但不触发 FLIP
      card.style.height = '0';
      card.style.margin = '0';
      card.style.padding = '0';
      card.style.overflow = 'hidden';
      card.style.border = 'none';
      card.style.boxShadow = 'none';

      return;
    }

    e.preventDefault();
    state.lastMoveX = e.clientX;
    state.lastMoveY = e.clientY;

    updateGhostPosition(e.clientX, e.clientY);
    updateAutoScroll(e.clientY);

    // 查找插入位置
    const ghostCenterY = e.clientY - state.offsetY + state.origHeight / 2;
    const pos = findInsertPosition(ghostCenterY);

    if (pos) {
      updatePlaceholderPosition(pos);
    }
  }

  function onPointerUp(e) {
    const card = state.card;
    if (!card) return;

    if (!state.active) {
      try { card.releasePointerCapture(e.pointerId); } catch (_) {}
      resetState();
      return;
    }

    try { card.releasePointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    finishDrag(e.clientX, e.clientY);
  }

  function onPointerCancel(e) {
    if (!state.card) return;
    try { state.card.releasePointerCapture(e.pointerId); } catch (_) {}
    if (state.active) cancelDrag();
    else resetState();
  }

  // ===== 完成拖拽 =====

  function finishDrag(clientX, clientY) {
    if (state.isAnimating) return;
    state.isAnimating = true;
    stopAutoScroll();

    const dragId = state.entryId;
    const dragGroup = state.group;
    const dragCard = state.card;
    const ghost = state.ghost;
    const placeholder = state.placeholder;

    if (!dragId || !dragGroup || !dragCard || !ghost || !placeholder) {
      resetState();
      return;
    }

    // 保存幽灵最后位置
    const ghostLastX = state.lastMoveX - state.offsetX;
    const ghostLastY = state.lastMoveY - state.offsetY;

    // 获取占位符最终位置
    const placeholderRect = placeholder.getBoundingClientRect();

    // 移除幽灵
    ghost.remove();
    state.ghost = null;

    // 记录所有卡片当前位置（FLIP First）
    const groupId = dragCard.dataset.group;
    const parent = dragCard.parentNode;
    const oldPositions = new Map();
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === dragCard) continue;
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        oldPositions.set(child, child.getBoundingClientRect());
      }
    }

    // 恢复原卡片样式并移动到占位符位置
    dragCard.style.opacity = '';
    dragCard.style.pointerEvents = '';
    dragCard.style.height = '';
    dragCard.style.margin = '';
    dragCard.style.padding = '';
    dragCard.style.overflow = '';
    dragCard.style.border = '';
    dragCard.style.boxShadow = '';
    parent.insertBefore(dragCard, placeholder);

    // 移除占位符
    placeholder.remove();
    state.placeholder = null;

    // 执行飞入动画：从幽灵位置飞到最终位置
    const dragCardRect = dragCard.getBoundingClientRect();
    const gx = ghostLastX - dragCardRect.left;
    const gy = ghostLastY - dragCardRect.top;

    dragCard.style.transition = 'none';
    dragCard.style.transform = `translate(${gx}px, ${gy}px) scale(1.03)`;
    dragCard.style.zIndex = '10000';
    dragCard.style.boxShadow = '0 20px 60px rgba(0,0,0,0.3)';

    // 强制重排
    dragCard.offsetHeight;

    dragCard.style.transition = 'transform 0.35s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.35s ease';
    dragCard.style.transform = '';
    dragCard.style.zIndex = '';
    dragCard.style.boxShadow = '';

    // 其他卡片 FLIP 动画
    animateCards(oldPositions);

    // 获取当前 section 中同组卡片的最终顺序
    const currentSection = dragCard.closest('.section');
    const allCards = currentSection
      ? [...currentSection.querySelectorAll(`.album-card[data-group="${groupId}"]`)]
      : [...contentArea.querySelectorAll(`.album-card[data-group="${groupId}"]`)];
    const finalOrder = allCards.map(c => c.dataset.entryId);

    // 同步拖拽后的顺序到数据
    const sourceGroup = findSourceGroup(dragId);
    if (sourceGroup) {
      syncEntriesOrder(sourceGroup, finalOrder);
    }

    // 更新序号
    allCards.forEach((c, i) => {
      const idxEl = c.querySelector('.album-index');
      if (idxEl) idxEl.textContent = i + 1;
    });

    // 动画完成后重置
    setTimeout(() => {
      buildEntryIndex();
      saveData();
      state.isAnimating = false;
      contentArea.classList.remove('is-dragging');
      resetState();
    }, 350);
  }

  // 同步 entries 顺序到指定 group
  function syncEntriesOrder(group, finalOrder) {
    const entryIds = new Set(group.entries.map(e => e.id));
    const filteredOrder = finalOrder.filter(id => entryIds.has(id));
    const entryMap = new Map(group.entries.map(e => [e.id, e]));
    group.entries = filteredOrder
      .map(id => entryMap.get(id))
      .filter(e => e !== undefined);
  }

  // ===== 取消拖拽 =====

  function cancelDrag() {
    if (state.isAnimating) return;
    state.isAnimating = true;
    stopAutoScroll();

    const dragCard = state.card;
    const ghost = state.ghost;
    const placeholder = state.placeholder;

    if (!dragCard || !ghost || !placeholder) {
      resetState();
      return;
    }

    // 保存幽灵当前位置
    const ghostRect = ghost.getBoundingClientRect();
    const ghostX = ghostRect.left;
    const ghostY = ghostRect.top;

    // 获取占位符位置（原位置）
    const placeholderRect = placeholder.getBoundingClientRect();

    // 移除幽灵和占位符
    ghost.remove();
    state.ghost = null;

    // 记录所有卡片当前位置（FLIP First）
    const groupId = dragCard.dataset.group;
    const parent = dragCard.parentNode;
    const oldPositions = new Map();
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === dragCard || child === placeholder) continue;
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        oldPositions.set(child, child.getBoundingClientRect());
      }
    }

    // 恢复原卡片样式
    dragCard.style.opacity = '';
    dragCard.style.pointerEvents = '';
    dragCard.style.height = '';
    dragCard.style.margin = '';
    dragCard.style.padding = '';
    dragCard.style.overflow = '';
    dragCard.style.border = '';
    dragCard.style.boxShadow = '';

    // 移除占位符（原卡片回到原位）
    placeholder.remove();
    state.placeholder = null;

    // 回弹动画：从幽灵位置飞回原位置
    const dx = ghostX - placeholderRect.left;
    const dy = ghostY - placeholderRect.top;

    dragCard.style.transition = 'none';
    dragCard.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
    dragCard.style.zIndex = '10000';
    dragCard.style.boxShadow = '0 20px 60px rgba(0,0,0,0.3)';

    // 强制重排
    dragCard.offsetHeight;

    dragCard.style.transition = 'transform 0.35s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.35s ease';
    dragCard.style.transform = '';
    dragCard.style.zIndex = '';
    dragCard.style.boxShadow = '';

    // 其他卡片回到原位
    animateCards(oldPositions);

    setTimeout(() => {
      state.isAnimating = false;
      contentArea.classList.remove('is-dragging');
      resetState();
    }, 350);
  }

  function resetState() {
    state.active = false;
    state.entryId = null;
    state.group = null;
    state.card = null;
    state.ghost = null;
    state.placeholder = null;
    state.scrollAnimId = null;
    state.isAnimating = false;
    state.currentInsertTarget = null;
  }

  // ===== 绑定事件 =====

  contentArea.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);

  document.addEventListener('selectstart', (e) => {
    if (state.card) e.preventDefault();
  });

  document.addEventListener('wheel', (e) => {
    if (!state.active) return;
    e.preventDefault();
    mainEl.scrollTop += e.deltaY;
    updateAutoScroll(state.lastClientY);
  }, { passive: false });
});
