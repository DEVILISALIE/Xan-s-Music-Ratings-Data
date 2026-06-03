// Global state
let currentLang = 'en';
let appData = null;
let entryIndex = new Map();
let currentFilter = [];
let currentScoreFilter = 'all';
let searchQuery = '';
let editingEntry = null;
let editingGroupId = null;
let editingTracks = [];
let mustHearThreshold = parseInt(localStorage.getItem('mustHearThreshold')) || 80;
let mustHearEnabled = localStorage.getItem('mustHearEnabled') !== 'false';

// 批量操作状态
let batchMode = false;
let batchSelectedIds = new Set();
