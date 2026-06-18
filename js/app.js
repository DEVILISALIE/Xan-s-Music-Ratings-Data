// ===== 数据持久化 =====

// 检查数据是否包含实际内容（至少有一个 entry）
function hasRealData(data) {
  if (!data || !Array.isArray(data.sections)) return false;
  return data.sections.some(s => Array.isArray(s.groups) && s.groups.some(g => Array.isArray(g.entries) && g.entries.length > 0));
}

// 调试：仅开发模式启用
const isDev = () => !window.__TAURI__;

// 调试：写入日志文件（仅开发模式）
function logMsg(msg) {
  if (!isDev()) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(ts + ' ' + msg);
}

// 调试：统计 appData 中的 AOTY 条目数（仅开发模式输出日志）
function debugAotyCount(label) {
  if (!isDev()) return 0;
  let count = 0;
  let total = 0;
  for (const section of appData.sections) {
    for (const group of section.groups) {
      count += group.entries.filter(e => e.isAoty).length;
      total += group.entries.length;
    }
  }
  const msg = new Date().toISOString().slice(11, 23) + ' [AOTY] ' + label + ': AOTY=' + count + ' Total=' + total;
  console.log(msg);
  return count;
}

let _saveLock = null;
let _saveQueued = false;

async function saveData() {
  // 安全检查：拒绝保存空数据到已有数据的 localStorage
  if (!hasRealData(appData)) {
    const existing = localStorage.getItem('musicData');
    if (existing) {
      try {
        if (hasRealData(JSON.parse(existing))) {
          console.warn('安全保护：阻止空数据覆盖已有数据');
          return;
        }
      } catch (_) { /* localStorage 中的 JSON 已损坏，不阻止本次保存 */ }
    }
  }
  // 并发锁：等待上一次保存完成后再执行
  if (_saveLock) { _saveQueued = true; return await _saveLock; }
  _saveLock = (async () => {
    try {
      const json = JSON.stringify(appData);
      localStorage.setItem('musicData', json);
      if (json.length > 4 * 1024 * 1024) {
        console.warn('localStorage 数据量较大 (' + (json.length / 1024 / 1024).toFixed(1) + 'MB)，接近浏览器存储上限');
      }
      // 桌面版：写入磁盘（仅在有真实数据时）
      if (window.__TAURI__ && hasRealData(appData)) {
        try {
          await window.__TAURI__.core.invoke('save_data_to_disk', { data: json });
        } catch (e) {
          console.error('[Disk] 写入失败:', e);
        }
      }
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        showAlert(t('dialog.storageFull'));
      } else {
        console.error('Failed to save data:', e);
      }
    }
  })();
  try { await _saveLock; } finally { _saveLock = null; }
  if (_saveQueued) { _saveQueued = false; await saveData(); }
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

// 桌面版：从磁盘恢复数据（localStorage 为空时调用）
async function loadDataFromDisk() {
  if (!window.__TAURI__) {
    return null;
  }
  if (isDev()) logMsg('[Disk] 开始读取磁盘...');
  try {
    const json = await window.__TAURI__.core.invoke('load_data_from_disk');
    if (isDev()) logMsg('[Disk] 读取结果: ' + (json ? '有数据(' + json.length + '字节)' : '空'));
    if (json && json.length > 0) {
      const parsed = JSON.parse(json);
      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
        const totalEntries = parsed.sections.reduce((sum, s) =>
          sum + s.groups.reduce((gs, g) => gs + (g.entries ? g.entries.length : 0), 0), 0);
        const totalAoty = parsed.sections.reduce((sum, s) =>
          sum + s.groups.reduce((gs, g) => gs + (g.entries ? g.entries.filter(e => e.isAoty).length : 0), 0), 0);
        if (isDev()) logMsg('[Disk] 恢复成功: ' + totalEntries + ' 条, AOTY: ' + totalAoty);
        return parsed;
      }
      if (isDev()) logMsg('[Disk] 数据结构异常或为空，跳过');
    }
  } catch (e) {
    if (isDev()) logMsg('[Disk] 读取失败: ' + e);
  }
  return null;
}

