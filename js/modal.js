// Modal logic
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
  document.getElementById('editSectionSelect').classList.remove('open');
  document.getElementById('coverRemoveDropdown').classList.remove('active');
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
    html += `<button type="button" class="track-add-inline" data-action="add-track-to-disc" data-disc="${disc}">+ ${t('modal.addTrack').replace('+ ', '')}</button>`;
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

  if (editingEntry) {
    // Update existing
    Object.assign(editingEntry, data);

    // 检查是否需要移动到其他年份/分组
    let sel;
    try { sel = JSON.parse(selectedSectionValue); } catch (_) { closeModal(); return; }
    const targetGroupName = sel.groupName;
    const mergedId = sel.sectionId;
    const targetSection = findOrCreateSection(mergedId);
    console.log('[Move] 目标:', mergedId, targetGroupName, '当前条目AOTY:', editingEntry.isAoty);

    // 找到 entry 当前所在的原始 section/group，判断是否需要移动
    let moved = false;
    for (const section of appData.sections) {
      if (moved) break;
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
          }
          moved = true;
          break;
        }
      }
    }
    if (!moved) {
      console.warn('[Move] 警告：找不到条目', editingEntry.id, '所在的 section/group！');
    }
  } else {
    // Add new
    let sel;
    try { sel = JSON.parse(selectedSectionValue); } catch (_) { closeModal(); return; }
    const section = findOrCreateSection(sel.sectionId);
    let group = section.groups.find(g => g.name === sel.groupName);
    if (!group) {
      group = { name: sel.groupName, entries: [] };
      section.groups.push(group);
    }
    group.entries.push(data);
  }

  debugAotyCount('saveEntry 后');
  await refreshAll();
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

// ===== 封面管理 =====

function loadCoverPreview(cover, entryId) {
  const wrap = document.getElementById('coverPreviewWrap');
  const img = document.getElementById('coverPreview');
  const removeWrap = document.getElementById('coverRemoveWrap');

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
    const cached = coverCache.get(entryId);
    if (cached) {
      img.src = cached;
      wrap.style.display = '';
      removeWrap.style.display = '';
    } else {
      window.__TAURI__.core.invoke('read_cover', { entryId: entryId }).then(dataUrl => {
        coverCache.set(entryId, dataUrl);
        img.src = dataUrl;
        wrap.style.display = '';
        removeWrap.style.display = '';
      }).catch(() => {
        wrap.style.display = 'none';
        removeWrap.style.display = 'none';
      });
    }
  }
}

function clearCoverPreview() {
  document.getElementById('coverPreviewWrap').style.display = 'none';
  const img = document.getElementById('coverPreview');
  img.src = '';
  img.style.width = '';
  img.style.height = '';
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
      // 更新缓存
      try {
        const dataUrl = await window.__TAURI__.core.invoke('read_cover', { entryId: editingEntry.id });
        coverCache.set(editingEntry.id, dataUrl);
      } catch (_) {}
      loadCoverPreview(filename, editingEntry.id);
    } catch (err) {
      console.error('封面上传失败:', err);
    }
  });

  // URL 输入
  section.querySelector('[data-action="cover-url"]').addEventListener('click', () => {
    if (!editingEntry) return;
    const url = prompt(t('modal.coverUrlPrompt'));
    if (!url || !url.trim()) return;
    editingEntry.cover = url.trim();
    coverCache.set(editingEntry.id, url.trim());
    loadCoverPreview(url.trim(), editingEntry.id);
  });

  // 移除 — 显示确认 dropdown
  section.querySelector('[data-action="cover-remove"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('coverRemoveDropdown');
    dropdown.classList.toggle('active');
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
    coverCache.delete(editingEntry.id);
    clearCoverPreview();
  });

  // 取消移除
  section.querySelector('[data-action="cover-remove-cancel"]').addEventListener('click', () => {
    document.getElementById('coverRemoveDropdown').classList.remove('active');
  });

  // 点击外部关闭移除 dropdown
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('coverRemoveDropdown');
    const removeWrap = document.getElementById('coverRemoveWrap');
    if (dropdown.classList.contains('active') && !removeWrap.contains(e.target)) {
      dropdown.classList.remove('active');
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