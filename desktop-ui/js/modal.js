// Modal logic

function showToast(message) {
  let toast = document.getElementById('copyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copyToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove('show');
  requestAnimationFrame(() => {
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 1500);
  });
}

let currentModalCover = null;

function openEditModal(entryId, sectionId, groupId) {
  const entry = findEntry(entryId);
  if (!entry) return;

  editingEntry = entry;
  editingGroupId = groupId;
  currentModalCover = entry.cover || null;

  document.getElementById('modalTitle').textContent = t('modal.editTitle');
  document.getElementById('editId').value = entry.id;
  document.getElementById('editSectionId').value = sectionId;
  document.getElementById('editTitle').value = entry.title || '';
  document.getElementById('editArtist').value = entry.artist || '';
  document.getElementById('editScore').value = entry.score != null ? entry.score : '';
  document.getElementById('editDate').value = entry.date || '';
  document.getElementById('editScoreNote').value = entry.scoreNote || '';
  document.getElementById('editReview').value = entry.review || '';
  document.getElementById('editSectionGroup').style.display = 'block';
  document.getElementById('deleteBtn').style.display = 'inline-block';
  document.getElementById('editAotyToggle').checked = !!entry.isAoty;
  document.getElementById('editSotyToggle').checked = !!entry.isSoty;

  // Section selector — 定位条目所在的原始 section/group
  populateSectionSelector(entry.id);
  updateAotyLabel();
  syncTagsGroupVisibility(false);

  const activeTags = entry.tags || [];
  document.querySelectorAll('#editTags .form-tag').forEach(tag => {
    tag.classList.toggle('active', activeTags.includes(tag.dataset.tag));
  });

  editingTracks = (entry.tracks || []).map(t => ({ ...t, disc: t.disc || 1 }));
  renderTracks();

  // 封面
  loadCoverPreview(entry.cover, entry.id);

  document.getElementById('editModal').classList.add('active');
  const modalBody = document.getElementById('editModalBody');
  const modalCard = document.querySelector('#editModal .modal');
  if (modalBody && modalCard) attachMacScrollbar(modalBody, { parent: modalCard, id: 'editModalScrollTrack' });
}

function openAddModal() {
  editingEntry = null;
  editingGroupId = null;
  currentModalCover = null;

  const newId = generateId();
  document.getElementById('modalTitle').textContent = t('modal.addTitle');
  document.getElementById('editId').value = newId;
  document.getElementById('editSectionId').value = '';
  document.getElementById('editTitle').value = '';
  document.getElementById('editArtist').value = '';
  document.getElementById('editScore').value = '';
  document.getElementById('editDate').value = '';
  document.getElementById('editScoreNote').value = '';
  document.getElementById('editReview').value = '';
  document.getElementById('editAotyToggle').checked = false;
  document.getElementById('editSotyToggle').checked = false;
  document.getElementById('deleteBtn').style.display = 'none';
  editingTracks = [];
  renderTracks();

  // Section selector
  populateSectionSelector();
  updateAotyLabel();
  syncTagsGroupVisibility(false);
  document.getElementById('editSectionGroup').style.display = 'block';

  document.querySelectorAll('#editTags .form-tag').forEach(t => t.classList.remove('active'));

  clearCoverPreview();
  document.getElementById('editModal').classList.add('active');
  const modalBody = document.getElementById('editModalBody');
  const modalCard = document.querySelector('#editModal .modal');
  if (modalBody && modalCard) attachMacScrollbar(modalBody, { parent: modalCard, id: 'editModalScrollTrack' });
}

function closeModal() {
  document.getElementById('editModal').classList.remove('active');
  releaseCoverPreview();
  currentModalCover = null;
  document.getElementById('editSectionSelect').classList.remove('open');
  const sectionMenu = document.getElementById('editSectionMenu');
  const coverDd = document.getElementById('coverRemoveDropdown');
  if (typeof portalClose === 'function') {
    portalClose(sectionMenu);
    portalClose(coverDd, { openClass: 'active' });
  } else {
    if (coverDd) coverDd.classList.remove('active');
  }
  editingEntry = null;
}