// 桌面版：带重试的磁盘数据加载
async function loadDataFromDiskWithRetry(maxRetries) {
  maxRetries = maxRetries || 3;
  // 首次尝试前等待一小段时间，确保 Tauri IPC 完全就绪
  await new Promise(r => setTimeout(r, 100));
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) {
      if (isDev()) logMsg('[Disk] 重试 #' + i + '...');
      await new Promise(r => setTimeout(r, 300));
    }
    const data = await loadDataFromDisk();
    if (data) return data;
  }
  return null;
}

// ===== 下拉菜单统一关闭 =====

function closeAllDropdowns() {
  document.getElementById('scoreFilter').classList.remove('open');
  document.getElementById('tagFilter').classList.remove('open');
  document.getElementById('editSectionSelect').classList.remove('open');
  document.getElementById('mustHearPopover').classList.remove('open');
  document.getElementById('settingsSelect').classList.remove('open');
}

// ===== 初始化入口 =====

async function init() {
  if (isDev()) logMsg('[Init] === 应用启动 ===');
  if (isDev()) logMsg('[Init] __TAURI__: ' + !!window.__TAURI__);
  applyLang();
  applyTheme();

  try {
    // 桌面版：优先从磁盘加载（最新数据源）
    if (window.__TAURI__) {
      if (isDev()) logMsg('[Init] 桌面版：优先从磁盘加载');
      const diskData = await loadDataFromDiskWithRetry(3);
      if (diskData) {
        appData = diskData;
        // 同步到 localStorage
        localStorage.setItem('musicData', JSON.stringify(appData));
        if (isDev()) logMsg('[Init] 磁盘数据已同步到 localStorage');
      } else {
        // 磁盘无数据，尝试 localStorage
        if (isDev()) logMsg('[Init] 磁盘无数据，尝试 localStorage');
        const savedData = loadData();
        const hasEntries = savedData && savedData.sections && savedData.sections.some(s =>
          s.groups && s.groups.some(g => g.entries && g.entries.length > 0));
        if (hasEntries) {
          appData = savedData;
          // localStorage 有数据但磁盘没有，写入磁盘
          await saveData();
        } else {
          // 两者都没有，检查磁盘文件是否存在（可能读取失败）
          let hasDiskFile = false;
          try {
            hasDiskFile = await window.__TAURI__.core.invoke('check_disk_data');
          } catch (_) {}
          if (isDev()) logMsg('[Init] 磁盘加载失败, hasDiskFile:' + hasDiskFile);
          if (hasDiskFile) {
            document.getElementById('contentArea').innerHTML =
              '<div style="padding:40px;text-align:center;color:var(--text-secondary)">' +
              '<p style="font-size:18px;margin-bottom:8px">数据加载失败</p>' +
              '<p>磁盘数据文件存在但无法读取，请尝试重新启动应用</p>' +
              '<p style="margin-top:12px;font-size:12px;opacity:0.6">AppData/Roaming/com.xan.music-ratings/music-data.json</p>' +
              '</div>';
            return;
          }
          // 使用内置数据
          if (__MUSIC_DATA__ && __MUSIC_DATA__.sections && __MUSIC_DATA__.sections.length > 0 &&
              __MUSIC_DATA__.sections.some(s => s.groups && s.groups.some(g => g.entries && g.entries.length > 0))) {
            appData = __MUSIC_DATA__;
            if (isDev()) logMsg('[Init] 使用内置数据');
            await saveData();
          } else {
            appData = { meta: { title: "Xan's Music Ratings", lastUpdated: new Date().toISOString().slice(0, 10) }, sections: [] };
          }
        }
      }
    } else {
      // 网页版：localStorage 优先
      const savedData = loadData();
      const hasEntries = savedData && savedData.sections && savedData.sections.some(s =>
        s.groups && s.groups.some(g => g.entries && g.entries.length > 0));
      if (hasEntries) {
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
        } else {
          appData = { meta: { title: "Xan's Music Ratings", lastUpdated: new Date().toISOString().slice(0, 10) }, sections: [] };
        }
      }
    }
    if (migrateVolSections()) await saveData();
    ensureDefaultGroups();
    // 仅在有真实数据时才持久化
    if (hasRealData(appData)) {
      await saveData();
    } else {
      if (isDev()) logMsg('[Init] 警告: appData 无真实数据，跳过保存');
    }
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
  setupCoverEvents();
}

