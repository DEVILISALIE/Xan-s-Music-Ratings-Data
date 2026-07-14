// i18n 国际化模块
const I18N = {
  en: {
    // Sidebar
    'sidebar.title': "Xan's Music Ratings",
    'sidebar.subtitle': '1950s–Now',
    'sidebar.newYear': '+ New Year',
    'sidebar.export': 'Export JSON',
    'sidebar.import': 'Import JSON',
    'sidebar.overview': 'Overview ({count})',
    'sidebar.aoty': 'AOTY',
    'sidebar.soty': 'SOTY',

    // Toolbar
    'toolbar.search': 'Search title or artist…',
    'toolbar.all': 'All',
    'toolbar.allTags': 'All Tags',
    'toolbar.allScores': 'All Scores',
    'toolbar.mustHear': 'Must Hear Album',
    'toolbar.mustHearLabel': 'Threshold',
    'toolbar.mustHearSave': 'Save',
    'toolbar.albums': 'Albums',
    'toolbar.singles': 'Singles',
    'toolbar.countFiltered': '{visible} / {total}',
    'toolbar.nr': 'NR / No Score',
    'settings.darkMode': 'Dark Mode',
    'settings.glassStyle': 'Glass Style',
    'settings.language': 'Language',
    'settings.batchMode': 'Batch Mode',
    'settings.bgHue': 'Background Hue',
    'settings.bgHueReset': 'Default',
    'stats.avg': 'avg',
    'stats.nr': 'NR',
    'stats.entries': 'Entries',
    'stats.scored': 'scored',
    'stats.yearlyAlbums': 'Yearly Avg — Albums',
    'stats.yearlySingles': 'Yearly Avg — Singles',

    // Modal
    'modal.editTitle': 'Edit Content',
    'modal.addTitle': 'Add Album',
    'modal.title': 'Title',
    'modal.artist': 'Artist',
    'modal.score': 'Score',
    'modal.date': 'Date',
    'modal.scoreNote': 'Score Note',
    'modal.tags': 'Tags',
    'modal.aoty': 'Album of the Year',
    'modal.soty': 'Song of the Year',
    'modal.section': 'Add to Section',
    'modal.notes': 'Notes',
    'modal.trackRatings': 'Track Ratings',
    'modal.review': 'Written Review',
    'modal.cancel': 'Cancel',
    'modal.delete': 'Delete',
    'modal.save': 'Save',
    'modal.addTrack': '+ Add Track',
    'modal.addDisc': '+ Add Disc',
    'modal.batchAddTracks': 'Batch Add',
    'modal.batchAddPrompt': 'Enter number of tracks:',
    'modal.batchAddPlaceholder': 'e.g. 12',
    'modal.trackSummary': '{count} track{plural} · {rated} rated · avg {avg}',
    'modal.discAvg': 'Disc {disc}: avg {avg}',
    'modal.coverUpload': 'Upload',
    'modal.coverUrl': 'URL',
    'modal.coverRemove': 'Remove',
    'modal.coverRemoveConfirm': 'Confirm',
    'modal.coverRemoveCancel': 'Cancel',
    'modal.coverUrlPrompt': 'Enter image URL:',
    'modal.placeholder.title': 'Album title…',
    'modal.placeholder.artist': 'Artist name…',
    'modal.placeholder.score': '0–100',
    'modal.placeholder.date': 'MM.DD',
    'modal.placeholder.note': 'e.g. Top1, NR…',
    'modal.placeholder.notes': 'Additional notes…',
    'modal.placeholder.track': 'Track name…',
    'modal.placeholder.review': 'Write your review here…',
    'modal.placeholder.select': 'Select…',
    'modal.validation.selectSection': 'Please select a section first',

    // Dynamic content
    'content.sectionTitle': '{year}',
    'content.showMore': 'Show more',
    'content.showLess': 'Show less',
    'content.mustHear': '★Must Hear Album',
    'content.trackTooltip': 'Track ratings',
    'content.trackUnit': 'T',
    'content.discLabel': '{count} Discs ',
    'content.reviewTooltip': 'Has review',

    // Confirmations / Alerts
    'confirm.deleteEntry': 'Delete this entry?',
    'confirm.deleteYear': 'Delete all {count} entries from {year}? This cannot be undone.',
    'alert.yearPrompt': 'Enter a new year (e.g. 2027):',
    'alert.invalidYear': 'Please enter a valid 4-digit year.',
    'alert.yearExists': '{year} already exists.',
    'alert.invalidJson': 'Invalid JSON file: missing sections array',
    'alert.invalidJsonGeneric': 'Invalid JSON file',
    'error.loadData': 'Could not load data',
    'error.loadDataHint': 'Make sure you are running a local server or data is embedded.',
    // Dialog (iOS-style custom dialogs)
    'dialog.ok': 'OK',
    'dialog.cancel': 'Cancel',
    'dialog.confirm': 'Confirm',
    'dialog.storageFull': 'Storage full. Please export your data and clean up some entries.',
    'dialog.yearPrompt': 'Enter a year',
    'dialog.yearPromptHint': 'e.g. 2027',
    'dialog.deleteYear': 'Delete Year',
    'dialog.deleteYearMsg': 'Delete all {count} entries from {year}? This cannot be undone.',
    'dialog.deleteEntry': 'Delete Entry',
    'dialog.deleteEntryMsg': 'Delete this entry?',
    'dialog.invalidJson': 'Invalid JSON file: missing sections array',
    'dialog.invalidJsonGeneric': 'Invalid JSON file',
    'dialog.invalidYear': 'Please enter a valid 4-digit year',
    'dialog.yearExists': '{year} already exists',
    'dialog.exportSuccess': 'Export successful',

    // Batch operations
    'batch.select': 'Select',
    'batch.toggleTooltip': 'Batch Select',
    'batch.cancel': 'Cancel',
    'batch.selected': '{count} selected',
    'batch.delete': 'Delete',
    'batch.deleteTitle': 'Batch Delete',
    'batch.deleteMsg': 'Delete {count} selected entries? This cannot be undone.',
    'batch.tag': 'Tag',
    'batch.addTag': 'Add Tag',
    'batch.removeTag': 'Remove Tag',
    'batch.tagTitle': 'Batch Tag',
    'batch.addTagMsg': 'Add tag "{tag}" to {count} entries?',
    'batch.removeTagMsg': 'Remove tag "{tag}" from {count} entries?',
    'batch.move': 'Move',
    'batch.moveTitle': 'Batch Move',
    'batch.moveMsg': 'Move {count} selected entries to:',
    'batch.selectAll': 'Select All',
    'batch.deselectAll': 'Deselect All',
    'batch.noSelection': 'No entries selected',

    'tooltip.darkMode': 'Dark Mode',
    'tooltip.lightMode': 'Light Mode',
    'tooltip.glass': 'Glassmorphism',
    'tooltip.solid': 'Solid Style',
    'tooltip.lang': '中文',
  },

  zh: {
    // Sidebar
    'sidebar.title': '乐评档案',
    'sidebar.subtitle': '1950年代–现在',
    'sidebar.newYear': '+ 新年份',
    'sidebar.export': '导出 JSON',
    'sidebar.import': '导入 JSON',
    'sidebar.overview': '概览 ({count})',
    'sidebar.aoty': '年度专辑',
    'sidebar.soty': '年度单曲',

    // Toolbar
    'toolbar.search': '搜索标题或艺术家…',
    'toolbar.all': '全部',
    'toolbar.allTags': '全部标签',
    'toolbar.allScores': '所有分数',
    'toolbar.mustHear': '必听专辑',
    'toolbar.mustHearLabel': '阈值',
    'toolbar.mustHearSave': '保存',
    'toolbar.albums': '专辑',
    'toolbar.singles': '单曲',
    'toolbar.countFiltered': '{visible} / {total}',
    'toolbar.nr': 'NR / 无分数',
    'settings.darkMode': '深色模式',
    'settings.glassStyle': '毛玻璃风格',
    'settings.language': '语言',
    'settings.batchMode': '多选模式',
    'settings.bgHue': '背景色调',
    'settings.bgHueReset': '默认',
    'stats.avg': '平均',
    'stats.nr': '未打分',
    'stats.entries': '条目',
    'stats.scored': '已打分',
    'stats.yearlyAlbums': '年度平均分 — 专辑',
    'stats.yearlySingles': '年度平均分 — 单曲',

    // Modal
    'modal.editTitle': '编辑内容',
    'modal.addTitle': '添加专辑',
    'modal.title': '标题',
    'modal.artist': '艺术家',
    'modal.score': '分数',
    'modal.date': '日期',
    'modal.scoreNote': '分数备注',
    'modal.tags': '标签',
    'modal.aoty': '年度专辑',
    'modal.soty': '年度单曲',
    'modal.section': '添加到分组',
    'modal.notes': '备注',
    'modal.trackRatings': '曲目评分',
    'modal.review': '文字乐评',
    'modal.cancel': '取消',
    'modal.delete': '删除',
    'modal.save': '保存',
    'modal.addTrack': '+ 添加曲目',
    'modal.addDisc': '+ 添加 Disc',
    'modal.batchAddTracks': '批量添加',
    'modal.batchAddPrompt': '输入曲目数量：',
    'modal.batchAddPlaceholder': '例如 12',
    'modal.trackSummary': '{count} 首曲 · {rated} 首有分 · 平均 {avg}',
    'modal.discAvg': '碟{disc}：平均 {avg}',
    'modal.coverUpload': '上传',
    'modal.coverUrl': 'URL',
    'modal.coverRemove': '移除',
    'modal.coverRemoveConfirm': '确认移除',
    'modal.coverRemoveCancel': '取消',
    'modal.coverUrlPrompt': '输入图片 URL：',
    'modal.placeholder.title': '专辑名称…',
    'modal.placeholder.artist': '艺术家名称…',
    'modal.placeholder.score': '0–100',
    'modal.placeholder.date': 'MM.DD',
    'modal.placeholder.note': '例如 Top1、NR…',
    'modal.placeholder.notes': '附加备注…',
    'modal.placeholder.track': '曲目名称…',
    'modal.placeholder.review': '在此写你的乐评…',
    'modal.placeholder.select': '选择…',
    'modal.validation.selectSection': '请先选择年份分区',

    // Dynamic content
    'content.sectionTitle': '{year}',
    'content.showMore': '展开更多',
    'content.showLess': '收起',
    'content.mustHear': '★必听专辑',
    'content.trackTooltip': '曲目评分',
    'content.trackUnit': '首',
    'content.discLabel': '{count}碟 ',
    'content.reviewTooltip': '有乐评',

    // Confirmations / Alerts
    'confirm.deleteEntry': '确定删除此条目？',
    'confirm.deleteYear': '确定删除 {year} 年的所有 {count} 条数据？此操作不可撤销。',
    'alert.yearPrompt': '输入新年份（如 2027）：',
    'alert.invalidYear': '请输入有效的 4 位年份',
    'alert.yearExists': '{year} 年已存在',
    'alert.invalidJson': '无效的 JSON 文件：缺少 sections 数组',
    'alert.invalidJsonGeneric': '无效的 JSON 文件',
    'error.loadData': '无法加载数据',
    'error.loadDataHint': '请确保正在运行本地服务器或数据已嵌入。',
    // Dialog (iOS-style custom dialogs)
    'dialog.ok': '好的',
    'dialog.cancel': '取消',
    'dialog.confirm': '确定',
    'dialog.storageFull': '存储空间已满，请导出数据后清理部分条目。',
    'dialog.yearPrompt': '输入新年份',
    'dialog.yearPromptHint': '如 2027',
    'dialog.deleteYear': '删除年份',
    'dialog.deleteYearMsg': '确定删除 {year} 年的所有 {count} 条数据？此操作不可撤销。',
    'dialog.deleteEntry': '删除条目',
    'dialog.deleteEntryMsg': '确定删除此条目？',
    'dialog.invalidJson': '无效的 JSON 文件：缺少 sections 数组',
    'dialog.invalidJsonGeneric': '无效的 JSON 文件',
    'dialog.invalidYear': '请输入有效的 4 位年份',
    'dialog.yearExists': '{year} 年已存在',
    'dialog.exportSuccess': '导出成功',

    // 批量操作
    'batch.select': '选择',
    'batch.toggleTooltip': '多选',
    'batch.cancel': '取消',
    'batch.selected': '已选 {count} 项',
    'batch.delete': '删除',
    'batch.deleteTitle': '批量删除',
    'batch.deleteMsg': '确定删除选中的 {count} 条数据？此操作不可撤销。',
    'batch.tag': '标签',
    'batch.addTag': '添加标签',
    'batch.removeTag': '移除标签',
    'batch.tagTitle': '批量标签',
    'batch.addTagMsg': '为 {count} 条数据添加标签「{tag}」？',
    'batch.removeTagMsg': '从 {count} 条数据移除标签「{tag}」？',
    'batch.move': '移动',
    'batch.moveTitle': '批量移动',
    'batch.moveMsg': '将选中的 {count} 条数据移动到：',
    'batch.selectAll': '全选',
    'batch.deselectAll': '取消全选',
    'batch.noSelection': '未选中任何数据',

    'tooltip.darkMode': '暗色模式',
    'tooltip.lightMode': '亮色模式',
    'tooltip.glass': '毛玻璃风格',
    'tooltip.solid': '纯色风格',
    'tooltip.lang': 'English',
  }
};