function renderTracks() {
  const container = document.getElementById('trackList');
  // 按 disc 分组
  const discMap = new Map();
  for (let i = 0; i < editingTracks.length; i++) {
    const disc = editingTracks[i].disc || 1;
    if (!discMap.has(disc)) discMap.set(disc, []);
    discMap.get(disc).push(i);
  }
  const discs = [...discMap.keys()].sort((a, b) => a - b);
  const multiDisc = discs.length > 1;

  let html = '';
  for (const disc of discs) {
    const indices = discMap.get(disc);
    if (multiDisc) {
      html += `<div class="track-disc-header">Disc ${disc}</div>`;
    }
    let discNum = 0;
    for (const i of indices) {
      discNum++;
      const tr = editingTracks[i];
      html += `<div class="track-row" data-track-index="${i}">
        <span class="track-num">${discNum}</span>
        <div class="track-name">
          <input class="form-input track-name-input" placeholder="${t('modal.placeholder.track')}" value="${escapeHtml(tr.name)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true">
        </div>
        <div class="track-score">
          <input class="form-input track-score-input" type="text" placeholder="—" value="${tr.score != null ? tr.score : ''}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true">
        </div>
        <button type="button" class="track-remove" data-action="remove-track" data-track-index="${i}">×</button>
      </div>`;
    }
    // 每个 disc 底部添加曲目按钮
    html += `<div class="track-disc-actions">`;
    html += `<button type="button" class="track-add-inline" data-action="add-track-to-disc" data-disc="${disc}">+ ${t('modal.addTrack').replace('+ ', '')}</button>`;
    html += `<button type="button" class="track-add-inline track-batch-add" data-action="batch-add-to-disc" data-disc="${disc}">${t('modal.batchAddTracks')}</button>`;
    html += `</div>`;
  }
  container.innerHTML = html;
  updateTrackSummary();
}

function addTrack() {
  const lastDisc = editingTracks.length > 0 ? (editingTracks[editingTracks.length - 1].disc || 1) : 1;
  editingTracks.push({ name: '', score: null, disc: lastDisc });
  renderTracks();
  const rows = document.querySelectorAll('#trackList .track-row');
  if (rows.length) rows[rows.length - 1].querySelector('input').focus();
}

async function batchAddTracks(disc) {
  const count = await showPrompt(t('modal.batchAddTracks'), t('modal.batchAddPrompt'), '', t('modal.batchAddPlaceholder'));
  if (!count) return;
  const num = parseInt(count);
  if (isNaN(num) || num <= 0 || num > 999) return;

  const targetDisc = disc || (editingTracks.length > 0 ? (editingTracks[editingTracks.length - 1].disc || 1) : 1);

  // 收集该 disc 的现有曲目
  const existing = editingTracks.filter(t => (t.disc || 1) === targetDisc);
  if (existing.length === num) { renderTracks(); return; } // 数量相同，不做任何事

  if (existing.length > num) {
    // 减少：从该 disc 末尾删除多余的
    let removeCount = existing.length - num;
    for (let i = editingTracks.length - 1; i >= 0 && removeCount > 0; i--) {
      if ((editingTracks[i].disc || 1) === targetDisc) {
        editingTracks.splice(i, 1);
        removeCount--;
      }
    }
  } else {
    // 增加：在最后一个该 disc 曲目后追加空白曲目
    let insertIdx = editingTracks.length;
    for (let i = editingTracks.length - 1; i >= 0; i--) {
      if ((editingTracks[i].disc || 1) === targetDisc) {
        insertIdx = i + 1;
        break;
      }
    }
    for (let n = 0; n < num - existing.length; n++) {
      editingTracks.splice(insertIdx + n, 0, { name: '', score: null, disc: targetDisc });
    }
  }

  renderTracks();

  // 聚焦到该 disc 第一个空白曲目（新增的）
  const rows = document.querySelectorAll('#trackList .track-row');
  for (const row of rows) {
    const idx = parseInt(row.dataset.trackIndex);
    if (idx >= 0 && editingTracks[idx] && (editingTracks[idx].disc || 1) === targetDisc) {
      if (!editingTracks[idx].name && editingTracks[idx].score == null) {
        row.querySelector('input').focus();
        break;
      }
    }
  }
}

function addTrackToDisc(disc) {
  // 在该 disc 的最后一个曲目后插入
  let insertIdx = editingTracks.length;
  for (let i = editingTracks.length - 1; i >= 0; i--) {
    if ((editingTracks[i].disc || 1) === disc) {
      insertIdx = i + 1;
      break;
    }
  }
  editingTracks.splice(insertIdx, 0, { name: '', score: null, disc: disc });
  renderTracks();
  const rows = document.querySelectorAll('#trackList .track-row');
  for (const row of rows) {
    if (parseInt(row.dataset.trackIndex) === insertIdx) {
      row.querySelector('input').focus();
      break;
    }
  }
}

function addDisc() {
  const maxDisc = editingTracks.reduce((max, t) => Math.max(max, t.disc || 1), 0);
  editingTracks.push({ name: '', score: null, disc: maxDisc + 1 });
  renderTracks();
  const rows = document.querySelectorAll('#trackList .track-row');
  if (rows.length) rows[rows.length - 1].querySelector('input').focus();
}