// ===== 事件绑定：工具栏按钮 / 弹窗按钮 =====

function bindStaticButtons() {
  document.querySelector('[data-action="export-json"]').addEventListener('click', exportJSON);
  document.querySelector('[data-action="import-json"]').addEventListener('click', importJSON);
  document.getElementById('searchNextBtn').addEventListener('click', goToNextResult);
  document.getElementById('searchPrevBtn').addEventListener('click', goToPrevResult);
  document.querySelector('[data-action="add-album"]').addEventListener('click', openAddModal);
  document.querySelector('[data-action="add-disc"]').addEventListener('click', addDisc);
  document.querySelector('[data-action="modal-cancel"]').addEventListener('click', closeModal);
  document.getElementById('deleteBtn').addEventListener('click', deleteEntry);
  document.querySelector('[data-action="modal-save"]').addEventListener('click', saveEntry);

  // 设置按钮
  document.getElementById('settingsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const select = document.getElementById('settingsSelect');
    const wasOpen = select.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) {
      select.classList.add('open');
      syncSettingsToggles();
    }
  });
  document.getElementById('settingsThemeToggle').addEventListener('change', () => { toggleTheme(); });
  document.getElementById('settingsStyleToggle').addEventListener('change', () => { toggleStyle(); });
  document.querySelector('[data-action="settings-lang"]').addEventListener('click', () => { toggleLang(); });

  // 批量操作按钮
  document.querySelector('[data-action="settings-batch"]').addEventListener('click', () => { toggleBatchMode(); });
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
    const wasOpen = popover.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) popover.classList.add('open');
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
    // 只更新 Must Hear 标记，不全量重建 DOM
    updateMustHearBadges();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#mustHearSelect') && popover.classList.contains('open')) {
      // 关闭时丢弃未保存的修改，恢复为已保存的值
      input.value = mustHearThreshold;
      toggle.checked = mustHearEnabled;
      popover.classList.remove('open');
    }
  });
}

