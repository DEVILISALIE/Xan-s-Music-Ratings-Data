// Filter and search logic
function matchesFilter(entry) {
  // Type filter
  if (currentFilter !== 'all') {
    if (!entry.tags || !entry.tags.some(t => t.toLowerCase() === currentFilter.toLowerCase())) return false;
  }

  // Score filter
  if (currentScoreFilter !== 'all') {
    const score = entry.score;
    if (currentScoreFilter === 'nr') {
      if (score != null) return false;
    } else {
      const min = parseInt(currentScoreFilter);
      if (score == null) return false;
      if (currentScoreFilter === 'low') {
        if (score >= 50) return false;
      } else {
        if (score < min) return false;
      }
    }
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const title = (entry.title || '').toLowerCase();
    const artist = (entry.artist || '').toLowerCase();
    if (!title.includes(q) && !artist.includes(q)) return false;
  }

  return true;
}

function applyFilters() {
  let visibleCount = 0;
  let totalCount = 0;
  document.querySelectorAll('.album-card, .aoty-card').forEach(card => {
    const id = card.dataset.entryId;
    const sectionId = card.dataset.section;
    const groupId = card.dataset.group;
    const entry = findEntry(id);
    totalCount++;
    if (entry && matchesFilter(entry)) {
      card.classList.remove('hidden');
      visibleCount++;
    } else {
      card.classList.add('hidden');
    }
  });
  updateCount(visibleCount, totalCount);
}

function buildEntryIndex() {
  entryIndex.clear();
  for (const section of appData.sections) {
    for (const group of section.groups) {
      for (const entry of group.entries) {
        entryIndex.set(entry.id, entry);
      }
    }
  }
}

function findEntry(id) {
  return entryIndex.get(id) || null;
}

function updateCount(visible, total) {
  const el = document.getElementById('resultCount');
  if (visible === total) {
    el.textContent = t('toolbar.count', { total });
  } else {
    el.textContent = t('toolbar.countFiltered', { visible, total });
  }
}

function setupFilterListeners() {
  // 事件委托：只绑定一次，通过冒泡处理子元素点击
  const pillsContainer = document.getElementById('filterPills');
  if (pillsContainer._delegateBound) return;
  pillsContainer._delegateBound = true;
  pillsContainer.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    pillsContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    applyFilters();
  });
}