function removeTrack(i) {
  editingTracks.splice(i, 1);
  renderTracks();
}

function updateTrackSummary() {
  const el = document.getElementById('trackSummary');
  const len = editingTracks.length;
  const rated = editingTracks.filter(t => t.score != null && t.score !== 'NR').length;
  if (len === 0) { el.textContent = ''; return; }
  const avg = rated > 0 ? (editingTracks.reduce((s, t) => s + (typeof t.score === 'number' ? t.score : 0), 0) / rated).toFixed(1) : '—';
  const overallText = t('modal.trackSummary', { count: len, plural: len > 1 ? 's' : '', rated, avg });

  const discMap = new Map();
  for (const tr of editingTracks) {
    const disc = tr.disc || 1;
    if (!discMap.has(disc)) discMap.set(disc, []);
    discMap.get(disc).push(tr);
  }
  const discs = [...discMap.keys()].sort((a, b) => a - b);

  if (discs.length > 1) {
    const discLines = discs.map(disc => {
      const tracks = discMap.get(disc);
      const discRated = tracks.filter(t => t.score != null && t.score !== 'NR').length;
      const discAvg = discRated > 0 ? (tracks.reduce((s, t) => s + (typeof t.score === 'number' ? t.score : 0), 0) / discRated).toFixed(1) : '—';
      return t('modal.discAvg', { disc, avg: discAvg });
    });
    el.innerHTML = escapeHtml(overallText) + '<br>' + discLines.map(l => escapeHtml(l)).join(' · ');
  } else {
    el.textContent = overallText;
  }
}