function updateMustHearBadges() {
  document.querySelectorAll('.album-card[data-entry-id]').forEach(card => {
    const entry = findEntry(card.dataset.entryId);
    if (!entry) return;
    const existing = card.querySelector('.must-hear');
    const shouldShow = mustHearEnabled && entry.score != null && entry.score >= mustHearThreshold;
    if (shouldShow && !existing) {
      const span = document.createElement('span');
      span.className = 'must-hear';
      span.textContent = t('content.mustHear');
      const artist = card.querySelector('.album-artist');
      if (artist) artist.after(span);
    } else if (!shouldShow && existing) {
      existing.remove();
    }
  });
}

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
    if (removeBtn) { removeTrack(parseInt(removeBtn.dataset.trackIndex)); return; }
    const addBtn = e.target.closest('[data-action="add-track-to-disc"]');
    if (addBtn) addTrackToDisc(parseInt(addBtn.dataset.disc));
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
    // 批量模式下点击卡片切换选中（支持 Shift 范围选择）
    if (batchMode) {
      const batchCheckbox = e.target.closest('[data-action="batch-toggle-entry"]');
      const card = e.target.closest('.album-card, .aoty-card');
      const target = batchCheckbox || card;
      if (target) {
        e.stopPropagation();
        const entryId = target.dataset.entryId || (card && card.dataset.entryId);
        if (!entryId) return;

        if (e.shiftKey && window._lastBatchClickId) {
          // Shift+click：选中上次点击到当前点击之间的所有卡片
          const visibleCards = allCards.filter(c => !c.card.classList.contains('hidden'));
          const lastIdx = visibleCards.findIndex(c => c.entry && c.entry.id === window._lastBatchClickId);
          const curIdx = visibleCards.findIndex(c => c.entry && c.entry.id === entryId);
          if (lastIdx !== -1 && curIdx !== -1) {
            const start = Math.min(lastIdx, curIdx);
            const end = Math.max(lastIdx, curIdx);
            for (let i = start; i <= end; i++) {
              if (visibleCards[i].entry) {
                batchSelectedIds.add(visibleCards[i].entry.id);
                const el = visibleCards[i].card;
                el.classList.add('batch-selected');
                const cb = el.querySelector('.batch-checkbox');
                if (cb) cb.classList.add('checked');
              }
            }
            updateBatchBar();
          }
        } else {
          batchToggleEntry(entryId);
        }
        window._lastBatchClickId = entryId;
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
  const batchBar = document.getElementById('batchBar');
  const contentArea = document.getElementById('contentArea');
  const fab = document.querySelector('.fab');
  const searchNextBtn = document.getElementById('searchNextBtn');
  const searchPrevBtn = document.getElementById('searchPrevBtn');

  batchBar.classList.toggle('active', batchMode);
  contentArea.classList.toggle('batch-mode', batchMode);
  const batchVal = document.getElementById('settingsBatchValue');
  if (batchVal) batchVal.textContent = batchMode ? 'ON' : 'OFF';

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
  window._lastBatchClickId = null;
  const batchBar = document.getElementById('batchBar');
  const contentArea = document.getElementById('contentArea');
  const fab = document.querySelector('.fab');

  batchBar.classList.remove('active');
  contentArea.classList.remove('batch-mode');
  const batchVal = document.getElementById('settingsBatchValue');
  if (batchVal) batchVal.textContent = 'OFF';

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

  debugAotyCount('batchDelete 开始');
  console.log('[BatchDelete] 删除', batchSelectedIds.size, '个条目');

  for (const section of appData.sections) {
    for (const group of section.groups) {
      const before = group.entries.length;
      group.entries = group.entries.filter(e => !batchSelectedIds.has(e.id));
      if (group.entries.length !== before) {
        console.log('[BatchDelete]', section.id, group.name, '从', before, '变为', group.entries.length);
      }
    }
  }

  batchSelectedIds.clear();
  debugAotyCount('batchDelete 后');
  await refreshAll();
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

  await refreshAll();
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

  await refreshAll();
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

  debugAotyCount('batchMove 开始');
  console.log('[BatchMove] 移动', batchSelectedIds.size, '个条目到', targetSectionId);

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
          const entry = group.entries.splice(i, 1)[0];
          console.log('[BatchMove] 取出:', entry.title, 'isAoty:', entry.isAoty, 'from', section.id, group.name);
          entriesToMove.push(entry);
        }
      }
    }
  }

  // 添加到目标位置
  targetGroup.entries.push(...entriesToMove);
  console.log('[BatchMove] 目标组现在有', targetGroup.entries.length, '个条目');

  batchSelectedIds.clear();
  debugAotyCount('batchMove 添加后');
  await refreshAll();
  debugAotyCount('batchMove refreshAll 后');
  updateBatchBar();
  closeBatchDropdowns();
}

// ===== 主题与风格切换 =====

function applyTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  const themeCb = document.getElementById('settingsThemeToggle');
  if (themeCb) themeCb.checked = theme === 'dark';

  const savedStyle = localStorage.getItem('style') || 'glass';
  document.documentElement.setAttribute('data-style', savedStyle);
  const styleCb = document.getElementById('settingsStyleToggle');
  if (styleCb) styleCb.checked = savedStyle === 'glass';
}

function updateLangTexts() {
  // 分组标题
  document.querySelectorAll('.group-title').forEach(el => {
    const id = el.id || '';
    if (id.includes('-albums')) el.textContent = t('toolbar.albums');
    else if (id.includes('-singles')) el.textContent = t('toolbar.singles');
  });
  // Must Hear 标记
  document.querySelectorAll('.must-hear').forEach(el => {
    el.textContent = t('content.mustHear');
  });
  // 统计面板
  updateGlobalStatsSidebar();
  // 侧边栏
  renderSidebar();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const cb = document.getElementById('settingsThemeToggle');
  if (cb) cb.checked = next === 'dark';
  updateThemeColor();
}

