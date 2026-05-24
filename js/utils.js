function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function refreshAll() {
  buildEntryIndex();
  renderSidebar();
  renderContent();
  saveData();
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

let selectedSectionValue = '';

function populateSectionSelector(selectedEntryId) {
  const menu = document.getElementById('editSectionMenu');
  const trigger = document.getElementById('editSectionTrigger');
  menu.innerHTML = '';
  let currentValue = '';
  for (const section of getMergedSections()) {
    for (const group of section.groups) {
      if (group.name === 'AOTY') continue;
      const val = JSON.stringify({ sectionId: section.id, groupName: group.name });
      const label = getSectionDisplayName(section) + ' → ' + group.name;
      const opt = document.createElement('div');
      opt.className = 'custom-select-option';
      opt.dataset.value = val;
      opt.textContent = label;
      menu.appendChild(opt);
      if (selectedEntryId && group.entries.some(e => e.id === selectedEntryId)) {
        currentValue = val;
      }
    }
  }
  selectedSectionValue = currentValue;
  if (currentValue) {
    const activeOpt = [...menu.querySelectorAll('.custom-select-option')].find(o => o.dataset.value === currentValue);
    trigger.textContent = activeOpt ? activeOpt.textContent : t('modal.placeholder.select');
  } else {
    trigger.textContent = t('modal.placeholder.select');
  }
  menu.querySelectorAll('.custom-select-option').forEach(o => {
    o.classList.toggle('active', o.dataset.value === currentValue);
  });
}
