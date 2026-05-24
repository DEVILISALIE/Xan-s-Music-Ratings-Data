// Data persistence
function saveData() {
  try {
    localStorage.setItem('musicData', JSON.stringify(appData));
  } catch (e) {
    console.error('Failed to save data:', e);
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
  });

  let searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      applyFilters();
    }, 200);
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
      appData = parsed;
      ensureDefaultGroups();
      refreshAll();
    } catch (err) {