function toggleStyle() {
  const current = document.documentElement.getAttribute('data-style') || 'solid';
  const next = current === 'glass' ? 'solid' : 'glass';
  document.documentElement.setAttribute('data-style', next);
  localStorage.setItem('style', next);
  const cb = document.getElementById('settingsStyleToggle');
  if (cb) cb.checked = next === 'glass';
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

function syncSettingsToggles() {
  const theme = document.documentElement.getAttribute('data-theme');
  const style = document.documentElement.getAttribute('data-style') || 'glass';
  const themeCb = document.getElementById('settingsThemeToggle');
  const styleCb = document.getElementById('settingsStyleToggle');
  const langVal = document.getElementById('settingsLangValue');
  if (themeCb) themeCb.checked = theme === 'dark';
  if (styleCb) styleCb.checked = style === 'glass';
  if (langVal) langVal.textContent = currentLang === 'zh' ? '中文' : 'English';
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
  if (e.key === 'Escape') {
    closeModal();
    document.getElementById('yearlyStatsModal').classList.remove('active');
  }
  if (e.key === 'Enter' && e.shiftKey && document.getElementById('editModal').classList.contains('active')) {
    e.preventDefault();
    saveEntry();
  }
});

// 年度统计弹窗：点击遮罩关闭
document.getElementById('yearlyStatsModal').addEventListener('click', (e) => {
  if (e.target.id === 'yearlyStatsModal') {
    e.target.classList.remove('active');
  }
});
document.querySelector('[data-action="yearly-stats-close"]').addEventListener('click', () => {
  document.getElementById('yearlyStatsModal').classList.remove('active');
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
  reader.onload = async (ev) => {
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
            for (const tr of entry.tracks) { if (!tr.disc) tr.disc = 1; }
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
      await refreshAll();
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
  const invoke = window.__TAURI__.core.invoke;

  // 显示版本号
  try {
    const version = await invoke('get_app_version');
    const el = document.getElementById('appVersion');
    if (el) el.textContent = 'v' + version;
  } catch (_) {}

  // 窗口控件
  const maximizeBtn = document.querySelector('[data-action="win-maximize"]');
  const pinBtn = document.querySelector('[data-action="win-topmost"]');
  const pinEmpty = '<svg class="pin-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="3" width="14" height="4.5" rx="2"/><line x1="12" y1="7.5" x2="12" y2="21" stroke-width="2.8"/></svg>';
  const pinFilled = '<svg class="pin-icon" width="11" height="11" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="14" height="4.5" rx="2"/><line x1="12" y1="7.5" x2="12" y2="21" stroke-width="2.8"/></svg>';
  const maximizeSvg = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1"><rect x="0.5" y="0.5" width="9" height="9" rx="1"/></svg>';
  const restoreSvg = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="0.5" width="7.5" height="7.5" rx="1"/><rect x="0.5" y="2" width="7.5" height="7.5" rx="1" fill="var(--card-bg, #fff)"/></svg>';
  let isTopmost = false;

  pinBtn?.addEventListener('click', () => {
    invoke('toggle_topmost');
    isTopmost = !isTopmost;
    pinBtn.innerHTML = isTopmost ? pinFilled : pinEmpty;
    pinBtn.classList.toggle('active', isTopmost);
  });

  async function updateMaximizeIcon() {
    if (!maximizeBtn) return;
    try {
      const [isMax, isFs] = await Promise.all([
        invoke('is_window_maximized'),
        invoke('is_window_fullscreen')
      ]);
      maximizeBtn.innerHTML = (isMax || isFs) ? restoreSvg : maximizeSvg;
    } catch (_) {}
  }

  maximizeBtn?.addEventListener('click', () => {
    invoke('toggle_maximize').then(updateMaximizeIcon);
  });
  document.querySelector('[data-action="win-fullscreen"]')?.addEventListener('click', () => {
    invoke('toggle_fullscreen').then(updateMaximizeIcon);
  });
  document.querySelector('[data-action="win-minimize"]')?.addEventListener('click', () => {
    invoke('minimize_window');
  });
  document.querySelector('[data-action="win-close"]')?.addEventListener('click', () => {
    invoke('close_window');
  });

  // 标题栏拖拽（替代 -webkit-app-region: drag，避免系统右键菜单）
  document.getElementById('titleBar')?.addEventListener('mousedown', (e) => {
    if (e.target.closest('.titlebar-controls')) return;
    if (e.button !== 0) return;
    invoke('start_window_drag');
  });

  // 标题栏双击切换最大化
  document.getElementById('titleBar')?.addEventListener('dblclick', (e) => {
    if (e.target.closest('.titlebar-controls')) return;
    invoke('toggle_maximize').then(updateMaximizeIcon);
  });

  // 监听窗口大小变化，自动更新图标
  tauriEvent?.listen('tauri://resize', updateMaximizeIcon);
  // 初始化图标状态
  updateMaximizeIcon();

  // ===== 自定义右键菜单 =====
  const ctxMenu = document.getElementById('contextMenu');
  const ctxMaximizeItem = document.getElementById('ctxMaximizeItem');
  const ctxTopmostItem = document.getElementById('ctxTopmostItem');

  function updateCtxMenuLabels() {
    try {
      Promise.all([invoke('is_window_maximized'), invoke('is_window_fullscreen')]).then(([isMax, isFs]) => {
        ctxMaximizeItem.childNodes[0].textContent = (isMax || isFs) ? '还原' : '最大化';
      });
      invoke('toggle_topmost').then(() => {
        // toggle_topmost 是切换，需要先查询状态。用另一个方式
      });
    } catch (_) {}
  }

  // 禁止系统右键菜单，显示自定义菜单
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ctxMenu) return;

    // 更新菜单项文字
    const isZh = currentLang === 'zh';
    const minLabel = isZh ? '最小化' : 'Minimize';
    const closeLabel = isZh ? '关闭' : 'Close';
    const topLabel = isZh ? '置顶' : 'Topmost';
    ctxMenu.children[0].childNodes[0].textContent = minLabel;
    ctxMenu.children[0].querySelector('.shortcut').textContent = '—';
    ctxMenu.children[2].childNodes[0].textContent = topLabel;
    ctxMenu.children[2].querySelector('.shortcut').textContent = 'Ctrl+T';
    ctxMenu.children[4].childNodes[0].textContent = closeLabel;
    ctxMenu.children[4].querySelector('.shortcut').textContent = 'Alt+F4';

    // 更新最大化/还原标签
    Promise.all([invoke('is_window_maximized'), invoke('is_window_fullscreen')]).then(([isMax, isFs]) => {
      ctxMaximizeItem.childNodes[0].textContent = (isMax || isFs)
        ? (isZh ? '还原' : 'Restore')
        : (isZh ? '最大化' : 'Maximize');
    }).catch(() => {});

    // 定位菜单（防止超出窗口）
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';
    ctxMenu.classList.add('open');
  });

  // 菜单项点击
  ctxMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'ctx-minimize') invoke('minimize_window');
    else if (action === 'ctx-maximize') invoke('toggle_maximize').then(updateMaximizeIcon);
    else if (action === 'ctx-topmost') invoke('toggle_topmost');
    else if (action === 'ctx-close') invoke('close_window');
    ctxMenu.classList.remove('open');
  });

  // 点击其他地方关闭菜单
  document.addEventListener('click', () => ctxMenu?.classList.remove('open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ctxMenu?.classList.remove('open'); });

  // 监听托盘事件
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
        showAlert("Xan's Music Ratings\nDesktop Edition\nv1.3.3");
        break;
    }
  });

  // 监听关闭请求：先保存数据，再退出
  tauriEvent?.listen('request-shutdown', async () => {
    try { await saveData(); } catch (_) {}
    invoke('graceful_exit');
  });

  console.log('[Tauri] 桌面版功能已加载');
})();
