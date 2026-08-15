// 自定义 iOS 风格对话框系统，替代原生 alert/confirm/prompt
// 提供 showAlert / showConfirm / showPrompt 三个异步 API（内置 FIFO 队列，防止并发覆盖）

const dialogContainer = document.getElementById('dialogContainer');
const _dialogQueue = [];
let _isDialogShowing = false;

function _processDialogQueue() {
  if (_isDialogShowing || _dialogQueue.length === 0) return;
  _isDialogShowing = true;
  const { options, resolve } = _dialogQueue.shift();

  const { title, message, type, inputDefault, inputPlaceholder } = options;
  const isPrompt = type === 'prompt';
  const isConfirm = type === 'confirm';

  // 构建内容 HTML
  let contentHtml = '';
  if (title) contentHtml += '<div class="dialog-title">' + escapeHtml(title) + '</div>';
  if (message) contentHtml += '<div class="dialog-message">' + escapeHtml(message) + '</div>';
  if (isPrompt) {
    contentHtml += '<input class="dialog-input" id="dialogInput" type="text" value="' +
      escapeHtml(inputDefault || '') + '" placeholder="' +
      escapeHtml(inputPlaceholder || '') + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true">';
  }

  // 构建按钮
  let btnsHtml = '';
  if (isConfirm || isPrompt) {
    btnsHtml += '<button class="dialog-btn cancel" data-action="dialog-cancel">' +
      escapeHtml(t('dialog.cancel')) + '</button>';
  }
  const primaryText = (isConfirm || isPrompt) ? t('dialog.confirm') : t('dialog.ok');
  const primaryClass = (isConfirm || isPrompt) ? 'confirm' : '';
  btnsHtml += '<button class="dialog-btn ' + primaryClass + '" data-action="dialog-confirm">' +
    escapeHtml(primaryText) + '</button>';

  dialogContainer.innerHTML =
    '<div class="dialog-overlay">' +
      '<div class="dialog-sheet">' +
        contentHtml +
        '<div class="dialog-buttons">' + btnsHtml + '</div>' +
      '</div>' +
    '</div>';

  // 触发动画
  requestAnimationFrame(() => {
    const overlay = dialogContainer.querySelector('.dialog-overlay');
    if (overlay) overlay.classList.add('active');
  });

  const input = isPrompt ? document.getElementById('dialogInput') : null;

  // 键盘全局拦截（使用捕获阶段）
  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      cleanup(isPrompt ? (input ? input.value : null) : true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup(isPrompt ? null : false);
    }
  }

  let cleanedUp = false;
  // 清理函数
  function cleanup(result) {
    if (cleanedUp) return;
    cleanedUp = true;
    document.removeEventListener('keydown', onKey, true);
    const overlay = dialogContainer.querySelector('.dialog-overlay');
    if (overlay) overlay.classList.remove('active');
    setTimeout(() => {
      dialogContainer.innerHTML = '';
      _isDialogShowing = false;
      resolve(result);
      _processDialogQueue();
    }, 250);
  }

  // 事件监听
  const sheet = dialogContainer.querySelector('.dialog-sheet');
  sheet.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'dialog-confirm') {
      cleanup(isPrompt ? (input ? input.value : null) : true);
    } else if (action.dataset.action === 'dialog-cancel') {
      cleanup(isPrompt ? null : false);
    }
  });

  document.addEventListener('keydown', onKey, true);

  // 自动聚焦
  if (input) {
    setTimeout(() => { input.focus(); input.select(); }, 50);
  } else {
    const primaryBtn = sheet.querySelector('.dialog-btn[data-action="dialog-confirm"]');
    if (primaryBtn) setTimeout(() => primaryBtn.focus(), 50);
  }
}

function showCustomDialog(options) {
  return new Promise((resolve) => {
    _dialogQueue.push({ options, resolve });
    _processDialogQueue();
  });
}

function showAlert(title, message) {
  return showCustomDialog({ title, message, type: 'alert' });
}

function showConfirm(title, message) {
  return showCustomDialog({ title, message, type: 'confirm' });
}

function showPrompt(title, message, defaultVal, placeholder) {
  return showCustomDialog({
    title, message, type: 'prompt',
    inputDefault: defaultVal, inputPlaceholder: placeholder
  });
}
