// ===== 数据持久化 =====

// 检查数据是否包含实际内容（至少有一个 entry）
function hasRealData(data) {
  if (!data || !Array.isArray(data.sections)) return false;
  return data.sections.some(s => Array.isArray(s.groups) && s.groups.some(g => Array.isArray(g.entries) && g.entries.length > 0));
}

function saveData() {
  // 安全检查：拒绝保存空数据到已有数据的 localStorage
  if (!hasRealData(appData)) {
    const existing = localStorage.getItem('musicData');
    if (existing && hasRealData(JSON.parse(existing))) {
      console.warn('安全保护：阻止空数据覆盖已有数据');
      return;
    }
  }
  try {
    const json = JSON.stringify(appData);
    localStorage.setItem('musicData', json);
    if (json.length > 4 * 1024 * 1024) {
      console.warn('localStorage 数据量较大 (' + (json.length / 1024 / 1024).toFixed(1) + 'MB)，接近浏览器存储上限');
    }
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showAlert(t('dialog.storageFull'));
    } else {
      console.error('Failed to save data:', e);
    }
  }
}

function loadData() {
  const saved = localStorage.getItem('musicData');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // 校验数据结构完整性
      if (parsed && Array.isArray(parsed.sections)) {
        return parsed;
      }
      console.warn('localStorage 数据结构异常，已忽略');
    } catch (e) {
      console.error('Failed to parse saved data:', e);
    }
  }
  return null;
}

// ===== 下拉菜单统一关闭 =====

function closeAllDropdowns() {
  document.getElementById('scoreFilter').classList.remove('open');
  document.getElementById('tagFilter').classList.remove('open');
  document.getElementById('editSectionSelect').classList.remove('open');
  document.getElementById('mustHearPopover').classList.remove('open');
}

// ===== 初始化入口 =====

async function init() {
  applyLang();
  applyTheme();

  try {
    const savedData = loadData();
    if (savedData) {
      appData = savedData;
    } else if (__MUSIC_DATA__ && __MUSIC_DATA__.sections && __MUSIC_DATA__.sections.length > 0) {
      appData = __MUSIC_DATA__;
      saveData();
    } else {
      const resp = await fetch('data.json');
      const fetched = await resp.json();
      if (fetched && fetched.sections && fetched.sections.length > 0) {
        appData = fetched;
        saveData();
      } else if (savedData) {
        // localStorage 有数据就用，即使 fallback 是空的
        appData = savedData;
      } else {
        appData = { meta: { title: "Xan's Music Ratings", lastUpdated: new Date().toISOString().slice(0, 10) }, sections: [] };
      }
    }
    if (migrateVolSections()) saveData();
    ensureDefaultGroups();
    // 只有 localStorage 原本有数据时才回写，防止空数据覆盖
    if (loadData()) saveData();
  } catch (e) {
    document.getElementById('contentArea').innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--text-secondary)">' +
      '<p style="font-size:18px;margin-bottom:8px">' + t('error.loadData') + '</p>' +
      '<p>' + t('error.loadDataHint') + '</p>';
    return;
  }

  buildEntryIndex();
  renderSidebar();
  renderContent();
  setupScrollSync();

  bindStaticButtons();
  bindScoreFilter();
  bindTagFilter();
  bindSectionSelector();
  bindSearch();
  bindMustHear();
  bindSidebar();
  bindTrackList();
  bindContentArea();
}

// ===== 事件绑定：工具栏按钮 / 弹窗按钮 =====

