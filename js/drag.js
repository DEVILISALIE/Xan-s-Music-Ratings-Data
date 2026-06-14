// 拖拽排序模块
// 使用 Pointer Events + FLIP 动画实现同组内卡片拖拽排序

// ===== Drag & Drop Reorder =====
// 使用 Pointer Events 实现类似 iOS/Edge 的流畅拖拽体验
// 应用 Disney 动画原则：Anticipation, Follow Through, Ease In/Out
document.addEventListener('DOMContentLoaded', () => {
  const contentArea = document.getElementById('contentArea');
  const mainEl = document.getElementById('mainContent');

  let state = {
    active: false,
    entryId: null,
    group: null,
    card: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    origWidth: 0,
    origHeight: 0,
    ghost: null,
    placeholder: null,
    scrollAnimId: null,
    lastClientY: 0,
    lastMoveX: 0,
    lastMoveY: 0,
    isAnimating: false,
    currentInsertTarget: null, // 当前插入目标
  };

  // 找到包含指定 entry 的 group
  function findSourceGroup(entryId) {
    for (const section of appData.sections) {
      for (const group of section.groups) {
        if (group.entries.some(en => en.id === entryId)) return group;
      }
    }
    return null;
  }

  // ===== Auto Scroll =====

  function startAutoScroll() {
    stopAutoScroll();
    const zone = 80, maxSpeed = 12;
    function tick() {
      if (!state.active) { stopAutoScroll(); return; }
      const cy = state.lastClientY;
      let speed = 0;
      if (cy < zone) speed = -maxSpeed * (1 - cy / zone);
      else if (cy > window.innerHeight - zone) speed = maxSpeed * (1 - (window.innerHeight - cy) / zone);
      if (speed !== 0) { mainEl.scrollBy(0, speed); state.scrollAnimId = requestAnimationFrame(tick); }
      else stopAutoScroll();
    }
    state.scrollAnimId = requestAnimationFrame(tick);
  }

  function updateAutoScroll(clientY) {
    state.lastClientY = clientY;
    if (!state.active) { stopAutoScroll(); return; }
    const zone = 80;
    if (clientY < zone || clientY > window.innerHeight - zone) { if (!state.scrollAnimId) startAutoScroll(); }
    else stopAutoScroll();
  }

  function stopAutoScroll() {
    if (state.scrollAnimId) { cancelAnimationFrame(state.scrollAnimId); state.scrollAnimId = null; }
  }

  // ===== 创建空位占位符 =====

  function createPlaceholder(height) {
    const placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.height = height + 'px';
    return placeholder;
  }

  // ===== 查找插入位置 =====

  function findInsertPosition(clientY) {
    const groupId = state.card.dataset.group;
    const parent = state.card.parentNode;

    // 获取所有同组卡片（排除被拖拽的原卡片）
    const cards = [];
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === state.card) continue; // 跳过原卡片
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        const rect = child.getBoundingClientRect();
        cards.push({
          element: child,
          entryId: child.dataset.entryId,
          midY: rect.top + rect.height / 2,
          top: rect.top,
          bottom: rect.bottom
        });
      }
    }

    if (cards.length === 0) return null;

    // 找到最近的卡片
    let bestCard = null;
    let bestDist = Infinity;

    for (const card of cards) {
      const dist = Math.abs(clientY - card.midY);
      if (dist < bestDist) {
        bestDist = dist;
        bestCard = card;
      }
    }

    if (!bestCard) return null;

    // 判断是插入到该卡片之前还是之后
    const insertBefore = clientY < bestCard.midY;

    return {
      element: bestCard.element,
      insertBefore: insertBefore
    };
  }

  // ===== FLIP 动画：平滑移动卡片 =====

  function animateCards(oldPositions) {
    const groupId = state.card.dataset.group;
    const parent = state.card.parentNode;

    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === state.card || child === state.placeholder) continue;
      if (!child.classList.contains('album-card') || child.dataset.group !== groupId) continue;

      const oldRect = oldPositions.get(child);
      if (!oldRect) continue;

      const newRect = child.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;

      if (Math.abs(dy) < 0.5) continue;

      // 应用 FLIP 动画
      child.style.transition = 'none';
      child.style.transform = `translateY(${dy}px)`;

      // 强制重排
      child.offsetHeight;

      child.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
      child.style.transform = '';
    }
  }

  // ===== 更新占位符位置 =====

  function updatePlaceholderPosition(insertPos) {
    if (!insertPos || !state.placeholder) return;
    if (!insertPos.element || !insertPos.element.parentNode) return;

    // 检查是否和当前目标相同
    const targetId = insertPos.element.dataset.entryId;
    const insertKey = targetId + (insertPos.insertBefore ? '-before' : '-after');
    if (state.currentInsertTarget === insertKey) return;
    state.currentInsertTarget = insertKey;

    const parent = state.card.parentNode;
    const placeholder = state.placeholder;
    const groupId = state.card.dataset.group;

    // 记录所有卡片当前位置（FLIP First）
    const oldPositions = new Map();
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === state.card) continue;
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        oldPositions.set(child, child.getBoundingClientRect());
      }
    }

    // 移动占位符到新位置（FLIP Last）
    if (insertPos.insertBefore) {
      parent.insertBefore(placeholder, insertPos.element);
    } else {
      parent.insertBefore(placeholder, insertPos.element.nextSibling);
    }

    // Invert + Play：执行挤开动画
    animateCards(oldPositions);
  }

  // ===== 更新幽灵位置 =====

  function updateGhostPosition(clientX, clientY) {
    if (!state.ghost) return;
    state.ghost.style.left = (clientX - state.offsetX) + 'px';
    state.ghost.style.top = (clientY - state.offsetY) + 'px';
  }

  // ===== Pointer Handlers =====

  function onPointerDown(e) {
    const card = e.target.closest('.album-card');
    if (!card) return;
    if (card.classList.contains('aoty-card')) return;
    if (e.target.closest('button, a, .tag, .review-indicator, .score-badge')) return;

    const rect = card.getBoundingClientRect();

    state.startX = e.clientX;
    state.startY = e.clientY;
    state.offsetX = e.clientX - rect.left;
    state.offsetY = e.clientY - rect.top;
    state.origWidth = rect.width;
    state.origHeight = rect.height;
    state.card = card;
    state.entryId = card.dataset.entryId;
    state.group = null;

    card.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!state.card) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!state.active) {
      if (dist < 6) return;

      state.active = true;
      state.group = findSourceGroup(state.entryId);
      if (!state.group) { cancelDrag(); return; }
      state.lastMoveX = e.clientX;
      state.lastMoveY = e.clientY;

      // 拖拽期间禁用所有卡片的 backdrop-filter，降低 GPU 负担
      contentArea.classList.add('is-dragging');

      const card = state.card;
      const rect = card.getBoundingClientRect();
      const parent = card.parentNode;

      // 创建幽灵元素（跟随鼠标）
      const ghost = card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.cssText = `
        position: fixed;
        width: ${rect.width}px;
        left: ${e.clientX - state.offsetX}px;
        top: ${e.clientY - state.offsetY}px;
        z-index: 10000;
        pointer-events: none;
        transition: none;
        transform: scale(1.03) rotate(0.8deg);
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        border-radius: 12px;
        opacity: 0.92;
        cursor: grabbing;
      `;
      document.body.appendChild(ghost);
      state.ghost = ghost;

      // 创建占位符（高度已正确）
      const placeholder = createPlaceholder(rect.height);
      state.placeholder = placeholder;

      // 隐藏原卡片（先隐藏，再插入占位符，避免抖动）
      card.style.opacity = '0';
      card.style.pointerEvents = 'none';

      // 在原卡片位置插入占位符（原卡片仍占据布局空间）
      parent.insertBefore(placeholder, card);

      // 现在原卡片和占位符都占据空间，移除原卡片的布局影响
      // 使用 height:0 + margin:0 让原卡片"消失"但不触发 FLIP
      card.style.height = '0';
      card.style.margin = '0';
      card.style.padding = '0';
      card.style.overflow = 'hidden';
      card.style.border = 'none';
      card.style.boxShadow = 'none';

      return;
    }

    e.preventDefault();
    state.lastMoveX = e.clientX;
    state.lastMoveY = e.clientY;

    updateGhostPosition(e.clientX, e.clientY);
    updateAutoScroll(e.clientY);

    // 查找插入位置
    const ghostCenterY = e.clientY - state.offsetY + state.origHeight / 2;
    const pos = findInsertPosition(ghostCenterY);

    if (pos) {
      updatePlaceholderPosition(pos);
    }
  }

  function onPointerUp(e) {
    const card = state.card;
    if (!card) return;

    if (!state.active) {
      try { card.releasePointerCapture(e.pointerId); } catch (_) {}
      resetState();
      return;
    }

    try { card.releasePointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    finishDrag(e.clientX, e.clientY);
  }

  function onPointerCancel(e) {
    if (!state.card) return;
    try { state.card.releasePointerCapture(e.pointerId); } catch (_) {}
    if (state.active) cancelDrag();
    else resetState();
  }

  // ===== 完成拖拽 =====

  function finishDrag(clientX, clientY) {
    if (state.isAnimating) return;
    state.isAnimating = true;
    stopAutoScroll();

    const dragId = state.entryId;
    const dragGroup = state.group;
    const dragCard = state.card;
    const ghost = state.ghost;
    const placeholder = state.placeholder;

    if (!dragId || !dragGroup || !dragCard || !ghost || !placeholder) {
      resetState();
      return;
    }

    // 保存幽灵最后位置
    const ghostLastX = state.lastMoveX - state.offsetX;
    const ghostLastY = state.lastMoveY - state.offsetY;

    // 获取占位符最终位置
    const placeholderRect = placeholder.getBoundingClientRect();

    // 移除幽灵
    ghost.remove();
    state.ghost = null;

    // 记录所有卡片当前位置（FLIP First）
    const groupId = dragCard.dataset.group;
    const parent = dragCard.parentNode;
    const oldPositions = new Map();
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === dragCard) continue;
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        oldPositions.set(child, child.getBoundingClientRect());
      }
    }

    // 恢复原卡片样式并移动到占位符位置
    dragCard.style.opacity = '';
    dragCard.style.pointerEvents = '';
    dragCard.style.height = '';
    dragCard.style.margin = '';
    dragCard.style.padding = '';
    dragCard.style.overflow = '';
    dragCard.style.border = '';
    dragCard.style.boxShadow = '';
    parent.insertBefore(dragCard, placeholder);

    // 移除占位符
    placeholder.remove();
    state.placeholder = null;

    // 执行飞入动画：从幽灵位置飞到最终位置
    const dragCardRect = dragCard.getBoundingClientRect();
    const gx = ghostLastX - dragCardRect.left;
    const gy = ghostLastY - dragCardRect.top;

    dragCard.style.transition = 'none';
    dragCard.style.transform = `translate(${gx}px, ${gy}px) scale(1.03)`;
    dragCard.style.zIndex = '10000';
    dragCard.style.boxShadow = '0 20px 60px rgba(0,0,0,0.3)';

    // 强制重排
    dragCard.offsetHeight;

    dragCard.style.transition = 'transform 0.35s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.35s ease';
    dragCard.style.transform = '';
    dragCard.style.zIndex = '';
    dragCard.style.boxShadow = '';

    // 其他卡片 FLIP 动画
    animateCards(oldPositions);

    // 获取当前 section 中同组卡片的最终顺序
    const currentSection = dragCard.closest('.section');
    const allCards = currentSection
      ? [...currentSection.querySelectorAll(`.album-card[data-group="${groupId}"]`)]
      : [...contentArea.querySelectorAll(`.album-card[data-group="${groupId}"]`)];
    const finalOrder = allCards.map(c => c.dataset.entryId);

    // 同步拖拽后的顺序到数据
    const sourceGroup = findSourceGroup(dragId);
    if (sourceGroup) {
      syncEntriesOrder(sourceGroup, finalOrder);
    }

    // 更新序号
    allCards.forEach((c, i) => {
      const idxEl = c.querySelector('.album-index');
      if (idxEl) idxEl.textContent = i + 1;
    });

    // 动画完成后重置
    setTimeout(async () => {
      buildEntryIndex();
      await saveData();
      state.isAnimating = false;
      contentArea.classList.remove('is-dragging');
      resetState();
    }, 350);
  }

  // 同步 entries 顺序到指定 group
  // 保留 DOM 中未出现的条目（如 AOTY 卡片被渲染到组顶部，不在普通卡片列表中）
  function syncEntriesOrder(group, finalOrder) {
    const orderSet = new Set(finalOrder);
    const entryMap = new Map(group.entries.map(e => [e.id, e]));
    // DOM 中有的条目按 DOM 顺序排列
    const ordered = finalOrder.map(id => entryMap.get(id)).filter(e => e !== undefined);
    // DOM 中没有的条目（如 AOTY）追加到末尾，保留原有顺序
    const missing = group.entries.filter(e => !orderSet.has(e.id));
    group.entries = [...ordered, ...missing];
  }

  // ===== 取消拖拽 =====

  function cancelDrag() {
    if (state.isAnimating) return;
    state.isAnimating = true;
    stopAutoScroll();

    const dragCard = state.card;
    const ghost = state.ghost;
    const placeholder = state.placeholder;

    if (!dragCard || !ghost || !placeholder) {
      resetState();
      return;
    }

    // 保存幽灵当前位置
    const ghostRect = ghost.getBoundingClientRect();
    const ghostX = ghostRect.left;
    const ghostY = ghostRect.top;

    // 获取占位符位置（原位置）
    const placeholderRect = placeholder.getBoundingClientRect();

    // 移除幽灵和占位符
    ghost.remove();
    state.ghost = null;

    // 记录所有卡片当前位置（FLIP First）
    const groupId = dragCard.dataset.group;
    const parent = dragCard.parentNode;
    const oldPositions = new Map();
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child === dragCard || child === placeholder) continue;
      if (child.classList.contains('album-card') && child.dataset.group === groupId) {
        oldPositions.set(child, child.getBoundingClientRect());
      }
    }

    // 恢复原卡片样式
    dragCard.style.opacity = '';
    dragCard.style.pointerEvents = '';
    dragCard.style.height = '';
    dragCard.style.margin = '';
    dragCard.style.padding = '';
    dragCard.style.overflow = '';
    dragCard.style.border = '';
    dragCard.style.boxShadow = '';

    // 移除占位符（原卡片回到原位）
    placeholder.remove();
    state.placeholder = null;

    // 回弹动画：从幽灵位置飞回原位置
    const dx = ghostX - placeholderRect.left;
    const dy = ghostY - placeholderRect.top;

    dragCard.style.transition = 'none';
    dragCard.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
    dragCard.style.zIndex = '10000';
    dragCard.style.boxShadow = '0 20px 60px rgba(0,0,0,0.3)';

    // 强制重排
    dragCard.offsetHeight;

    dragCard.style.transition = 'transform 0.35s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.35s ease';
    dragCard.style.transform = '';
    dragCard.style.zIndex = '';
    dragCard.style.boxShadow = '';

    // 其他卡片回到原位
    animateCards(oldPositions);

    setTimeout(() => {
      state.isAnimating = false;
      contentArea.classList.remove('is-dragging');
      resetState();
    }, 350);
  }

  function resetState() {
    state.active = false;
    state.entryId = null;
    state.group = null;
    state.card = null;
    state.ghost = null;
    state.placeholder = null;
    state.scrollAnimId = null;
    state.isAnimating = false;
    state.currentInsertTarget = null;
  }

  // ===== 绑定事件 =====

  contentArea.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);

  document.addEventListener('selectstart', (e) => {
    if (state.card) e.preventDefault();
  });

  document.addEventListener('wheel', (e) => {
    if (!state.active) return;
    e.preventDefault();
    mainEl.scrollTop += e.deltaY;
    updateAutoScroll(state.lastClientY);
  }, { passive: false });
});
