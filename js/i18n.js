// i18n 国际化模块
const I18N = {
  en: {
    // Sidebar
    'sidebar.title': "Xan's Music Ratings",
    'sidebar.subtitle': '1960s–Now',
    'sidebar.newYear': '+ New Year',
    'sidebar.export': 'Export JSON',
    'sidebar.import': 'Import JSON',
    'sidebar.overview': 'Overview ({count})',

    // Toolbar
    'toolbar.search': 'Search title or artist…',
    'toolbar.all': 'All',
    'toolbar.allTags': 'All Tags',
    'toolbar.allScores': 'All Scores',
    'toolbar.count': '{total} albums',
    'toolbar.countFiltered': '{visible} / {total}',
    'toolbar.nr': 'NR / No Score',

    // Modal
    'modal.editTitle': 'Edit Album',
    'modal.addTitle': 'Add Album',
    'modal.title': 'Title',
    'modal.artist': 'Artist',
    'modal.score': 'Score',
    'modal.date': 'Date',
    'modal.scoreNote': 'Score Note',
    'modal.tags': 'Tags',
    'modal.aoty': 'Album of the Year',
    'modal.section': 'Add to Section',
    'modal.notes': 'Notes',
    'modal.trackRatings': 'Track Ratings',
    'modal.review': 'Review / AOTY Write-up',
    'modal.cancel': 'Cancel',
    'modal.delete': 'Delete',
    'modal.save': 'Save',
    'modal.addTrack': '+ Add Track',
    'modal.trackSummary': '{count} track{plural} · {rated} rated · avg {avg}',
    'modal.placeholder.title': 'Album title…',
    'modal.placeholder.artist': 'Artist name…',
    'modal.placeholder.score': '0–100',
    'modal.placeholder.date': 'MM.DD',
    'modal.placeholder.note': 'e.g. Top1, NR…',
    'modal.placeholder.notes': 'Additional notes…',
    'modal.placeholder.track': 'Track name…',
    'modal.placeholder.review': 'Write your review here…',
    'modal.placeholder.select': 'Select…',

    // Dynamic content
    'content.sectionTitle': '{year} Albums/Mixtapes, etc. Ratings',
    'content.showMore': 'Show more',
    'content.showLess': 'Show less',
    'content.mustHear': '★Must Hear Album',
    'content.trackTooltip': 'Track ratings',
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
    'tooltip.darkMode': 'Dark Mode',
    'tooltip.lightMode': 'Light Mode',
    'tooltip.glass': 'Glassmorphism',
    'tooltip.solid': 'Solid Style',
    'tooltip.lang': '中文',
  },

  zh: {
    // Sidebar
    'sidebar.title': '乐评档案',
    'sidebar.subtitle': '1960年代–现在',
    'sidebar.newYear': '+ 新年份',
    'sidebar.export': '导出 JSON',
    'sidebar.import': '导入 JSON',
    'sidebar.overview': '概览 ({count})',

    // Toolbar
    'toolbar.search': '搜索标题或艺术家…',
    'toolbar.all': '全部',
    'toolbar.allTags': '全部标签',
    'toolbar.allScores': '所有分数',
    'toolbar.count': '共 {total} 张',
    'toolbar.countFiltered': '{visible} / {total}',
    'toolbar.nr': 'NR / 无分数',

    // Modal
    'modal.editTitle': '编辑专辑',
    'modal.addTitle': '添加专辑',
    'modal.title': '标题',
    'modal.artist': '艺术家',
    'modal.score': '分数',
    'modal.date': '日期',
    'modal.scoreNote': '分数备注',
    'modal.tags': '标签',
    'modal.aoty': '年度专辑',
    'modal.section': '添加到分组',
    'modal.notes': '备注',
    'modal.trackRatings': '曲目评分',
    'modal.review': '乐评 / 年度专辑文章',
    'modal.cancel': '取消',
    'modal.delete': '删除',
    'modal.save': '保存',
    'modal.addTrack': '+ 添加曲目',
    'modal.trackSummary': '{count} 首曲 · {rated} 首有分 · 平均 {avg}',
    'modal.placeholder.title': '专辑名称…',
    'modal.placeholder.artist': '艺术家名称…',
    'modal.placeholder.score': '0–100',
    'modal.placeholder.date': 'MM.DD',
    'modal.placeholder.note': '例如 Top1、NR…',
    'modal.placeholder.notes': '附加备注…',
    'modal.placeholder.track': '曲目名称…',
    'modal.placeholder.review': '在此写你的乐评…',
    'modal.placeholder.select': '选择…',

    // Dynamic content
    'content.sectionTitle': '{year} 年专辑/混合带/等 评分',
    'content.showMore': '展开更多',
    'content.showLess': '收起',
    'content.mustHear': '★必听专辑',
    'content.trackTooltip': '曲目评分',
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
  document.getElementById('langToggle').title = t('tooltip.lang');
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('lang', currentLang);
  applyLang();
  applyTheme();
  // 重渲染动态内容
  renderSidebar();
  renderContent();
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
}

// 读取持久化语言偏好，默认英文
currentLang = localStorage.getItem('lang') || 'en';