function bindStaticButtons() {
  document.querySelector('[data-action="export-json"]').addEventListener('click', exportJSON);
  document.querySelector('[data-action="import-json"]').addEventListener('click', importJSON);
  document.getElementById('langToggle').addEventListener('click', toggleLang);
  document.getElementById('styleToggle').addEventListener('click', toggleStyle);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('searchNextBtn').addEventListener('click', goToNextResult);
  document.getElementById('searchPrevBtn').addEventListener('click', goToPrevResult);
  document.querySelector('[data-action="add-album"]').addEventListener('click', openAddModal);
  document.querySelector('[data-action="add-track"]').addEventListener('click', addTrack);
  document.querySelector('[data-action="modal-cancel"]').addEventListener('click', closeModal);
  document.getElementById('deleteBtn').addEventListener('click', deleteEntry);
  document.querySelector('[data-action="modal-save"]').addEventListener('click', saveEntry);

  // 批量操作按钮
  document.getElementById('batchToggleBtn').addEventListener('click', toggleBatchMode);
  document.querySelector('[data-action="cancel-batch"]').addEventListener('click', cancelBatchMode);
  document.querySelector('[data-action="batch-select-all"]').addEventListener('click', batchSelectAll);
  document.querySelector('[data-action="batch-deselect-all"]').addEventListener('click', batchDeselectAll);
  document.querySelector('[data-action="batch-delete"]').addEventListener('click', batchDelete);

  // 批量下拉菜单切换
  document.querySelector('[data-action="batch-toggle-tag-add"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = document.getElementById('batchTagAddMenu').classList.contains('active');
    closeBatchDropdowns();
    if (!wasOpen) document.getElementById('batchTagAddMenu').classList.add('active');
  });

  document.querySelector('[data-action="batch-toggle-tag-remove"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = document.getElementById('batchTagRemoveMenu').classList.contains('active');
    closeBatchDropdowns();
    if (!wasOpen) document.getElementById('batchTagRemoveMenu').classList.add('active');
  });

  document.querySelector('[data-action="batch-toggle-move"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = document.getElementById('batchMoveMenu').classList.contains('active');
    closeBatchDropdowns();
    if (!wasOpen) {
      populateBatchMoveMenu();
      document.getElementById('batchMoveMenu').classList.add('active');
    }
  });

  // 标签下拉菜单点击事件
  document.getElementById('batchTagAddMenu').addEventListener('click', (e) => {
    const item = e.target.closest('.batch-dropdown-item');
    if (item) batchAddTag(item.dataset.tag);
  });

  document.getElementById('batchTagRemoveMenu').addEventListener('click', (e) => {
    const item = e.target.closest('.batch-dropdown-item');
    if (item) batchRemoveTag(item.dataset.tag);
  });

  // 点击外部关闭下拉菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.batch-dropdown')) {
      closeBatchDropdowns();
    }
  });
}

// ===== 事件绑定：分数筛选下拉 =====

function bindScoreFilter() {
  const trigger = document.getElementById('scoreFilterTrigger');
  const menu = document.getElementById('scoreFilterMenu');
  const select = document.getElementById('scoreFilter');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = select.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) select.classList.add('open');
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('.custom-select-option');
    if (!opt) return;
    menu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    trigger.textContent = opt.textContent;
    currentScoreFilter = opt.dataset.value;
    applyFilters();
    select.classList.remove('open');
  });

  document.addEventListener('click', () => closeAllDropdowns());
}

// ===== 事件绑定：标签筛选下拉（多选） =====

function bindTagFilter() {
  const trigger = document.getElementById('tagFilterTrigger');
  const menu = document.getElementById('tagFilterMenu');
  const select = document.getElementById('tagFilter');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = select.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) select.classList.add('open');
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const opt = e.target.closest('.custom-select-option');
    if (!opt) return;
    const val = opt.dataset.value;

    if (val === 'all') {
      menu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      currentFilter = [];
    } else {
      menu.querySelector('[data-value="all"]').classList.remove('active');
      opt.classList.toggle('active');
      const selected = [...menu.querySelectorAll('.custom-select-option.active:not([data-value="all"])')];
      if (selected.length === 0) {
        menu.querySelector('[data-value="all"]').classList.add('active');
        currentFilter = [];
      } else {
        currentFilter = selected.map(o => o.dataset.value);
      }
    }

    const activeCount = currentFilter.length;
    trigger.textContent = activeCount === 0 ? t('toolbar.allTags') : activeCount + (currentLang === 'zh' ? ' 个标签' : ' tag' + (activeCount > 1 ? 's' : ''));
    applyFilters();
  });
}