async function saveEntry() {
  debugAotyCount('saveEntry 开始');

  // 主动失焦当前处于编辑态的输入框，确保原生 number/text input 与 DOM 数据立即同步
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  const title = document.getElementById('editTitle').value.trim();
  if (!title) return;

  if (!selectedSectionValue) {
    showAlert(t('modal.validation.selectSection'));
    return;
  }

  let sel;
  try { sel = JSON.parse(selectedSectionValue); } catch (_) { closeModal(); return; }

  const scoreVal = document.getElementById('editScore').value.trim();
  let score = scoreVal !== '' ? parseInt(scoreVal, 10) : null;
  if (score !== null && !isNaN(score)) {
    score = Math.max(0, Math.min(100, score));
  } else {
    score = null;
  }
  const tags = [];
  if (sel.groupName !== 'Singles') {
    document.querySelectorAll('#editTags .form-tag.active').forEach(t => tags.push(t.dataset.tag));
  }

  // 同步曲目输入框当前最新数据，防止未触发 change 时数据落后
  document.querySelectorAll('#trackList .track-row').forEach(row => {
    const idx = parseInt(row.dataset.trackIndex);
    if (isNaN(idx) || !editingTracks[idx]) return;
    const nameInput = row.querySelector('.track-name-input');
    const scoreInput = row.querySelector('.track-score-input');
    if (nameInput) editingTracks[idx].name = nameInput.value;
    if (scoreInput) {
      const v = scoreInput.value.trim();
      if (v === 'NR') editingTracks[idx].score = 'NR';
      else if (v === '') editingTracks[idx].score = null;
      else {
        const n = parseInt(v, 10);
        editingTracks[idx].score = (!isNaN(n) && n >= 0 && n <= 100) ? n : null;
      }
    }
  });

  const data = {
    id: document.getElementById('editId').value || generateId(),
    title: title,
    artist: document.getElementById('editArtist').value.trim(),
    score: score,
    scoreNote: document.getElementById('editScoreNote').value.trim(),
    date: document.getElementById('editDate').value.trim(),
    tags: tags,
    cover: currentModalCover !== null ? currentModalCover : (editingEntry ? editingEntry.cover || null : null),
    review: document.getElementById('editReview').value,
    isAoty: document.getElementById('editAotyToggle').checked,
    isSoty: document.getElementById('editSotyToggle').checked,
    notes: editingEntry ? editingEntry.notes || '' : '',
    tracks: [...editingTracks]
  };

  let didMove = false;
  if (editingEntry) {
    // Update existing
    Object.assign(editingEntry, data);

    // 检查是否需要移动到其他年份/分组
    const targetGroupName = sel.groupName;
    const mergedId = sel.sectionId;
    const targetSection = findOrCreateSection(mergedId);
    console.log('[Move] 目标:', mergedId, targetGroupName, '当前条目AOTY:', editingEntry.isAoty);

    // 找到 entry 当前所在的原始 section/group，判断是否需要移动
    let found = false;
    for (const section of appData.sections) {
      if (found) break;
      for (const group of section.groups) {
        if (group.entries.some(e => e.id === editingEntry.id)) {
          if (!(section === targetSection && group.name === targetGroupName)) {
            console.log('[Move] 从', section.id, group.name, '移动到', mergedId, targetGroupName);
            // 从旧 group 移除
            const idx = group.entries.indexOf(editingEntry);
            if (idx !== -1) group.entries.splice(idx, 1);
            // 添加到目标 group
            let targetGroup = targetSection.groups.find(g => g.name === targetGroupName);
            if (!targetGroup) {
              targetGroup = { name: targetGroupName, entries: [] };
              targetSection.groups.push(targetGroup);
            }
            targetGroup.entries.push(editingEntry);
            // 切换年份分区后立即按目标分区规则自动排序
            sortGroupEntries(targetGroup, targetSection.id);
            console.log('[Move] 移动后目标组条目数:', targetGroup.entries.length);
            didMove = true;
          }
          found = true;
          break;
        }
      }
    }
    if (!found) {
      console.warn('[Move] 警告：找不到条目', editingEntry.id, '所在的 section/group！');
    }
  } else {
    // Add new
    const section = findOrCreateSection(sel.sectionId);
    let group = section.groups.find(g => g.name === sel.groupName);
    if (!group) {
      group = { name: sel.groupName, entries: [] };
      section.groups.push(group);
    }
    group.entries.push(data);
    sortGroupEntries(group, section.id);
  }

  debugAotyCount('saveEntry 后');
  if (didMove) {
    // 跨组移动需要全量重建
    await refreshAll();
  } else if (editingEntry) {
    // 编辑已有条目：只更新单张卡片
    buildEntryIndex();
    const secYear = parseInt(sel.sectionId);
    const needsReorder = !isNaN(secYear) && (secYear >= 2025 || (secYear >= 1990 && secYear <= 2024) || secYear <= 1989);
    // AOTY/SOTY 状态变化时需要重建卡片类型
    const aotyChanged = editingEntry.isAoty !== (document.querySelector('[data-entry-id="' + editingEntry.id + '"]')?.classList.contains('aoty-card'));
    if (needsReorder || aotyChanged) {
      reorderGroupCards(editingEntry, sel);
    } else {
      updateCardInPlace(editingEntry.id);
    }
    renderSidebar();
    updateGlobalStatsSidebar();
    await saveData();
  } else {
    // 新建条目
    buildEntryIndex();
    const secYear = parseInt(sel.sectionId);
    if (!isNaN(secYear) && (secYear >= 2025 || (secYear >= 1990 && secYear <= 2024) || secYear <= 1989)) {
      // 所有年份：走 reorderGroupCards 重新排序并插入到正确位置
      reorderGroupCards(data, sel);
    } else {
      insertNewCardInSection(data, sel);
    }
    renderSidebar();
    updateGlobalStatsSidebar();
    await saveData();
  }
  debugAotyCount('refreshAll 后');
  closeModal();
}

async function deleteEntry() {
  if (!editingEntry) return;
  const confirmed = await showConfirm(t('dialog.deleteEntry'), t('dialog.deleteEntryMsg'));
  if (!confirmed) return;

  const deletedId = editingEntry.id;
  if (window.__TAURI__ && deletedId) {
    try {
      await window.__TAURI__.core.invoke('remove_cover', { entryId: deletedId });
    } catch (_) {}
  }

  debugAotyCount('deleteEntry 开始');
  console.log('[Delete] 删除:', editingEntry.title, 'isAoty:', editingEntry.isAoty, 'id:', editingEntry.id);

  for (const section of appData.sections) {
    for (const group of section.groups) {
      const idx = group.entries.findIndex(e => e.id === editingEntry.id);
      if (idx !== -1) {
        group.entries.splice(idx, 1);
        debugAotyCount('deleteEntry 移除后');
        await refreshAll();
        closeModal();
        return;
      }
    }
  }
  console.warn('[Delete] 警告：找不到条目', editingEntry.id);
}

function updateAotyLabel() {
  try {
    const sel = JSON.parse(selectedSectionValue);
    const isSingles = sel.groupName === 'Singles';
    document.getElementById('editAotyToggle').closest('.form-group').style.display = isSingles ? 'none' : '';
    document.getElementById('sotyGroup').style.display = isSingles ? '' : 'none';
    // 编辑弹窗中 SOTY 标签改为 Single of the Year
    const sotyLabel = document.getElementById('sotyGroup').querySelector('.form-label');
    if (sotyLabel) sotyLabel.textContent = currentLang === 'zh' ? '年度单曲' : 'Single of the Year';
  } catch (_) {}
}

