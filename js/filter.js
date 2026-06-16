// Filter and search logic
let searchResults = [];
let searchIndex = -1;
let allCards = []; // 缓存所有卡片元素及其对应 entry，避免每次 applyFilters 全量查询 DOM

function rebuildCardCache() {
  allCards = [];
  document.querySelectorAll('.album-card, .aoty-card').forEach(card => {
    allCards.push({ card, entry: findEntry(card.dataset.entryId) });
  });
}

function matchesFilter(entry) {
  // Type filter (multi-select)
  if (currentFilter.length > 0) {
    if (!entry.tags || !entry.tags.some(t => currentFilter.some(f => f.toLowerCase() === t.toLowerCase()))) return false;
  }

  // Score filter
  if (currentScoreFilter !== 'all') {
    if (currentScoreFilter === 'aoty') {
      if (!entry.isAoty && !entry.isSoty) return false;
    } else {
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
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const title = (entry.title || '').toLowerCase();
    const artist = (entry.artist || '').toLowerCase();
    const scoreNote = (entry.scoreNote || '').toLowerCase();
    const notes = (entry.notes || '').toLowerCase();
    const review = (entry.review || '').toLowerCase();
    if (!title.includes(q) && !artist.includes(q) && !scoreNote.includes(q) && !notes.includes(q) && !review.includes(q)) return false;
  }

  return true;
}

function applyFilters() {
  searchResults = [];
  const counter = document.getElementById('searchCounter');
  for (const { card, entry } of allCards) {
    if (entry && matchesFilter(entry)) {
      card.classList.remove('hidden');
      searchResults.push(card);
    } else {
      card.classList.add('hidden');
    }
  }

  // 搜索时显示"下一个"按钮并定位到第一个结果
  const nextBtn = document.getElementById('searchNextBtn');
  const prevBtn = document.getElementById('searchPrevBtn');
  if (searchQuery && searchResults.length > 0) {
    nextBtn.style.display = 'flex';
    prevBtn.style.display = 'flex';
    searchIndex = 0;
    highlightSearchResult(0);
    searchResults[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    var grp = searchResults[0].dataset.group;
    if (grp) activateNavItem(grp);
    if (counter) counter.textContent = '1/' + searchResults.length;
  } else {
    nextBtn.style.display = 'none';
    prevBtn.style.display = 'none';
    clearSearchHighlight();
    searchIndex = -1;
    if (counter) counter.textContent = searchQuery ? '0' : '';
  }
  updateToolbarStats();
}

// 跳转到下一个搜索结果（循环）
function goToNextResult() {
  if (searchResults.length === 0) return;
  searchIndex = (searchIndex + 1) % searchResults.length;
  highlightSearchResult(searchIndex);
  searchResults[searchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  var grp = searchResults[searchIndex].dataset.group;
  if (grp) activateNavItem(grp);
  var counter = document.getElementById('searchCounter');
  if (counter) counter.textContent = (searchIndex + 1) + '/' + searchResults.length;
}

function goToPrevResult() {
  if (searchResults.length === 0) return;
  searchIndex = (searchIndex - 1 + searchResults.length) % searchResults.length;
  highlightSearchResult(searchIndex);
  searchResults[searchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  var grp = searchResults[searchIndex].dataset.group;
  if (grp) activateNavItem(grp);
  var counter = document.getElementById('searchCounter');
  if (counter) counter.textContent = (searchIndex + 1) + '/' + searchResults.length;
}

function highlightSearchResult(index) {
  clearSearchHighlight();
  if (searchResults[index]) {
    searchResults[index].classList.add('search-focus');
  }
}

function clearSearchHighlight() {
  document.querySelectorAll('.search-focus').forEach(el => el.classList.remove('search-focus'));
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

