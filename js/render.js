// HTML 缓存，避免无变化时的 DOM 重建
let _lastSidebarHtml = '';
let _lastContentHtml = '';

// 滚动同步用的元素缓存（renderContent / renderSidebar 后刷新，避免每帧 querySelectorAll）
let _cachedNavItems = [];
let _cachedGroupEls = [];

function rebuildScrollCache() {
  _cachedNavItems = [...document.querySelectorAll('.nav-item[data-nav]')];
  _cachedGroupEls = [...document.querySelectorAll('[id^="group-"]')];
}

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
    <button data-action="add-new-year" style="width:100%;padding:8px;border:1.5px dashed var(--separator);border-radius:10px;background:transparent;color:var(--accent);font-size:13px;font-weight:500;cursor:pointer;transition:background 0.15s;border-color 0.15s;">${t('sidebar.newYear')}</button>
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
  if (el && main) {
    const y = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - (offset || 0);
    main.scrollTo({ top: y, behavior: 'smooth' });
  }
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
  // 移除所有 active
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active') });
  // 找到目标导航项并激活
  var target = document.querySelector('.nav-item[data-nav="' + groupId + '"]');
  if (!target) return;
  target.classList.add('active');
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
  var ca = document.getElementById('contentArea');
  ca.classList.add('overview-scroll');
  resetNavScrollLock();
  window._navActiveInterval = setInterval(function(){ target.classList.add('active') }, 50);
  window._navActiveTimeout = setTimeout(function(){
    clearInterval(window._navActiveInterval);
    window._navActiveInterval = null;
    window._navActiveTimeout = null;
    window._navScrollDelay = setTimeout(function(){
      ca.classList.remove('overview-scroll');
      window._navScrollDelay = null;
    }, 200);
  }, 1500);
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

      const navItems = _cachedNavItems;
      const groupEls = _cachedGroupEls;

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
    html += `<div class="section" id="section-${escapeHtml(section.id)}">`;
    const sectionYear = (section.title || '').match(/^\d{4}/)?.[0] || section.title;
    html += `<h2 class="section-title">${escapeHtml(sectionYear)}</h2>`;

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

      // 渲染分组标题
      if (group.entries.length > 0) {
        const singlesBottom = group.name === 'Singles' ? 'margin-bottom:40px;' : '';
        html += `<div class="group-title" id="group-${escapeHtml(gid)}" style="${singlesBottom}">${escapeHtml(group.name)}</div>`;
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

  // 缓存检查：HTML 未变化时跳过 DOM 重建
  if (html === _lastContentHtml) {
    updateToolbarStats();
    return;
  }
  _lastContentHtml = html;

  area.innerHTML = html;
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

// 卡片元数据渲染（标签、曲目数、备注文字）— 供 renderAlbumCard / renderAotyCard 共用
function buildCardMeta(entry) {
  const noteText = entry.scoreNote && entry.scoreNote !== 'NR' ? ` (${entry.scoreNote})` : '';
  const noteHtml = noteText ? ' <span style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(noteText) + '</span>' : '';
  const tagsHtml = (entry.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const trackCount = entry.tracks && entry.tracks.length > 0 ? entry.tracks.length : 0;
  const trackHtml = trackCount > 0 ? '<span class="track-count" title="' + t('content.trackTooltip') + '">' + trackCount + t('content.trackUnit') + '</span>' : '';
  const tagsBlock = tagsHtml ? '<div class="album-tags">' + tagsHtml + '</div>' : '';
  return { noteHtml, tagsBlock, trackHtml };
}

function renderAlbumCard(entry, idx, sectionId, groupId, groupName, visible) {
  const scoreClass = getScoreClass(entry.score);
  const scoreText = entry.score != null ? entry.score : (entry.scoreNote === 'NR' ? 'NR' : '—');
  const { noteHtml, tagsBlock, trackHtml } = buildCardMeta(entry);
  const hiddenClass = visible ? '' : 'hidden';
  const hasReview = entry.review && entry.review.trim().length > 0;
  const showMustHear = mustHearEnabled && groupName !== 'Singles' && entry.score != null && entry.score >= mustHearThreshold;
  const selectedClass = batchSelectedIds.has(entry.id) ? 'batch-selected' : '';
  const checkedClass = batchSelectedIds.has(entry.id) ? 'checked' : '';

  return `<div class="album-card ${hiddenClass} ${selectedClass}" data-entry-id="${escapeHtml(entry.id)}" data-section="${escapeHtml(sectionId)}" data-group="${escapeHtml(groupId)}" data-action="open-edit" role="button" tabindex="0">
    <div class="batch-checkbox ${checkedClass}" data-action="batch-toggle-entry" data-entry-id="${escapeHtml(entry.id)}"></div>
    <span class="album-index">${idx}</span>
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
      </div>
    </div>
  </div>`;
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
}

// ===== Delete Year Section =====
async function deleteYearSection(sectionId) {
  const yearNum = parseInt(sectionId);
  if (isNaN(yearNum)) return;

  const entryCount = appData.sections
    .filter(s => s.id === sectionId)
    .reduce((sum, s) => sum + s.groups.reduce((s2, g) => s2 + g.entries.length, 0), 0);

  const confirmed = await showConfirm(
    t('dialog.deleteYear'),
    t('dialog.deleteYearMsg', { year: yearNum, count: entryCount })
  );
  if (!confirmed) return;

  appData.sections = appData.sections.filter(s => s.id !== sectionId);

  refreshAll();
}