function syncTagsGroupVisibility(animate = false) {
  const group = document.getElementById('editTagsGroup');
  if (!group) return;

  let isSingles = false;
  try {
    if (selectedSectionValue) {
      const sel = JSON.parse(selectedSectionValue);
      isSingles = (sel.groupName === 'Singles');
    }
  } catch (_) {}

  if (!animate) {
    group.classList.add('no-transition');
    group.classList.toggle('collapsed', isSingles);
    // 强制回流应用当前几何状态，杜绝任何开窗时的初次动画闪烁
    void group.offsetHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        group.classList.remove('no-transition');
      });
    });
  } else {
    group.classList.remove('no-transition');
    group.classList.toggle('collapsed', isSingles);
  }
}

// ===== 复制粘贴 =====

function copyEntry(entry, sectionId, groupName) {
  if (!sectionId || !groupName) {
    for (const sec of (appData?.sections || [])) {
      for (const grp of sec.groups) {
        if (grp.entries.some(e => e.id === entry.id)) {
          sectionId = sec.id;
          groupName = grp.name;
          break;
        }
      }
      if (sectionId) break;
    }
  }

  const isUrlCover = entry.cover && /^https?:\/\//i.test(entry.cover);

  clipboardEntry = {
    title: entry.title || '',
    artist: entry.artist || '',
    score: entry.score != null ? entry.score : null,
    date: entry.date || '',
    scoreNote: entry.scoreNote || '',
    tags: entry.tags ? [...entry.tags] : [],
    review: entry.review || '',
    isAoty: !!entry.isAoty,
    isSoty: !!entry.isSoty,
    cover: isUrlCover ? entry.cover : null,
    tracks: (entry.tracks || []).map(t => ({ ...t, disc: t.disc || 1 })),
    notes: entry.notes || '',
    sectionId: sectionId || '',
    groupName: groupName || (entry.isSoty ? 'Singles' : 'Albums')
  };
  showToast(currentLang === 'zh' ? (entry.title || '已复制') : (entry.title || 'Copied'));
}

function pasteEntry() {
  if (!clipboardEntry) {
    showAlert(currentLang === 'zh' ? '剪贴板为空，请先复制一张卡片' : 'Clipboard is empty. Copy a card first.');
    return;
  }
  const c = clipboardEntry;
  document.getElementById('editTitle').value = c.title;
  document.getElementById('editArtist').value = c.artist;
  document.getElementById('editScore').value = c.score != null ? c.score : '';
  document.getElementById('editDate').value = c.date;
  document.getElementById('editScoreNote').value = c.scoreNote;
  document.getElementById('editReview').value = c.review;

  document.querySelectorAll('#editTags .form-tag').forEach(tag => {
    tag.classList.toggle('active', c.tags.includes(tag.dataset.tag));
  });

  document.getElementById('editAotyToggle').checked = !!c.isAoty;
  document.getElementById('editSotyToggle').checked = !!c.isSoty;

  // 恢复复制时的 URL 封面
  if (c.cover && /^https?:\/\//i.test(c.cover)) {
    currentModalCover = c.cover;
    const currentEntryId = document.getElementById('editId').value || generateId();
    loadCoverPreview(c.cover, currentEntryId);
  }

  // 恢复复制时的年份分区
  if (c.sectionId && c.groupName) {
    const val = JSON.stringify({ sectionId: c.sectionId, groupName: c.groupName });
    selectedSectionValue = val;
    const menu = document.getElementById('editSectionMenu');
    const trigger = document.getElementById('editSectionTrigger');
    if (menu && trigger) {
      const activeOpt = [...menu.querySelectorAll('.custom-select-option')].find(o => o.dataset.value === val);
      if (activeOpt) {
        trigger.textContent = activeOpt.textContent;
        menu.querySelectorAll('.custom-select-option').forEach(o => o.classList.toggle('active', o.dataset.value === val));
      }
    }
  }

  editingTracks = c.tracks.map(t => ({ ...t }));
  renderTracks();

  updateAotyLabel();
  syncTagsGroupVisibility(false);
}

// ===== 封面管理 =====

let coverPreviewRequestId = 0;

