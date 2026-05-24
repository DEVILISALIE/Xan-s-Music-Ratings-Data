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
  document.getElementById('editNotes').value = entry.notes || '';
  document.getElementById('editReview').value = entry.review || '';
  document.getElementById('editSectionGroup').style.display = 'block';
  document.getElementById('deleteBtn').style.display = 'inline-block';
  document.getElementById('editAotyToggle').checked = !!entry.isAoty;

  // Section selector — 定位条目所在的原始 section/group
  populateSectionSelector(entry.id);

  const activeTags = entry.tags || [];
  document.querySelectorAll('#editTags .form-tag').forEach(tag => {
    tag.classList.toggle('active', activeTags.includes(tag.dataset.tag));
  });

  editingTracks = (entry.tracks || []).map(t => ({ ...t }));
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
  document.getElementById('editNotes').value = '';
  document.getElementById('editReview').value = '';
  document.getElementById('editAotyToggle').checked = false;
  document.getElementById('deleteBtn').style.display = 'none';
  editingTracks = [];
  renderTracks();

  // Section selector
  populateSectionSelector();
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
  container.innerHTML = editingTracks.map((t, i) => `
    <div class="track-row">
      <span class="track-num">${i + 1}</span>
      <div class="track-name">
        <input class="form-input" placeholder="${t('modal.placeholder.track')}" value="${escapeHtml(t.name)}" onchange="editingTracks[${i}].name=this.value">
      </div>
      <div class="track-score">
        <input class="form-input" type="number" min="0" max="100" inputmode="numeric" placeholder="—" value="${t.score != null ? t.score : ''}" onchange="editingTracks[${i}].score=this.value!==''?parseInt(this.value):null">
      </div>
      <button type="button" class="track-remove" onclick="removeTrack(${i})">×</button>
    </div>`).join('');
  updateTrackSummary();
}

function addTrack() {
  editingTracks.push({ name: '', score: null });
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
  const rated = editingTracks.filter(t => t.score != null).length;
  if (len === 0) { el.textContent = ''; return; }
  const avg = rated > 0 ? (editingTracks.reduce((s, t) => s + (t.score || 0), 0) / rated).toFixed(1) : '—';
  el.textContent = t('modal.trackSummary', { count: len, plural: len > 1 ? 's' : '', rated, avg });
}

function saveEntry() {
  const title = document.getElementById('editTitle').value.trim();
  if (!title) return;

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
    notes: document.getElementById('editNotes').value.trim(),
    tracks: editingTracks.filter(t => t.name.trim() !== '' || t.score != null)
  };

  if (editingEntry) {
    // Update existing
    Object.assign(editingEntry, data);

    // 检查是否需要移动到其他年份/分组
    const sel = JSON.parse(selectedSectionValue);
    const targetGroupName = sel.groupName;
    const mergedId = sel.sectionId;
    const targetSection = findOrCreateSection(mergedId);

    // 找到 entry 当前所在的原始 section/group，判断是否需要移动
    let moved = false;
    for (const section of appData.sections) {
      if (moved) break;
      for (const group of section.groups) {
        if (group.entries.some(e => e.id === editingEntry.id)) {
          if (!(section === targetSection && group.name === targetGroupName)) {
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
          }
          moved = true;
          break;
        }
      }
    }
  } else {
    // Add new
    const sel = JSON.parse(selectedSectionValue);
    const section = findOrCreateSection(sel.sectionId);
    let group = section.groups.find(g => g.name === sel.groupName);
    if (!group) {
      group = { name: sel.groupName, entries: [] };
      section.groups.push(group);
    }
    group.entries.push(data);
  }

  refreshAll();
  closeModal();
}

function deleteEntry() {
  if (!editingEntry) return;
  if (!confirm(t('confirm.deleteEntry'))) return;

  for (const section of appData.sections) {
    for (const group of section.groups) {
      const idx = group.entries.findIndex(e => e.id === editingEntry.id);
      if (idx !== -1) {
        group.entries.splice(idx, 1);
        refreshAll();
        closeModal();
        return;
      }
    }
  }
}