// ===== 事件绑定：编辑弹窗内的分组选择器 =====

function bindSectionSelector() {
  const select = document.getElementById('editSectionSelect');
  const trigger = document.getElementById('editSectionTrigger');
  const menu = document.getElementById('editSectionMenu');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    select.classList.toggle('open');
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('.custom-select-option');
    if (!opt) return;
    menu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    trigger.textContent = opt.textContent;
    selectedSectionValue = opt.dataset.value;
    select.classList.remove('open');
    // 根据分组切换 AOTY/SOTY 标签
    try {
      const sel = JSON.parse(selectedSectionValue);
      const aotyLabel = document.querySelector('[data-i18n="modal.aoty"]');
      if (aotyLabel) aotyLabel.textContent = sel.groupName === 'Singles' ? t('modal.soty') : t('modal.aoty');
    } catch (_) {}
  });
}

// ===== 事件绑定：搜索输入 =====

function bindSearch() {
  let searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      applyFilters();
    }, 200);
  });
}

// ===== 事件绑定：必听专辑阈值面板 =====

function bindMustHear() {
  const trigger = document.getElementById('mustHearTrigger');
  const popover = document.getElementById('mustHearPopover');
  const input = document.getElementById('mustHearInput');
  const saveBtn = document.getElementById('mustHearSave');
  const toggle = document.getElementById('mustHearToggle');

  trigger.textContent = t('toolbar.mustHear');
  input.value = mustHearThreshold;
  toggle.checked = mustHearEnabled;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    popover.classList.toggle('open');
  });

  saveBtn.addEventListener('click', () => {
    mustHearEnabled = toggle.checked;
    localStorage.setItem('mustHearEnabled', mustHearEnabled);
    const v = parseInt(input.value);
    if (!isNaN(v) && v >= 0 && v <= 100) {
      mustHearThreshold = v;
      localStorage.setItem('mustHearThreshold', v);
    }
    trigger.textContent = t('toolbar.mustHear');
    popover.classList.remove('open');
    renderContent();
    applyFilters();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#mustHearSelect')) {
      popover.classList.remove('open');
    }
  });
}

// ===== 事件绑定：侧边栏导航 =====

function bindSidebar() {
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
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navItem.classList.add('active');
      const ca = document.getElementById('contentArea');
      ca.classList.add('overview-scroll');
      resetNavScrollLock();
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
      scrollToGroup(navItem.dataset.nav, e);
      return;
    }
    // 折叠/展开分组
    const groupHeader = e.target.closest('[data-action="toggle-nav-group"]');
    if (groupHeader) toggleNavGroup(groupHeader);
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

  // 新年份按钮（在 sidebarNav 外部）
  document.querySelector('.sidebar').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="add-new-year"]')) addNewYear();
  });
}

// 侧边栏导航定时器清理（点击导航和搜索结果共享）
function resetNavScrollLock() {
  if (window._navActiveInterval) { clearInterval(window._navActiveInterval); window._navActiveInterval = null; }
  if (window._navActiveTimeout) { clearTimeout(window._navActiveTimeout); window._navActiveTimeout = null; }
  if (window._navScrollDelay) { clearTimeout(window._navScrollDelay); window._navScrollDelay = null; }
}

// ===== 事件绑定：曲目列表 =====

