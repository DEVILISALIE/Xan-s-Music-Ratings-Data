function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function updateToolbarStats() {
  let albumCount = 0;
  let singleCount = 0;
  for (const { card } of allCards) {
    const group = card.dataset.group || '';
    if (group.includes('singles')) singleCount++;
    else albumCount++;
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
  for (const section of appData.sections) {
    if (!section.groups.some(g => g.name === 'Albums')) {
      section.groups.push({ name: 'Albums', entries: [] });
    }
    if (!section.groups.some(g => g.name === 'Singles')) {
      section.groups.push({ name: 'Singles', entries: [] });
    }
  }
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
