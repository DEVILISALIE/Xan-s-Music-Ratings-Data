// Data persistence
function saveData() {
  try {
    const json = JSON.stringify(appData);
    localStorage.setItem('musicData', json);
    // 容量监控：超过 4MB 时警告
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

function loadData() {
  const saved = localStorage.getItem('musicData');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved data:', e);
    }
  }
  return null;
}

async function init() {
  applyLang();
  applyTheme();
  try {
    // Priority: localStorage > __MUSIC_DATA__ > data.json
    const savedData = loadData();
    if (savedData) {
      appData = savedData;
    } else if (__MUSIC_DATA__) {
      appData = __MUSIC_DATA__;
    } else {
      const resp = await fetch('data.json');
      appData = await resp.json();
    }
    // 迁移旧版 vol sections 数据
    if (migrateVolSections()) {
      saveData();
    }
    // 确保每个年份都有 Albums/Singles 分组
    ensureDefaultGroups();
    saveData();
  } catch (e) {
    document.getElementById("contentArea").innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--text-secondary)">' +
      '<p style="font-size:18px;margin-bottom:8px">' + t('error.loadData') + '</p>' +
      '<p>' + t('error.loadDataHint') + '</p>';
    return;
  }
  buildEntryIndex();
  renderSidebar();
  renderContent();
  setupScrollSync();

  // 静态元素事件绑定（替代原内联 onclick）
  document.querySelector('[data-action="export-json"]').addEventListener('click', exportJSON);
  document.querySelector('[data-action="import-json"]').addEventListener('click', importJSON);
  document.getElementById('langToggle').addEventListener('click', toggleLang);
  document.getElementById('styleToggle').addEventListener('click', toggleStyle);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('searchNextBtn').addEventListener('click', goToNextResult);
  document.querySelector('[data-action="add-album"]').addEventListener('click', openAddModal);
  document.querySelector('[data-action="add-track"]').addEventListener('click', addTrack);
  document.querySelector('[data-action="modal-cancel"]').addEventListener('click', closeModal);
  document.getElementById('deleteBtn').addEventListener('click', deleteEntry);
  document.querySelector('[data-action="modal-save"]').addEventListener('click', saveEntry);

  // Static element listeners — bound once, not destroyed by innerHTML
  const scoreTrigger = document.getElementById('scoreFilterTrigger');
  const scoreMenu = document.getElementById('scoreFilterMenu');
  const scoreSelect = document.getElementById('scoreFilter');
  const tagTrigger = document.getElementById('tagFilterTrigger');
  const tagMenu = document.getElementById('tagFilterMenu');
  var tagSelect = document.getElementById('tagFilter');

  function closeAllDropdowns() {
    scoreSelect.classList.remove('open');
    tagSelect.classList.remove('open');
    document.getElementById('editSectionSelect').classList.remove('open');
  }

  scoreTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = scoreSelect.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) scoreSelect.classList.add('open');
  });

  scoreMenu.addEventListener('click', (e) => {
    const opt = e.target.closest('.custom-select-option');
    if (!opt) return;
    scoreMenu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    scoreTrigger.textContent = opt.textContent;
    currentScoreFilter = opt.dataset.value;
    applyFilters();
    scoreSelect.classList.remove('open');
  });

  document.addEventListener('click', () => {
    closeAllDropdowns();
  });

  // Tag filter multi-select dropdown
  tagTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = tagSelect.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) tagSelect.classList.add('open');
  });

  tagMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const opt = e.target.closest('.custom-select-option');
    if (!opt) return;
    const val = opt.dataset.value;

    if (val === 'all') {
      tagMenu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      currentFilter = [];
    } else {
      tagMenu.querySelector('[data-value="all"]').classList.remove('active');
      opt.classList.toggle('active');
      const selected = [...tagMenu.querySelectorAll('.custom-select-option.active:not([data-value="all"])')];
      if (selected.length === 0) {
        tagMenu.querySelector('[data-value="all"]').classList.add('active');
        currentFilter = [];
      } else {
        currentFilter = selected.map(o => o.dataset.value);
      }
    }

    const activeCount = currentFilter.length;
    tagTrigger.textContent = activeCount === 0 ? t('toolbar.allTags') : activeCount + (currentLang === 'zh' ? ' 个标签' : ' tag' + (activeCount > 1 ? 's' : ''));
    applyFilters();
  });

  // Section selector custom dropdown
  const sectionSelect = document.getElementById('editSectionSelect');
  const sectionTrigger = document.getElementById('editSectionTrigger');
  const sectionMenu = document.getElementById('editSectionMenu');

  sectionTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    sectionSelect.classList.toggle('open');
  });

  sectionMenu.addEventListener('click', (e) => {
    const opt = e.target.closest('.custom-select-option');
    if (!opt) return;
    sectionMenu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    sectionTrigger.textContent = opt.textContent;
    selectedSectionValue = opt.dataset.value;
    sectionSelect.classList.remove('open');
    // 根据分组切换 AOTY/SOTY 标签
    try {
      const sel = JSON.parse(selectedSectionValue);
      const aotyLabel = document.querySelector('[data-i18n="modal.aoty"]');
      if (aotyLabel) aotyLabel.textContent = sel.groupName === 'Singles' ? t('modal.soty') : t('modal.aoty');
    } catch (_) {}
  });

  let searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      applyFilters();
    }, 200);
  });

  // 必听专辑阈值弹出面板
  const mustHearTrigger = document.getElementById('mustHearTrigger');
  const mustHearPopover = document.getElementById('mustHearPopover');
  const mustHearInput = document.getElementById('mustHearInput');
  const mustHearSave = document.getElementById('mustHearSave');
  const mustHearToggle = document.getElementById('mustHearToggle');

  function updateMustHearLabel() {
    mustHearTrigger.textContent = t('toolbar.mustHear');
  }
  updateMustHearLabel();
  mustHearInput.value = mustHearThreshold;
  mustHearToggle.checked = mustHearEnabled;

  mustHearTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    mustHearPopover.classList.toggle('open');
  });

  mustHearToggle.addEventListener('change', () => {
    // 仅切换 UI 状态，不保存，需要点击保存按钮才生效
  });

  mustHearSave.addEventListener('click', () => {
    mustHearEnabled = mustHearToggle.checked;
    localStorage.setItem('mustHearEnabled', mustHearEnabled);
    const v = parseInt(mustHearInput.value);
    if (!isNaN(v) && v >= 0 && v <= 100) {
      mustHearThreshold = v;
      localStorage.setItem('mustHearThreshold', v);
    }
    updateMustHearLabel();
    mustHearPopover.classList.remove('open');
    renderContent();
    applyFilters();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#mustHearSelect')) {
      mustHearPopover.classList.remove('open');
    }
  });

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
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navItem.classList.add('active');
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
      scrollToGroup(navItem.dataset.nav, e);
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
  // 新年份按钮（在 sidebarNav 外部）
  document.querySelector('.sidebar').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="add-new-year"]')) addNewYear();
  });

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

  // 内容区事件委托
  const contentArea = document.getElementById('contentArea');
  contentArea.addEventListener('click', (e) => {
    // 乐评展开/收起
    const reviewToggle = e.target.closest('[data-action="toggle-review"]');
    if (reviewToggle) {
      e.stopPropagation();
      toggleReview(reviewToggle);
      return;
    }
    // 打开编辑弹窗
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

// Export/Import
function exportJSON() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'music-ratings.json';
  a.click();
  URL.revokeObjectURL(url);
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

// Start
init();