function bindTrackList() {
  const trackList = document.getElementById('trackList');

  trackList.addEventListener('input', (e) => {
    const row = e.target.closest('.track-row');
    if (!row) return;
    const idx = parseInt(row.dataset.trackIndex);
    if (e.target.classList.contains('track-name-input')) {
      editingTracks[idx].name = e.target.value;
    } else if (e.target.classList.contains('track-score-input')) {
      e.target.value = e.target.value.replace(/[^0-9NR]/g, '');
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
    if (removeBtn) removeTrack(parseInt(removeBtn.dataset.trackIndex));
  });
}

// ===== 事件绑定：内容区（卡片点击 / 乐评展开） =====

function bindContentArea() {
  const contentArea = document.getElementById('contentArea');

  contentArea.addEventListener('click', (e) => {
    const reviewToggle = e.target.closest('[data-action="toggle-review"]');
    if (reviewToggle) {
      e.stopPropagation();
      toggleReview(reviewToggle);
      return;
    }
    // 批量模式下点击卡片切换选中
    if (batchMode) {
      const batchCheckbox = e.target.closest('[data-action="batch-toggle-entry"]');
      if (batchCheckbox) {
        e.stopPropagation();
        batchToggleEntry(batchCheckbox.dataset.entryId);
        return;
      }
      const card = e.target.closest('.album-card, .aoty-card');
      if (card) {
        e.stopPropagation();
        batchToggleEntry(card.dataset.entryId);
        return;
      }
      return;
    }
    const card = e.target.closest('[data-action="open-edit"]');
    if (card) {
      openEditModal(card.dataset.entryId, card.dataset.section, card.dataset.group);
    }
  });

  contentArea.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const card = e.target.closest('[data-action="open-edit"]');
    if (card) {
      openEditModal(card.dataset.entryId, card.dataset.section, card.dataset.group);
    }
  });
}

// ===== 批量操作 =====

function toggleBatchMode() {
  batchMode = !batchMode;
  batchSelectedIds.clear();
  const toggleBtn = document.getElementById('batchToggleBtn');
  const batchBar = document.getElementById('batchBar');
  const contentArea = document.getElementById('contentArea');
  const fab = document.querySelector('.fab');
  const searchNextBtn = document.getElementById('searchNextBtn');
  const searchPrevBtn = document.getElementById('searchPrevBtn');

  toggleBtn.classList.toggle('active', batchMode);
  batchBar.classList.toggle('active', batchMode);
  contentArea.classList.toggle('batch-mode', batchMode);

  // 隐藏 FAB 按钮
  if (fab) fab.style.display = batchMode ? 'none' : 'flex';
  if (searchNextBtn) searchNextBtn.style.display = 'none';
  if (searchPrevBtn) searchPrevBtn.style.display = 'none';

  // 清除搜索高亮
  clearSearchHighlight();
  searchIndex = -1;
  updateBatchBar();

  // 填充移动菜单
  if (batchMode) {
    populateBatchMoveMenu();
  }
}

function cancelBatchMode() {
  batchMode = false;
  batchSelectedIds.clear();
  const toggleBtn = document.getElementById('batchToggleBtn');
  const batchBar = document.getElementById('batchBar');
  const contentArea = document.getElementById('contentArea');
  const fab = document.querySelector('.fab');

  toggleBtn.classList.remove('active');
  batchBar.classList.remove('active');
  contentArea.classList.remove('batch-mode');

  // 恢复 FAB 按钮
  if (fab) fab.style.display = 'flex';

  // 关闭所有下拉菜单
  closeBatchDropdowns();

  renderContent();
}

function batchToggleEntry(entryId) {
  if (batchSelectedIds.has(entryId)) {
    batchSelectedIds.delete(entryId);
  } else {
    batchSelectedIds.add(entryId);
  }
  // 更新卡片选中状态
  const card = document.querySelector(`.album-card[data-entry-id="${entryId}"], .aoty-card[data-entry-id="${entryId}"]`);
  if (card) {
    card.classList.toggle('batch-selected', batchSelectedIds.has(entryId));
    const checkbox = card.querySelector('.batch-checkbox');
    if (checkbox) checkbox.classList.toggle('checked', batchSelectedIds.has(entryId));
  }
  updateBatchBar();
}

function batchSelectAll() {
  for (const { card, entry } of allCards) {
    if (!card.classList.contains('hidden') && entry) {
      batchSelectedIds.add(entry.id);
    }
  }
  renderContent();
  updateBatchBar();
}

function batchDeselectAll() {
  batchSelectedIds.clear();
  renderContent();
  updateBatchBar();
}

function updateBatchBar() {
  const countEl = document.getElementById('batchCount');
  if (countEl) {
    countEl.textContent = t('batch.selected', { count: batchSelectedIds.size });
  }
}