function t(key, params) {
  const dict = I18N[currentLang] || I18N.en;
  let str = dict[key] || I18N.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
    }
  }
  return str;
}

function applyI18nToDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : undefined;
    el.textContent = t(key, params);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}

function applyLang() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.setAttribute('data-lang', currentLang);
  applyI18nToDOM();
  const langVal = document.getElementById('settingsLangValue');
  if (langVal) langVal.textContent = currentLang === 'zh' ? '中文' : 'English';
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('lang', currentLang);
  applyLang();
  applyTheme();
  // 只更新语言相关文本，不全量重建 DOM
  updateLangTexts();
  // 更新分数筛选器文字
  const scoreTrigger = document.getElementById('scoreFilterTrigger');
  const activeScoreOpt = document.querySelector('#scoreFilterMenu .custom-select-option.active');
  if (scoreTrigger && activeScoreOpt) scoreTrigger.textContent = activeScoreOpt.textContent;
  // 更新标签筛选器文字
  const tagTrigger = document.getElementById('tagFilterTrigger');
  if (tagTrigger) {
    const activeCount = currentFilter.length;
    tagTrigger.textContent = activeCount === 0 ? t('toolbar.allTags') : activeCount + (currentLang === 'zh' ? ' 个标签' : ' tag' + (activeCount > 1 ? 's' : ''));
  }
  // 更新必听阈值按钮文字
  const mustHearTrigger = document.getElementById('mustHearTrigger');
  if (mustHearTrigger) mustHearTrigger.textContent = t('toolbar.mustHear');
  updateToolbarStats();
  if (typeof updateAotyLabel === 'function') updateAotyLabel();
}

// 读取持久化语言偏好，默认英文
currentLang = localStorage.getItem('lang') || 'en';
