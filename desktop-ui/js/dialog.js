// 自定义 iOS 风格对话框系统，替代原生 alert/confirm/prompt
// 提供 showAlert / showConfirm / showPrompt 三个异步 API

const dialogContainer = document.getElementById('dialogContainer');

function showCustomDialog({ title, message, type, inputDefault, inputPlaceholder }) {
  return new Promise((resolve) => {
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
    requestAnimationFrame(() => dialogContainer.querySelector('.dialog-overlay').classList.add('active'));

    const input = isPrompt ? document.getElementById('dialogInput') : null;

    // 清理函数
    function cleanup(result) {
      const overlay = dialogContainer.querySelector('.dialog-overlay');
      if (overlay) overlay.classList.remove('active');
      setTimeout(() => { dialogContainer.innerHTML = ''; }, 250);
      resolve(result);
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

    // Enter 键提交
    dialogContainer.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(isPrompt ? (input ? input.value : null) : true);
        dialogContainer.removeEventListener('keydown', onKey);
      } else if (e.key === 'Escape') {
        cleanup(isPrompt ? null : false);
        dialogContainer.removeEventListener('keydown', onKey);
      }
    });

    // prompt 输入框自动聚焦
    if (input) {
      setTimeout(() => { input.focus(); input.select(); }, 50);
    }
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