function loadCoverPreview(cover, entryId) {
  const wrap = document.getElementById('coverPreviewWrap');
  const img = document.getElementById('coverPreview');
  const removeWrap = document.getElementById('coverRemoveWrap');
  const viewBtn = document.getElementById('coverViewBtn');
  const requestId = ++coverPreviewRequestId;

  if (!cover) {
    wrap.style.display = 'none';
    img.src = '';
    removeWrap.style.display = 'none';
    if (viewBtn) viewBtn.style.display = 'none';
    return;
  }

  if (/^https?:\/\//i.test(cover)) {
    img.src = cover;
    wrap.style.display = '';
    removeWrap.style.display = '';
    if (viewBtn) viewBtn.style.display = '';
  } else if (window.__TAURI__) {
    // 若已有列表缩略图缓存，先瞬间作为底图呈现，杜绝白屏与跳动
    const thumbCached = (typeof coverThumbnailCache !== 'undefined') ? coverThumbnailCache.get(entryId) : null;
    if (thumbCached) {
      img.src = thumbCached;
      wrap.style.display = '';
      removeWrap.style.display = '';
      if (viewBtn) viewBtn.style.display = '';
    } else {
      img.src = '';
      wrap.style.display = 'none';
      removeWrap.style.display = 'none';
      if (viewBtn) viewBtn.style.display = 'none';
    }

    // 关键优化：编辑详情页加载高清原画，呈现最细腻清晰的封面细节
    window.__TAURI__.core.invoke('read_cover', { entryId: entryId }).catch(() => {
      // 容错兜底：若原图损坏则回退至缩略图
      return window.__TAURI__.core.invoke('read_cover_thumbnail', { entryId: entryId });
    }).then(dataUrl => {
      if (requestId === coverPreviewRequestId && (editingEntry?.id === entryId || document.getElementById('editId').value === entryId)) {
        img.src = dataUrl;
        wrap.style.display = '';
        removeWrap.style.display = '';
        if (viewBtn) viewBtn.style.display = '';
      }
    }).catch(() => {
      if (requestId === coverPreviewRequestId) {
        img.src = '';
        wrap.style.display = 'none';
        removeWrap.style.display = 'none';
        if (viewBtn) viewBtn.style.display = 'none';
      }
    });
  }
}

function releaseCoverPreview() {
  coverPreviewRequestId++;
  document.getElementById('coverPreviewWrap').style.display = 'none';
  const viewBtn = document.getElementById('coverViewBtn');
  if (viewBtn) viewBtn.style.display = 'none';
  const img = document.getElementById('coverPreview');
  img.onload = null;
  img.src = '';
  const viewerImg = document.getElementById('coverViewerImg');
  if (viewerImg) viewerImg.src = '';
}

function clearCoverPreview() {
  releaseCoverPreview();
  document.getElementById('coverRemoveWrap').style.display = 'none';
  document.getElementById('coverRemoveDropdown').classList.remove('active');
  const viewBtn = document.getElementById('coverViewBtn');
  if (viewBtn) viewBtn.style.display = 'none';
}

