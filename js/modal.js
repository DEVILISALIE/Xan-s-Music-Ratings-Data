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

function openEditModal(entryId, sectionId, groupId) {
  const entry = findEntry(entryId);
  if (!entry) return;

  editingEntry = entry;
  editingGroupId = groupId;

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

  const activeTags = entry.tags || [];
  document.querySelectorAll('#editTags .form-tag').forEach(tag => {
    tag.classList.toggle('active', activeTags.includes(tag.dataset.tag));
  });

  editingTracks = (entry.tracks || []).map(t => ({ ...t, disc: t.disc || 1 }));
  renderTracks();

  // 封面
  loadCoverPreview(entry.cover, entry.id);

  document.getElementById('editModal').classList.add('active');
}

function openAddModal() {
  editingEntry = null;
  editingGroupId = null;

  document.getElementById('modalTitle').textContent = t('modal.addTitle');
  document.getElementById('editId').value = '';
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
  document.getElementById('editSectionGroup').style.display = 'block';

  document.querySelectorAll('#editTags .form-tag').forEach(t => t.classList.remove('active'));

  clearCoverPreview();
  document.getElementById('editModal').classList.add('active');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('active');
  releaseCoverPreview();
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
          <input class="form-input track-name-input" placeholder="${t('modal.placeholder.track')}" value="${escapeHtml(tr.name)}">
        </div>
        <div class="track-score">
          <input class="form-input track-score-input" type="text" placeholder="—" value="${tr.score != null ? tr.score : ''}">
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
  const title = document.getElementById('editTitle').value.trim();
  if (!title) return;

  if (!selectedSectionValue) {
    showAlert(t('modal.validation.selectSection'));
    return;
  }

  let sel;
  try { sel = JSON.parse(selectedSectionValue); } catch (_) { closeModal(); return; }

  const scoreVal = document.getElementById('editScore').value;
  const score = scoreVal !== '' ? parseInt(scoreVal) : null;
  const tags = [];
  document.querySelectorAll('#editTags .form-tag.active').forEach(t => tags.push(t.dataset.tag));

  const data = {
    id: document.getElementById('editId').value || generateId(),
    title: title,
    artist: document.getElementById('editArtist').value.trim(),
    score: isNaN(score) ? null : score,
    scoreNote: document.getElementById('editScoreNote').value.trim(),
    date: document.getElementById('editDate').value.trim(),
    tags: tags,
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
    // 2025及以后：MM.DD 按日期排序，XXXX 按年份排序（新在前），无日期按标题排序
    // 1990-2024：按标题排序；1980s及以前按年份排序（新在前）
    const year = parseInt(section.id);
    const isFuture = !isNaN(year) && year >= 2025;
    const isOld = !isNaN(year) && year <= 1989;
    const needsSort = isFuture || (!isNaN(year) && year >= 1990 && year <= 2024) || isOld;
    if (needsSort) {
      const special = group.entries.filter(e => e.isAoty || e.isSoty);
      const normal = group.entries.filter(e => !e.isAoty && !e.isSoty);
      normal.sort((a, b) => {
        if (isFuture) {
          const da = a.date || '';
          const db = b.date || '';
          const aHas = !!da, bHas = !!db;
          if (!aHas && !bHas) { /* fall through to title */ }
          else if (!aHas) return 1;
          else if (!bHas) return -1;
          else {
            const aDot = da.includes('.');
            const bDot = db.includes('.');
            if (aDot && !bDot) return -1;
            if (!aDot && bDot) return 1;
            if (aDot && bDot) {
              if (da !== db) return da.localeCompare(db);
            } else {
              if (da !== db) return db.localeCompare(da); // 年份越新越靠前
            }
          }
        }
        if (isOld) {
          const ya = a.date || '9999';
          const yb = b.date || '9999';
          if (ya !== yb) return yb.localeCompare(ya); // 年份越新越靠前
        }
        const ta = (a.title || '');
        const tb = (b.title || '');
        const oa = charPriority(ta.charAt(0));
        const ob = charPriority(tb.charAt(0));
        if (oa !== ob) return oa - ob;
        if (oa === 3) return ta.localeCompare(tb, 'zh-CN');
        return ta.localeCompare(tb, undefined, { numeric: true });
      });
      group.entries = [...special, ...normal];
    }
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

// ===== 复制粘贴 =====

function copyEntry(entry) {
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
    tracks: (entry.tracks || []).map(t => ({ ...t, disc: t.disc || 1 })),
    notes: entry.notes || ''
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

  editingTracks = c.tracks.map(t => ({ ...t }));
  renderTracks();

  updateAotyLabel();
}

// ===== 封面管理 =====

let coverPreviewRequestId = 0;

function loadCoverPreview(cover, entryId) {
  const wrap = document.getElementById('coverPreviewWrap');
  const img = document.getElementById('coverPreview');
  const removeWrap = document.getElementById('coverRemoveWrap');
  const requestId = ++coverPreviewRequestId;
  img.src = '';
  img.style.width = '';
  img.style.height = '';

  // 等比缩放：撑满表单宽度，高度按原图比例
  function fitImage() {
    const modal = document.querySelector('.modal');
    if (!modal) return;
    const containerW = modal.clientWidth - 48; // 减去 modal padding 24*2
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!containerW || !naturalW || !naturalH) return;
    const ratio = naturalH / naturalW;
    img.style.width = containerW + 'px';
    img.style.height = Math.round(containerW * ratio) + 'px';
  }

  img.onload = function() {
    // 弹窗打开动画 0.25s 后再计算，确保 layout 完成
    setTimeout(fitImage, 300);
  };

  if (!cover) {
    wrap.style.display = 'none';
    img.src = '';
    img.style.width = '';
    img.style.height = '';
    removeWrap.style.display = 'none';
    return;
  }

  if (cover.startsWith('http')) {
    img.src = cover;
    wrap.style.display = '';
    removeWrap.style.display = '';
  } else if (window.__TAURI__) {
    wrap.style.display = 'none';
    removeWrap.style.display = 'none';
    window.__TAURI__.core.invoke('read_cover', { entryId: entryId }).then(dataUrl => {
      if (requestId === coverPreviewRequestId && editingEntry?.id === entryId) {
        img.src = dataUrl;
        wrap.style.display = '';
        removeWrap.style.display = '';
      }
    }).catch(() => {
      if (requestId === coverPreviewRequestId) {
        wrap.style.display = 'none';
        removeWrap.style.display = 'none';
      }
    });
  }
}

function releaseCoverPreview() {
  coverPreviewRequestId++;
  document.getElementById('coverPreviewWrap').style.display = 'none';
  const img = document.getElementById('coverPreview');
  img.onload = null;
  img.src = '';
  img.style.width = '';
  img.style.height = '';
  const viewerImg = document.getElementById('coverViewerImg');
  if (viewerImg) viewerImg.src = '';
}

function clearCoverPreview() {
  releaseCoverPreview();
  document.getElementById('coverRemoveWrap').style.display = 'none';
  document.getElementById('coverRemoveDropdown').classList.remove('active');
}

function setupCoverEvents() {
  const section = document.getElementById('coverSection');
  if (!section) return;

  // 本地上传
  section.querySelector('[data-action="cover-upload"]').addEventListener('click', async () => {
    if (!window.__TAURI__ || !editingEntry) return;
    try {
      const { open } = window.__TAURI_PLUGIN_DIALOG__;
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] }]
      });
      if (!selected) return;
      const filename = await window.__TAURI__.core.invoke('upload_cover', {
        entryId: editingEntry.id,
        sourcePath: selected
      });
      editingEntry.cover = filename;
      invalidateCoverThumbnail(editingEntry.id);
      loadCoverPreview(filename, editingEntry.id);
    } catch (err) {
      console.error('封面上传失败:', err);
    }
  });

  // URL 输入
  section.querySelector('[data-action="cover-url"]').addEventListener('click', async () => {
    if (!editingEntry) return;
    const url = await showPrompt(t('modal.coverUrl'), '', '', 'https://...');
    if (!url || !url.trim()) return;
    editingEntry.cover = url.trim();
    invalidateCoverThumbnail(editingEntry.id);
    loadCoverPreview(url.trim(), editingEntry.id);
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
    if (!editingEntry) return;
    if (window.__TAURI__) {
      try {
        await window.__TAURI__.core.invoke('remove_cover', { entryId: editingEntry.id });
      } catch (_) {}
    }
    editingEntry.cover = null;
    invalidateCoverThumbnail(editingEntry.id);
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

  function updateViewerTransform() {
    viewerImg.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + viewerScale + ')';
  }

  function openCoverViewer() {
    const src = document.getElementById('coverPreview').src;
    if (!src) return;
    viewerImg.src = src;
    viewerScale = 1;
    panX = 0;
    panY = 0;
    updateViewerTransform();
    viewer.classList.add('active');
  }

  function closeCoverViewer() {
    viewer.classList.remove('active');
    viewerImg.src = '';
  }

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

  // 滚轮缩放（以鼠标位置为中心）
  viewer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewerImg.getBoundingClientRect();
    const imgCenterX = rect.left + rect.width / 2;
    const imgCenterY = rect.top + rect.height / 2;
    const mouseX = e.clientX - imgCenterX;
    const mouseY = e.clientY - imgCenterY;
    const oldScale = viewerScale;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    viewerScale = Math.max(0.3, Math.min(5, viewerScale + delta));
    const r = viewerScale / oldScale;
    panX = panX * r - mouseX * (r - 1);
    panY = panY * r - mouseY * (r - 1);
    updateViewerTransform();
  }, { passive: false });

  // 鼠标拖拽平移
  viewerImg.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    viewerImg.style.cursor = 'grabbing';
    viewerImg.style.transition = 'none'; // 拖拽时去掉过渡，跟手
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = dragStartPanX + (e.clientX - dragStartX);
    panY = dragStartPanY + (e.clientY - dragStartY);
    updateViewerTransform();
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      viewerImg.style.cursor = 'grab';
      viewerImg.style.transition = 'transform 0.15s ease'; // 松开后恢复过渡
    }
  });

  // Escape 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewer.classList.contains('active')) {
      closeCoverViewer();
    }
  });
}
