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

  document.getElementById('editModal').classList.add('active');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('active');
  document.getElementById('editSectionSelect').classList.remove('open');
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
  el.textContent = t('modal.trackSummary', { count: len, plural: len > 1 ? 's' : '', rated, avg });
}

function saveEntry() {
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
  refreshAll();
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
        refreshAll();
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