function closeBatchDropdowns() {
  document.querySelectorAll('.batch-dropdown-menu').forEach(m => m.classList.remove('active'));
}

async function batchDelete() {
  if (batchSelectedIds.size === 0) {
    showAlert(t('batch.noSelection'));
    return;
  }
  const confirmed = await showConfirm(t('batch.deleteTitle'), t('batch.deleteMsg', { count: batchSelectedIds.size }));
  if (!confirmed) return;

  for (const section of appData.sections) {
    for (const group of section.groups) {
      group.entries = group.entries.filter(e => !batchSelectedIds.has(e.id));
    }
  }

  batchSelectedIds.clear();
  refreshAll();
  updateBatchBar();
}

async function batchAddTag(tag) {
  if (batchSelectedIds.size === 0) {
    showAlert(t('batch.noSelection'));
    return;
  }

  const confirmed = await showConfirm(t('batch.tagTitle'), t('batch.addTagMsg', { tag: tag, count: batchSelectedIds.size }));
  if (!confirmed) return;

  for (const id of batchSelectedIds) {
    const entry = findEntry(id);
    if (entry) {
      if (!entry.tags) entry.tags = [];
      if (!entry.tags.includes(tag)) {
        entry.tags.push(tag);
      }
    }
  }

  refreshAll();
  updateBatchBar();
  closeBatchDropdowns();
}

async function batchRemoveTag(tag) {
  if (batchSelectedIds.size === 0) {
    showAlert(t('batch.noSelection'));
    return;
  }

  const confirmed = await showConfirm(t('batch.tagTitle'), t('batch.removeTagMsg', { tag: tag, count: batchSelectedIds.size }));
  if (!confirmed) return;

  for (const id of batchSelectedIds) {
    const entry = findEntry(id);
    if (entry && entry.tags) {
      entry.tags = entry.tags.filter(t => t !== tag);
    }
  }

  refreshAll();
  updateBatchBar();
  closeBatchDropdowns();
}

function populateBatchMoveMenu() {
  const menu = document.getElementById('batchMoveMenu');
  if (!menu) return;

  const sections = getMergedSections();
  menu.innerHTML = '';

  for (const section of sections) {
    const displayName = getSectionDisplayName(section);
    const div = document.createElement('div');
    div.className = 'batch-dropdown-item';
    div.dataset.sectionId = section.id;
    div.textContent = displayName;
    div.addEventListener('click', () => {
      batchMoveToSection(section.id);
    });
    menu.appendChild(div);
  }
}

async function batchMoveToSection(targetSectionId) {
  if (batchSelectedIds.size === 0) {
    showAlert(t('batch.noSelection'));
    return;
  }

  const targetSection = findOrCreateSection(targetSectionId);
  let targetGroup = targetSection.groups.find(g => g.name === 'Albums');
  if (!targetGroup) {
    targetGroup = { name: 'Albums', entries: [] };
    targetSection.groups.push(targetGroup);
  }

  // 收集选中的条目并从原位置移除
  const entriesToMove = [];
  for (const section of appData.sections) {
    for (const group of section.groups) {
      for (let i = group.entries.length - 1; i >= 0; i--) {
        if (batchSelectedIds.has(group.entries[i].id)) {
          entriesToMove.push(group.entries.splice(i, 1)[0]);
        }
      }
    }
  }

  // 添加到目标位置
  targetGroup.entries.push(...entriesToMove);

  batchSelectedIds.clear();
  refreshAll();
  updateBatchBar();
  closeBatchDropdowns();
}

// ===== 主题与风格切换 =====

function applyTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  document.getElementById('themeToggle').title = theme === 'dark' ? t('tooltip.lightMode') : t('tooltip.darkMode');

  const savedStyle = localStorage.getItem('style') || 'glass';
  document.documentElement.setAttribute('data-style', savedStyle);
  document.getElementById('styleToggle').textContent = savedStyle === 'glass' ? '💠' : '💎';
  document.getElementById('styleToggle').title = savedStyle === 'glass' ? t('tooltip.solid') : t('tooltip.glass');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
  document.getElementById('themeToggle').title = next === 'dark' ? t('tooltip.lightMode') : t('tooltip.darkMode');
  updateThemeColor();
}