function setupCoverEvents() {
  const section = document.getElementById('coverSection');
  if (!section) return;

  // 查看大图
  section.querySelector('[data-action="cover-view"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCoverViewer();
  });

  // 本地上传
  const uploadBtn = section.querySelector('[data-action="cover-upload"]');
  uploadBtn?.addEventListener('click', async () => {
    let entryId = document.getElementById('editId').value;
    if (!entryId) {
      entryId = generateId();
      document.getElementById('editId').value = entryId;
    }
    if (window.__TAURI__ && window.__TAURI_PLUGIN_DIALOG__) {
      try {
        const { open } = window.__TAURI_PLUGIN_DIALOG__;
        const selected = await open({
          multiple: false,
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] }]
        });
        if (!selected) return;

        // 加载保护状态，防止快速重复连击造成并发 IO 冲突
        const originalText = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = t('modal.coverUploading');

        try {
          const filename = await window.__TAURI__.core.invoke('upload_cover', {
            entryId: entryId,
            sourcePath: selected
          });
          currentModalCover = filename;
          if (editingEntry) editingEntry.cover = filename;
          invalidateCoverThumbnail(entryId);
          loadCoverPreview(filename, entryId);
        } catch (uploadErr) {
          console.error('封面上传失败:', uploadErr);
          showAlert(t('modal.coverUploadFailed') + '\n(' + (uploadErr?.message || uploadErr || 'Unknown error') + ')');
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.textContent = originalText;
        }
      } catch (err) {
        console.error('打开文件对话框失败:', err);
      }
    } else {
      // 纯网页环境 fallback：通过隐藏的 file input 导入
      let input = document.getElementById('browserCoverFileInput');
      if (!input) {
        input = document.createElement('input');
        input.id = 'browserCoverFileInput';
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif';
        input.style.display = 'none';
        document.body.appendChild(input);
      }
      input.value = '';
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const dataUrl = evt.target.result;
          currentModalCover = dataUrl;
          if (editingEntry) editingEntry.cover = dataUrl;
          invalidateCoverThumbnail(entryId);
          loadCoverPreview(dataUrl, entryId);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  });

  // URL 输入
  section.querySelector('[data-action="cover-url"]').addEventListener('click', async () => {
    let entryId = document.getElementById('editId').value;
    if (!entryId) {
      entryId = generateId();
      document.getElementById('editId').value = entryId;
    }
    // 若当前已有 URL 封面，默认写入当前 URL 方便查看或复制
    let currentUrl = '';
    if (currentModalCover && /^https?:\/\//i.test(currentModalCover)) {
      currentUrl = currentModalCover;
    } else if (editingEntry && editingEntry.cover && /^https?:\/\//i.test(editingEntry.cover)) {
      currentUrl = editingEntry.cover;
    }
    const url = await showPrompt(t('modal.coverUrl'), '', currentUrl, 'https://...');
    if (url === null) return; // 用户取消
    if (!url.trim()) {
      // 用户清空并确认，则移除 URL 封面
      currentModalCover = null;
      if (editingEntry) editingEntry.cover = null;
      invalidateCoverThumbnail(entryId);
      loadCoverPreview(null, entryId);
      return;
    }
    let cleanUrl = url.trim();
    // 无论是直接粘贴纯域名图片链接还是带 http/https，均可正确识别
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    currentModalCover = cleanUrl;
    if (editingEntry) editingEntry.cover = cleanUrl;
    invalidateCoverThumbnail(entryId);
    loadCoverPreview(cleanUrl, entryId);
  });

  // 移除 — 显示确认 dropdown
  section.querySelector('[data-action="cover-remove"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('coverRemoveDropdown');
    const btn = e.currentTarget;
    const wasOpen = dropdown.classList.contains('active') || dropdown.classList.contains('portal-open');
    if (wasOpen) {
      if (typeof portalClose === 'function') portalClose(dropdown, { openClass: 'active' });
      else dropdown.classList.remove('active');
    } else if (typeof portalOpen === 'function') {
      portalOpen(dropdown, btn, { openClass: 'active', align: 'center', prefer: 'above', gap: 6 });
    } else {
      dropdown.classList.add('active');
    }
  });

  // 确认移除
  section.querySelector('[data-action="cover-remove-confirm"]').addEventListener('click', async () => {
    const entryId = document.getElementById('editId').value;
    if (window.__TAURI__ && entryId) {
      try {
        await window.__TAURI__.core.invoke('remove_cover', { entryId: entryId });
      } catch (_) {}
    }
    currentModalCover = null;
    if (editingEntry) editingEntry.cover = null;
    if (entryId) invalidateCoverThumbnail(entryId);
    clearCoverPreview();
    const dropdown = document.getElementById('coverRemoveDropdown');
    if (typeof portalClose === 'function') portalClose(dropdown, { openClass: 'active' });
    else dropdown.classList.remove('active');
  });

  // 取消移除
  section.querySelector('[data-action="cover-remove-cancel"]').addEventListener('click', () => {
    const dropdown = document.getElementById('coverRemoveDropdown');
    if (typeof portalClose === 'function') portalClose(dropdown, { openClass: 'active' });
    else dropdown.classList.remove('active');
  });

  // 点击外部关闭移除 dropdown
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('coverRemoveDropdown');
    const removeWrap = document.getElementById('coverRemoveWrap');
    if (!dropdown) return;
    const open = dropdown.classList.contains('active') || dropdown.classList.contains('portal-open');
    if (open && !removeWrap?.contains(e.target) && !dropdown.contains(e.target)) {
      if (typeof portalClose === 'function') portalClose(dropdown, { openClass: 'active' });
      else dropdown.classList.remove('active');
    }
  });

  // ===== 封面放大查看器 =====
  const viewer = document.getElementById('coverViewer');
  const viewerImg = document.getElementById('coverViewerImg');
  let viewerScale = 1;
  let panX = 0, panY = 0;
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragStartPanX = 0, dragStartPanY = 0;
  let transformRafId = null;

  function updateViewerTransform() {
    viewerImg.style.transform = 'translate3d(' + panX.toFixed(2) + 'px,' + panY.toFixed(2) + 'px, 0px) scale(' + viewerScale.toFixed(4) + ')';
  }

  function scheduleViewerTransform() {
    if (transformRafId) return;
    transformRafId = requestAnimationFrame(() => {
      transformRafId = null;
      updateViewerTransform();
    });
  }

  function openCoverViewer(customSrc) {
    const src = (typeof customSrc === 'string' && customSrc) ? customSrc : document.getElementById('coverPreview')?.src;
    if (!src) return;
    viewerImg.src = src;
    viewerScale = 1;
    panX = 0;
    panY = 0;
    updateViewerTransform();
    viewer.classList.add('active');

    // 处于桌面版环境且当前为本地图片时，全屏查看器打开后异步提升加载原画（若为自定义图片如 Logo 则不覆盖）
    const entryId = editingEntry?.id || document.getElementById('editId')?.value;
    const coverVal = currentModalCover !== null ? currentModalCover : (editingEntry?.cover || '');
    if (!customSrc && window.__TAURI__ && entryId && coverVal && !/^https?:\/\//i.test(coverVal)) {
      window.__TAURI__.core.invoke('read_cover', { entryId: entryId }).then(originalDataUrl => {
        if (viewer.classList.contains('active') && originalDataUrl) {
          viewerImg.src = originalDataUrl;
        }
      }).catch(err => {
        console.warn('全屏查看器读取原图失败，继续保持缩略图展示:', err);
      });
    }
  }
  window.openCoverViewer = openCoverViewer;

  function closeCoverViewer() {
    if (transformRafId) {
      cancelAnimationFrame(transformRafId);
      transformRafId = null;
    }
    isDragging = false;
    viewer.classList.remove('active', 'is-dragging');
    viewerImg.classList.remove('is-dragging');
    viewerImg.src = '';
  }
  window.closeCoverViewer = closeCoverViewer;

  // 双击封面图 → 打开放大查看器
  document.getElementById('coverPreview').addEventListener('dblclick', openCoverViewer);

  // 点击关闭按钮
  viewer.querySelector('[data-action="cover-viewer-close"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeCoverViewer();
  });

  // 点击遮罩背景关闭（不包括图片）
  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) closeCoverViewer();
  });

  // 禁止原生的拖拽幽灵图像与上下文菜单
  viewerImg.setAttribute('draggable', 'false');
  viewerImg.addEventListener('dragstart', (e) => e.preventDefault());

  // 滚轮缩放（严格以鼠标光标所在像素点为绝对中心进行几何等比缩放）
  viewer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewerImg.getBoundingClientRect();
    const imgCenterX = rect.left + rect.width / 2;
    const imgCenterY = rect.top + rect.height / 2;
    const mouseX = e.clientX - imgCenterX;
    const mouseY = e.clientY - imgCenterY;
    const oldScale = viewerScale;

    // 指数等比缩放因子（每次滚轮滚动保持 22% 恒定比例扩展/缩小，全尺度感知速率完全恒定且灵敏迅捷）
    const zoomFactor = 1.22;
    const factor = e.deltaY < 0 ? zoomFactor : (1 / zoomFactor);
    const newScale = Math.max(0.25, Math.min(8.0, viewerScale * factor));
    if (newScale === oldScale) return;

    const r = newScale / oldScale;
    // 严格以鼠标光标当前点为锚点：平移量只做几何偏差修正，光标所指位置保持绝对不动
    panX -= (r - 1) * mouseX;
    panY -= (r - 1) * mouseY;
    viewerScale = newScale;

    updateViewerTransform();
  }, { passive: false });

  // 鼠标 / Pointer 拖拽平移（使用 PointerCapture + rAF 流畅对齐，杜绝果冻撕裂与拖拽丢失）
  viewerImg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // 仅限左键拖拽
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    viewer.classList.add('is-dragging');
    viewerImg.classList.add('is-dragging');
    viewerImg.style.transition = 'none';
    try { viewerImg.setPointerCapture(e.pointerId); } catch (_) {}
  });

  viewerImg.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    panX = dragStartPanX + (e.clientX - dragStartX);
    panY = dragStartPanY + (e.clientY - dragStartY);
    scheduleViewerTransform();
  });

  const stopDrag = (e) => {
    if (isDragging) {
      isDragging = false;
      viewer.classList.remove('is-dragging');
      viewerImg.classList.remove('is-dragging');
      viewerImg.style.transition = 'none';
      if (e && e.pointerId) {
        try { viewerImg.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    }
  };

  viewerImg.addEventListener('pointerup', stopDrag);
  viewerImg.addEventListener('pointercancel', stopDrag);

  // Escape 关闭放大查看器（捕获阶段拦截，防止关闭下层编辑弹窗）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewer.classList.contains('active')) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      closeCoverViewer();
    }
  }, true);
}