function toggleStyle() {
  const current = document.documentElement.getAttribute('data-style') || 'solid';
  const next = current === 'glass' ? 'solid' : 'glass';
  document.documentElement.setAttribute('data-style', next);
  localStorage.setItem('style', next);
  document.getElementById('styleToggle').textContent = next === 'glass' ? '💠' : '💎';
  document.getElementById('styleToggle').title = next === 'glass' ? t('tooltip.solid') : t('tooltip.glass');
  updateThemeColor();
}

function updateThemeColor() {
  const theme = document.documentElement.getAttribute('data-theme');
  const style = document.documentElement.getAttribute('data-style');
  let color = '#F2F2F7';
  if (theme === 'dark' && style === 'glass') color = '#0f2027';
  else if (theme === 'dark') color = '#000000';
  else if (style === 'glass') color = '#c1dfc4';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', color);
}

// ===== 弹窗全局事件 =====

document.addEventListener('click', (e) => {
  const tag = e.target.closest('.form-tag');
  if (tag) tag.classList.toggle('active');
});

let modalMouseDownOnOverlay = false;
document.getElementById('editModal').addEventListener('mousedown', (e) => {
  modalMouseDownOnOverlay = (e.target.id === 'editModal');
});
document.addEventListener('click', (e) => {
  if (e.target.id === 'editModal' && modalMouseDownOnOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.shiftKey && document.getElementById('editModal').classList.contains('active')) {
    e.preventDefault();
    saveEntry();
  }
});

// ===== 导出 / 导入 =====

function exportJSON() {
  // 桌面端优先使用 Tauri 原生保存对话框
  if (window.__TAURI_PLUGIN_DIALOG__ && window.__TAURI_PLUGIN_FS__) {
    exportDesktopNative();
    return;
  }
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'music-ratings.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function exportDesktopNative() {
  try {
    const { save } = window.__TAURI_PLUGIN_DIALOG__;
    const { writeTextFile } = window.__TAURI_PLUGIN_FS__;
    const filePath = await save({
      defaultPath: 'music-ratings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!filePath) return;
    await writeTextFile(filePath, JSON.stringify(appData, null, 2));
    showAlert(t('dialog.exportSuccess') || '导出成功');
  } catch (err) {
    console.error('导出失败:', err);
    showAlert('导出失败: ' + err);
  }
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = handleImport;
  input.click();
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed || !Array.isArray(parsed.sections)) {
        showAlert(t('dialog.invalidJson'));
        return;
      }
      // 深度校验：确保每个 section 结构正确
      for (const section of parsed.sections) {
        if (!section.id || !Array.isArray(section.groups)) {
          showAlert(t('dialog.invalidJson'));
          return;
        }
        for (const group of section.groups) {
          if (!group.name || !Array.isArray(group.entries)) {
            showAlert(t('dialog.invalidJson'));
            return;
          }
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
      showAlert(t('dialog.invalidJsonGeneric'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ===== 启动 =====

init();

// ===== Tauri 桌面版适配 =====

(async function initTauriDesktop() {
  if (!window.__TAURI__) return;

  // 激活 macOS 桌面端样式
  document.documentElement.setAttribute('data-desktop', 'true');

  const tauriEvent = window.__TAURI__.event;

  // 监听菜单/托盘事件
  tauriEvent?.listen('menu-action', ({ payload }) => {
    switch (payload) {
      case 'import': importJSON(); break;
      case 'export': exportDesktopNative(); break;
      case 'toggle-theme': toggleTheme(); break;
      case 'toggle-style': toggleStyle(); break;
      case 'new-album': openAddModal(); break;
      case 'focus-search':
        document.getElementById('searchInput').focus();
        break;
      case 'about':
        showAlert("Xan's Music Ratings\nDesktop Edition\nv1.0.1");
        break;
    }
  });

  console.log('[Tauri] 桌面版功能已加载');
})();
