// State management
let state = {
  activeBoardId: localStorage.getItem('skillforge_active_board') || 'board-tech',
  boards: [],
  skills: [],
  dependencies: [],
  categories: [],
  currentView: 'tree',
  activeSkillId: null,
  activeDetail: null,
  currentDetailTab: 'milestones',
  categoryFilter: 'all',
  searchQuery: '',
  selectMode: false,
  selectedSkillIds: new Set(),
  treePan: {
    x: 80,
    y: 80,
    scale: 0.9,
    isDragging: false,
    startX: 0,
    startY: 0
  },
  nodePositions: {},
  gridSnap: localStorage.getItem('skillforge_grid_snap') === 'true',
  lockLayout: localStorage.getItem('skillforge_lock_layout') === 'true',
  highlightedSkillId: null
};

const API_BASE = '/api';

function safeCreateIcons() {
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.warn('Lucide icon error:', err);
  }
}

const THEMES = {
  dark: 'Dark Mode (Void)',
  light: 'Clean Light',
  gray: 'Slightly Gray (Graphite)',
  sunset: 'Sunset Twilight',
  midnight: 'Midnight Cyber',
  forest: 'Nordic Pine'
};

async function initTheme() {
  const savedTheme = localStorage.getItem('skillforge_theme') || 'dark';
  setTheme(savedTheme, false);

  // Sync with backend SQLite database
  try {
    const res = await fetch(`${API_BASE}/settings`);
    if (res.ok) {
      const settings = await res.json();
      if (settings && settings.theme) {
        localStorage.setItem('skillforge_theme', settings.theme);
        setTheme(settings.theme, false);
      }
    }
  } catch (err) {
    // Backend offline or loading
  }
}

function setTheme(themeName, persist = true) {
  if (!THEMES[themeName]) themeName = 'dark';
  document.documentElement.setAttribute('data-theme', themeName);
  if (persist) {
    localStorage.setItem('skillforge_theme', themeName);
    // Persist to backend SQLite
    fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'theme', value: themeName })
    }).catch(err => console.warn('Failed to save theme setting:', err));
  }

  const label = document.getElementById('active-theme-label');
  if (label) {
    label.innerText = `${THEMES[themeName]} Active`;
  }

  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.remove('ring-2', 'ring-brand-500', 'border-brand-500', 'bg-brand-500/10');
    const check = card.querySelector('.theme-check-icon');
    if (check) check.classList.add('hidden');
  });

  const activeCard = document.getElementById(`theme-card-${themeName}`);
  if (activeCard) {
    activeCard.classList.add('ring-2', 'ring-brand-500', 'border-brand-500', 'bg-brand-500/10');
    const check = activeCard.querySelector('.theme-check-icon');
    if (check) check.classList.remove('hidden');
  }

  safeCreateIcons();
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const currentTheme = localStorage.getItem('skillforge_theme') || 'dark';
    setTheme(currentTheme, false);
    safeCreateIcons();
  }
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

let stagedBackupData = null;

// Export full database backup
async function exportFullBackup() {
  try {
    const res = await fetch(`${API_BASE}/backup/export`);
    if (!res.ok) throw new Error('Backup failed to generate');
    const data = await res.json();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `skillforge_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed:', err);
    alert('Failed to export full database backup.');
  }
}

// Drag and drop event handlers
function onBackupDragOver(e) {
  e.preventDefault();
  const dropzone = document.getElementById('backup-dropzone');
  if (dropzone) {
    dropzone.classList.add('border-brand-500', 'bg-brand-500/10');
  }
}

function onBackupDragLeave(e) {
  e.preventDefault();
  const dropzone = document.getElementById('backup-dropzone');
  if (dropzone) {
    dropzone.classList.remove('border-brand-500', 'bg-brand-500/10');
  }
}

function onBackupDrop(e) {
  e.preventDefault();
  const dropzone = document.getElementById('backup-dropzone');
  if (dropzone) {
    dropzone.classList.remove('border-brand-500', 'bg-brand-500/10');
  }
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    processBackupFile(files[0]);
  }
}

function handleBackupFileSelect(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    processBackupFile(files[0]);
  }
}

function processBackupFile(file) {
  const feedback = document.getElementById('backup-import-feedback');
  if (feedback) feedback.classList.add('hidden');

  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    showImportFeedback('error', 'Please choose a valid .json backup file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const tables = parsed.tables || parsed;

      const boardsCount = Array.isArray(tables.boards) ? tables.boards.length : 0;
      const catsCount = Array.isArray(tables.categories) ? tables.categories.length : 0;
      const skillsCount = Array.isArray(tables.skills) ? tables.skills.length : 0;
      const milesCount = Array.isArray(tables.milestones) ? tables.milestones.length : 0;

      if (!skillsCount && !boardsCount && !catsCount) {
        showImportFeedback('error', 'No recognizable SkillForge boards or skills found in this file.');
        return;
      }

      stagedBackupData = parsed;

      // Update UI preview elements
      document.getElementById('staged-file-name').innerText = file.name;
      document.getElementById('staged-file-size').innerText = `${(file.size / 1024).toFixed(1)} KB`;
      document.getElementById('staged-boards-count').innerText = boardsCount;
      document.getElementById('staged-cats-count').innerText = catsCount;
      document.getElementById('staged-skills-count').innerText = skillsCount;
      document.getElementById('staged-miles-count').innerText = milesCount;

      document.getElementById('backup-dropzone').classList.add('hidden');
      document.getElementById('backup-staged-box').classList.remove('hidden');
      safeCreateIcons();
    } catch (err) {
      console.error('Invalid JSON file:', err);
      showImportFeedback('error', 'Malformed JSON file. Could not parse.');
    }
  };
  reader.readAsText(file);
}

function cancelStagedBackup() {
  stagedBackupData = null;
  const input = document.getElementById('backup-file-input');
  if (input) input.value = '';
  document.getElementById('backup-dropzone').classList.remove('hidden');
  document.getElementById('backup-staged-box').classList.add('hidden');
  const feedback = document.getElementById('backup-import-feedback');
  if (feedback) feedback.classList.add('hidden');
}

async function confirmImportBackup() {
  if (!stagedBackupData) return;

  const modeRadio = document.querySelector('input[name="import-mode"]:checked');
  const mode = modeRadio ? modeRadio.value : 'merge';

  if (mode === 'overwrite') {
    if (!confirm('CAUTION: Clean Restore will replace your entire current database with this backup. Continue?')) {
      return;
    }
  }

  const btn = document.getElementById('confirm-import-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Importing...</span>';
  }

  try {
    const res = await fetch(`${API_BASE}/backup/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: stagedBackupData, mode })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Import failed');
    }

    const sm = result.summary;
    const msg = `Successfully imported! (${sm.boards} boards, ${sm.skills} skills, ${sm.categories} domains, ${sm.milestones} milestones).`;
    showImportFeedback('success', msg);

    // Refresh database and views
    await refreshData();
    cancelStagedBackup();

    setTimeout(() => {
      closeSettingsModal();
    }, 1500);
  } catch (err) {
    console.error('Import failed:', err);
    showImportFeedback('error', `Import failed: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i><span>Confirm & Import Data</span>';
      safeCreateIcons();
    }
  }
}

function showImportFeedback(type, message) {
  const el = document.getElementById('backup-import-feedback');
  if (!el) return;
  el.classList.remove('hidden', 'bg-rose-500/10', 'text-rose-400', 'border-rose-500/30', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
  if (type === 'error') {
    el.classList.add('bg-rose-500/10', 'text-rose-400', 'border', 'border-rose-500/30');
  } else {
    el.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/30');
  }
  el.innerText = message;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupEventListeners();
  initSmoothScrollingEngine();
  await refreshData();
  setupPanZoom();
  safeCreateIcons();
});

// Butter-smooth desktop inertia wheel scrolling for lists and views
function initSmoothScrollingEngine() {
  let activeAnim = null;
  let targetScrollY = 0;
  let targetScrollX = 0;
  let activeElement = null;

  window.addEventListener('wheel', (e) => {
    // Tech tree canvas handles its own zoom/pan
    if (e.target.closest('#tech-tree-viewport')) return;

    // Locate closest scrollable container
    let el = e.target;
    let scrollable = null;
    while (el && el !== document.body && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      const isScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      const isScrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
      if (isScrollY || isScrollX) {
        scrollable = el;
        break;
      }
      el = el.parentElement;
    }

    if (!scrollable) return;

    // Support Shift+Wheel for horizontal scrolling
    const deltaY = e.shiftKey ? 0 : e.deltaY;
    const deltaX = e.shiftKey ? e.deltaY : e.deltaX;

    const canScrollY = deltaY < 0 ? scrollable.scrollTop > 0 : (deltaY > 0 ? scrollable.scrollTop < (scrollable.scrollHeight - scrollable.clientHeight - 1) : false);
    const canScrollX = deltaX < 0 ? scrollable.scrollLeft > 0 : (deltaX > 0 ? scrollable.scrollLeft < (scrollable.scrollWidth - scrollable.clientWidth - 1) : false);

    if (!canScrollY && !canScrollX) return;

    e.preventDefault();

    if (activeElement !== scrollable) {
      activeElement = scrollable;
      targetScrollY = scrollable.scrollTop;
      targetScrollX = scrollable.scrollLeft;
    }

    // Responsive notch step distance
    const stepDistance = 110;
    const stepY = deltaY === 0 ? 0 : (deltaY > 0 ? stepDistance : -stepDistance);
    const stepX = deltaX === 0 ? 0 : (deltaX > 0 ? stepDistance : -stepDistance);

    targetScrollY = Math.max(0, Math.min(scrollable.scrollHeight - scrollable.clientHeight, targetScrollY + stepY));
    targetScrollX = Math.max(0, Math.min(scrollable.scrollWidth - scrollable.clientWidth, targetScrollX + stepX));

    if (!activeAnim) {
      const animate = () => {
        if (!activeElement) {
          activeAnim = null;
          return;
        }

        const currentY = activeElement.scrollTop;
        const currentX = activeElement.scrollLeft;
        const diffY = targetScrollY - currentY;
        const diffX = targetScrollX - currentX;

        if (Math.abs(diffY) < 0.6 && Math.abs(diffX) < 0.6) {
          activeElement.scrollTop = targetScrollY;
          activeElement.scrollLeft = targetScrollX;
          activeElement = null;
          activeAnim = null;
          return;
        }

        // Snappy 0.25 lerp starts on frame 0 (0ms latency) then decelerates smoothly
        activeElement.scrollTop = currentY + diffY * 0.25;
        activeElement.scrollLeft = currentX + diffX * 0.25;
        activeAnim = requestAnimationFrame(animate);
      };
      activeAnim = requestAnimationFrame(animate);
    }
  }, { passive: false });
}


function setupEventListeners() {
  document.getElementById('global-search').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderCurrentView();
  });
}

// Icon rendering helper (supports emojis, Unicode, and custom image Data URLs)
function renderSkillIcon(icon, sizeClass = 'w-5 h-5', extraClass = '') {
  const iconVal = icon || '🎯';
  if (typeof iconVal === 'string' && (iconVal.startsWith('data:image/') || iconVal.startsWith('http://') || iconVal.startsWith('https://') || iconVal.startsWith('/'))) {
    return `<img src="${iconVal}" alt="icon" class="inline-block object-cover rounded-md ${sizeClass} ${extraClass}" />`;
  }
  return `<span class="inline-flex items-center justify-center select-none ${extraClass}">${iconVal}</span>`;
}

// Icon Suggestions & Keyword Mapping
const ICON_SUGGESTIONS = {
  'board-tech': [
    '💻', '⚡', '🐍', '⚛️', '🦀', '🐳', '🌐', '🛡️',
    '🧠', '⚙️', '🤖', '📊', '🔥', '🚀', '🛠️', '📱',
    '💾', '📦', '🧪', '🔒', '💡', '🔍', '☁️', '☕'
  ],
  'board-fitness': [
    '🏋️‍♂️', '🏃‍♂️', '🥗', '💪', '🧘', '🚴', '🏊', '🥑',
    '🥩', '😴', '⏱️', '🥇', '🥊', '🧗', '🍎', '💧',
    '🤸', '❤️', '👟', '⚖️', '🔋', '🏆', '🎯', '🦵'
  ],
  'board-life': [
    '💰', '🗣️', '📚', '🎯', '🍳', '💡', '🧘‍♂️', '🤝',
    '⏰', '🌱', '✍️', '🎨', '💼', '🧭', '📈', '🔑',
    '🕊️', '🏡', '🌍', '🎸', '🧠', '☕', '🛠️', '📝'
  ],
  'board': [
    '✨', '📚', '🎨', '🍳', '🎵', '🗣️', '💼', '🚀',
    '🧠', '🛠️', '🌍', '🎮', '🥋', '📷', '☕', '🧪',
    '🏹', '⛵', '🗺️', '💡', '✍️', '🌱', '🏆', '🎯'
  ]
};

const KEYWORD_ICON_MAP = [
  { keywords: ['bench', 'squat', 'deadlift', 'lift', 'gym', 'weight', 'barbell', 'dumbbell', 'chest', 'strength'], icon: '🏋️‍♂️' },
  { keywords: ['run', 'sprint', 'cardio', 'jog', 'marathon', 'pace', 'treadmill'], icon: '🏃‍♂️' },
  { keywords: ['mobility', 'stretch', 'yoga', 'flexibility'], icon: '🧘' },
  { keywords: ['cycle', 'bike', 'biking', 'cycling'], icon: '🚴' },
  { keywords: ['swim', 'swimming', 'pool'], icon: '🏊' },
  { keywords: ['protein', 'diet', 'meal', 'nutrition', 'macros', 'keto', 'fasting', 'food', 'beef'], icon: '🥩' },
  { keywords: ['salad', 'greens', 'veg', 'vegan', 'avocado'], icon: '🥑' },
  { keywords: ['sleep', 'rest', 'recovery', 'circadian', 'nap'], icon: '😴' },
  { keywords: ['hydration', 'water', 'electrolytes'], icon: '💧' },
  { keywords: ['fight', 'boxing', 'bjj', 'mma', 'martial'], icon: '🥊' },
  { keywords: ['budget', 'money', 'invest', 'stock', 'finance', 'etf', 'index', 'crypto', 'savings', 'wealth', 'tax'], icon: '💰' },
  { keywords: ['speak', 'speech', 'talk', 'pitch', 'story', 'presentation', 'public', 'toastmaster'], icon: '🗣️' },
  { keywords: ['listen', 'active listening', 'negotiate', 'empathy', 'relationships'], icon: '🤝' },
  { keywords: ['write', 'blog', 'author', 'copywriting', 'essay', 'journal'], icon: '✍️' },
  { keywords: ['read', 'book', 'literature', 'study', 'learn'], icon: '📚' },
  { keywords: ['cook', 'chef', 'knife', 'pan', 'kitchen', 'recipe', 'bake', 'culinary', 'sauce'], icon: '🍳' },
  { keywords: ['music', 'song', 'guitar', 'piano', 'sing', 'instrument', 'chords', 'theory', 'audio'], icon: '🎵' },
  { keywords: ['tool', 'diy', 'repair', 'drywall', 'plumbing', 'solder', 'woodwork', 'hammer'], icon: '🛠️' },
  { keywords: ['deep work', 'focus', 'time', 'pomodoro', 'schedule', 'timeblock', 'productivity'], icon: '⏰' },
  { keywords: ['habit', 'routine', 'mindset', 'atomic'], icon: '🌱' },
  { keywords: ['meditation', 'stoic', 'mindfulness', 'calm', 'peace'], icon: '🧘‍♂️' },
  { keywords: ['art', 'draw', 'design', 'paint', 'sketch'], icon: '🎨' },
  { keywords: ['python', 'django', 'fastapi', 'flask', 'pandas'], icon: '🐍' },
  { keywords: ['react', 'next', 'vue', 'svelte', 'frontend', 'ui', 'css', 'tailwind'], icon: '⚛️' },
  { keywords: ['rust', 'cargo', 'tokio'], icon: '🦀' },
  { keywords: ['docker', 'kubernetes', 'k8s', 'container', 'devops'], icon: '🐳' },
  { keywords: ['database', 'sql', 'postgres', 'sqlite', 'mongo', 'redis', 'db'], icon: '💾' },
  { keywords: ['ai', 'ml', 'machine learning', 'deep learning', 'neural', 'llm', 'gpt', 'transformer'], icon: '🧠' },
  { keywords: ['security', 'auth', 'oauth', 'cryptography', 'cyber', 'pentest'], icon: '🛡️' },
  { keywords: ['go', 'golang'], icon: '🚀' },
  { keywords: ['typescript', 'javascript', 'node', 'web'], icon: '🌐' },
  { keywords: ['cloud', 'aws', 'azure', 'gcp', 'serverless'], icon: '☁️' },
  { keywords: ['api', 'rest', 'graphql', 'backend'], icon: '⚡' }
];

function renderSuggestedIconsPalette(context) {
  let gridId = 'modal-suggested-icons-grid';
  if (context === 'detail') gridId = 'detail-suggested-icons-grid';
  else if (context === 'board') gridId = 'board-suggested-icons-grid';

  const grid = document.getElementById(gridId);
  if (!grid) return;

  const currentBoard = state.activeBoardId || 'board-tech';
  const icons = context === 'board'
    ? (ICON_SUGGESTIONS['board'] || [])
    : (ICON_SUGGESTIONS[currentBoard] || ICON_SUGGESTIONS['board-tech']);

  grid.innerHTML = '';
  icons.forEach(ic => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-7 h-7 rounded-lg bg-surface-800 hover:bg-brand-600 hover:scale-110 flex items-center justify-center text-sm border border-surface-700/80 hover:border-brand-500 transition-all cursor-pointer';
    btn.innerHTML = ic;
    btn.title = `Select ${ic}`;
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectSuggestedIcon(ic, context, true);
    };
    grid.appendChild(btn);
  });
}

function onSkillNameInput(val, context) {
  const low = (val || '').toLowerCase().trim();
  if (!low) return;

  const match = KEYWORD_ICON_MAP.find(entry => entry.keywords.some(k => low.includes(k)));
  if (match) {
    selectSuggestedIcon(match.icon, context, false);
  }
}

function selectSuggestedIcon(icon, context, autoClose = true) {
  if (context === 'modal') {
    const valInput = document.getElementById('modal-skill-icon-val');
    const displayEl = document.getElementById('modal-skill-icon-display');
    if (valInput) valInput.value = icon;
    if (displayEl) displayEl.innerHTML = renderSkillIcon(icon, 'w-6 h-6');
  } else if (context === 'detail') {
    const valInput = document.getElementById('detail-skill-icon-val');
    const displayEl = document.getElementById('detail-skill-icon-display');
    if (valInput) valInput.value = icon;
    if (displayEl) displayEl.innerHTML = renderSkillIcon(icon, 'w-6 h-6');

    if (autoClose) {
      const box = document.getElementById('detail-icon-picker-box');
      if (box) box.classList.add('hidden');
    }

    if (state.activeSkillId) {
      saveSkillHeaderChanges({ icon });
    }
  } else if (context === 'board') {
    const valInput = document.getElementById('board-icon-val');
    const displayEl = document.getElementById('board-icon-display');
    if (valInput) valInput.value = icon;
    if (displayEl) displayEl.innerHTML = renderSkillIcon(icon, 'w-6 h-6');
    if (autoClose) {
      const box = document.getElementById('board-icon-picker-box');
      if (box) box.classList.add('hidden');
    }
  }
}

function toggleModalIconPalette() {
  const box = document.getElementById('modal-icon-picker-box');
  if (box) {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      renderSuggestedIconsPalette('modal');
    }
  }
}

function toggleDetailIconPalette() {
  const box = document.getElementById('detail-icon-picker-box');
  if (box) {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      renderSuggestedIconsPalette('detail');
      safeCreateIcons();
    }
  }
}

function toggleBoardIconPalette() {
  const box = document.getElementById('board-icon-picker-box');
  if (box) {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      renderSuggestedIconsPalette('board');
      safeCreateIcons();
    }
  }
}

function handleCustomIconUpload(event, context) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file (PNG, JPG, SVG, WebP).');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const rawDataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 96;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        }
      } else {
        if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const resizedDataUrl = canvas.toDataURL('image/png');
      selectSuggestedIcon(resizedDataUrl, context, true);
    };
    img.onerror = () => {
      selectSuggestedIcon(rawDataUrl, context, true);
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function switchBoard(boardId) {
  state.activeBoardId = boardId;
  localStorage.setItem('skillforge_active_board', boardId);
  state.selectedSkillIds.clear();
  state.categoryFilter = 'all';
  updateBoardTabsUI();
  refreshData();
}

function updateBoardTabsUI() {
  const container = document.getElementById('board-tabs-nav');
  if (!container) return;

  container.innerHTML = '';

  // Render button for each board dynamically
  state.boards.forEach(b => {
    const isActive = b.id === state.activeBoardId;
    const btn = document.createElement('button');
    btn.id = `board-tab-${b.id}`;
    btn.onclick = () => switchBoard(b.id);
    btn.className = isActive
      ? 'board-nav-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-white bg-brand-600 shadow-sm transition-all'
      : 'board-nav-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-slate-400 hover:text-slate-200 transition-all';
    
    btn.innerHTML = `
      <span class="text-sm flex-shrink-0">${renderSkillIcon(b.icon, 'w-4 h-4')}</span>
      <span class="hidden md:inline">${b.name}</span>
    `;
    container.appendChild(btn);
  });

  // Append "+ New Board" button (Approach B)
  const addBtn = document.createElement('button');
  addBtn.onclick = openNewBoardModal;
  addBtn.title = 'Create New Custom Board';
  addBtn.className = 'w-7 h-7 rounded-lg bg-surface-700/60 hover:bg-brand-600 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm transition-all ml-1 cursor-pointer';
  addBtn.innerHTML = '+';
  container.appendChild(addBtn);

  // Toggle custom board actions (Delete board button if not default)
  const customActions = document.getElementById('custom-board-actions');
  const isDefaultBoard = ['board-tech', 'board-fitness', 'board-life'].includes(state.activeBoardId);
  if (customActions) {
    if (!isDefaultBoard) {
      customActions.classList.remove('hidden');
    } else {
      customActions.classList.add('hidden');
    }
  }

  // Render Sub-Area Craft Pillars (Approach A)
  renderSubAreasNav();
}

function renderSubAreasNav() {
  const container = document.getElementById('subareas-pills-container');
  const label = document.getElementById('subareas-board-label');
  if (!container) return;

  const currentBoardObj = state.boards.find(b => b.id === state.activeBoardId);
  if (label && currentBoardObj) {
    label.innerText = currentBoardObj.id === 'board-life' ? 'Life Craft Pillars:' : `${currentBoardObj.name} Domains:`;
  }

  container.innerHTML = '';

  // 1. "All" Pill
  const isAll = state.categoryFilter === 'all';
  const allBtn = document.createElement('button');
  allBtn.onclick = () => selectSubArea('all');
  allBtn.className = isAll
    ? 'px-3 py-1 rounded-full text-xs font-bold bg-brand-600 text-white shadow-sm transition-all flex items-center gap-1 whitespace-nowrap'
    : 'px-3 py-1 rounded-full text-xs font-medium text-slate-300 bg-surface-800/90 hover:bg-surface-700 hover:text-white border border-surface-700/60 transition-all flex items-center gap-1 whitespace-nowrap';
  allBtn.innerHTML = `<span>🌟</span><span>All (${state.skills.length})</span>`;
  container.appendChild(allBtn);

  // 2. Individual Category / Pillar Pills
  state.categories.forEach(cat => {
    const isCatActive = state.categoryFilter === cat.id;
    const count = state.skills.filter(s => s.category_id === cat.id).length;
    const pill = document.createElement('button');
    pill.onclick = () => selectSubArea(cat.id);
    
    if (isCatActive) {
      pill.className = 'px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap border';
      pill.style.backgroundColor = cat.color;
      pill.style.borderColor = cat.color;
    } else {
      pill.className = 'px-3 py-1 rounded-full text-xs font-medium text-slate-300 bg-surface-800/90 hover:bg-surface-700 hover:text-white border border-surface-700/60 transition-all flex items-center gap-1.5 whitespace-nowrap';
    }

    pill.innerHTML = `
      <span class="w-2 h-2 rounded-full inline-block" style="background-color: ${cat.color}"></span>
      <span>${cat.name}</span>
      <span class="text-[10px] opacity-80 font-normal">(${count})</span>
    `;
    container.appendChild(pill);
  });
}

function selectSubArea(catId) {
  state.categoryFilter = catId;
  const selectDropdown = document.getElementById('category-filter');
  if (selectDropdown) {
    selectDropdown.value = catId;
  }
  renderSubAreasNav();
  renderCurrentView();
}

function onCategoryFilterChange() {
  state.categoryFilter = document.getElementById('category-filter').value;
  renderSubAreasNav();
  renderCurrentView();
}

// Custom Board Modal Handlers (Approach B)
function openNewBoardModal() {
  const modal = document.getElementById('new-board-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('board-name-input').value = '';
  document.getElementById('board-desc-input').value = '';
  document.getElementById('board-category-input').value = 'Core Fundamentals';
  selectSuggestedIcon('✨', 'board', true);
  renderSuggestedIconsPalette('board');
  safeCreateIcons();
}

function closeNewBoardModal() {
  const modal = document.getElementById('new-board-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitNewBoardModal() {
  const name = document.getElementById('board-name-input').value.trim();
  const icon = document.getElementById('board-icon-val').value || '✨';
  const desc = document.getElementById('board-desc-input').value.trim();
  const initialCategory = document.getElementById('board-category-input').value.trim() || 'Core Fundamentals';

  if (!name) {
    alert('Please enter a board name.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, icon, description: desc, initial_category: initialCategory })
    });

    const created = await res.json();
    closeNewBoardModal();
    state.activeBoardId = created.id;
    localStorage.setItem('skillforge_active_board', created.id);
    await refreshData();
  } catch (err) {
    console.error('Failed to create board:', err);
    alert('Could not create board.');
  }
}

async function deleteCurrentBoard() {
  const currentBoardObj = state.boards.find(b => b.id === state.activeBoardId);
  if (!currentBoardObj) return;

  if (['board-tech', 'board-fitness', 'board-life'].includes(currentBoardObj.id)) {
    alert('Default core boards cannot be deleted.');
    return;
  }

  if (!confirm(`Are you sure you want to permanently delete the "${currentBoardObj.name}" board and all its skills?`)) {
    return;
  }

  try {
    await fetch(`${API_BASE}/boards/${currentBoardObj.id}`, { method: 'DELETE' });
    state.activeBoardId = 'board-tech';
    localStorage.setItem('skillforge_active_board', 'board-tech');
    await refreshData();
  } catch (err) {
    console.error('Failed to delete board:', err);
    alert('Failed to delete board.');
  }
}

// Data Fetching
async function refreshData() {
  try {
    const boardParam = state.activeBoardId ? `?board_id=${encodeURIComponent(state.activeBoardId)}` : '';
    const [skillsRes, catRes, boardsRes] = await Promise.all([
      fetch(`${API_BASE}/skills${boardParam}`),
      fetch(`${API_BASE}/categories${boardParam}`),
      fetch(`${API_BASE}/boards`)
    ]);

    const skillsData = await skillsRes.json();
    const catData = await catRes.json();
    state.boards = await boardsRes.json().catch(() => []);

    state.skills = skillsData.skills || [];
    state.dependencies = skillsData.dependencies || [];
    state.categories = catData || [];

    updateBoardTabsUI();
    updateMetricsRibbon();
    populateCategoryDropdowns();
    renderSuggestedIconsPalette('modal');
    renderSuggestedIconsPalette('detail');
    renderCurrentView();
  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

function updateMetricsRibbon() {
  document.getElementById('metric-total-skills').innerText = state.skills.length;
  
  const activeCount = state.skills.filter(s => s.status === 'in_progress').length;
  document.getElementById('metric-active-skills').innerText = activeCount;

  const masteredCount = state.skills.filter(s => s.status === 'mastered').length;
  document.getElementById('metric-mastered-skills').innerText = masteredCount;

  const totalMinutes = state.skills.reduce((sum, s) => sum + (s.total_time_spent || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  document.getElementById('metric-total-hours').innerText = `${totalHours} hrs`;
}

function populateCategoryDropdowns() {
  const filterSelect = document.getElementById('category-filter');
  const modalSelect = document.getElementById('modal-skill-category');
  const batchCatSelect = document.getElementById('modal-batch-category');
  const detailSelect = document.getElementById('detail-skill-category');

  const prevFilterVal = filterSelect.value;
  filterSelect.innerHTML = '<option value="all">All Domains</option>';
  modalSelect.innerHTML = '';
  if (batchCatSelect) batchCatSelect.innerHTML = '';
  detailSelect.innerHTML = '';

  state.categories.forEach(cat => {
    const optFilter = document.createElement('option');
    optFilter.value = cat.id;
    optFilter.textContent = cat.name;
    filterSelect.appendChild(optFilter);

    const optModal = document.createElement('option');
    optModal.value = cat.id;
    optModal.textContent = cat.name;
    modalSelect.appendChild(optModal);

    if (batchCatSelect) {
      const optBatch = document.createElement('option');
      optBatch.value = cat.id;
      optBatch.textContent = cat.name;
      batchCatSelect.appendChild(optBatch);
    }

    const optDetail = document.createElement('option');
    optDetail.value = cat.id;
    optDetail.textContent = cat.name;
    detailSelect.appendChild(optDetail);
  });

  if (prevFilterVal) filterSelect.value = prevFilterVal;
}

function onCategoryFilterChange() {
  state.categoryFilter = document.getElementById('category-filter').value;
  renderCurrentView();
}

function getFilteredSkills() {
  return state.skills.filter(s => {
    const matchesCat = state.categoryFilter === 'all' || s.category_id === state.categoryFilter;
    const matchesSearch = !state.searchQuery || 
      s.name.toLowerCase().includes(state.searchQuery) ||
      (s.category_name && s.category_name.toLowerCase().includes(state.searchQuery)) ||
      (s.notes_content && s.notes_content.toLowerCase().includes(state.searchQuery));
    return matchesCat && matchesSearch;
  });
}

// Multi-Select & Batch Deletion
function toggleSelectMode(forceVal) {
  state.selectMode = forceVal !== undefined ? forceVal : !state.selectMode;
  if (!state.selectMode) {
    state.selectedSkillIds.clear();
  }
  updateSelectModeUI();
  renderCurrentView();
}

function updateSelectModeUI() {
  const btn = document.getElementById('toggle-select-mode-btn');
  const label = document.getElementById('select-mode-btn-label');
  const treeBtn = document.getElementById('tree-select-mode-btn');
  const treeLabel = document.getElementById('tree-select-mode-label');
  const bar = document.getElementById('batch-action-bar');
  const countEl = document.getElementById('batch-selected-count');
  const delBtn = document.getElementById('batch-delete-btn');
  const alignBtn = document.getElementById('batch-align-btn');
  const viewport = document.getElementById('tech-tree-viewport');

  if (!btn || !bar) return;

  if (state.selectMode) {
    btn.classList.add('bg-brand-600', 'text-white', 'border-brand-500');
    btn.classList.remove('bg-surface-800', 'text-slate-300');
    if (label) label.innerText = 'Exit Select';

    if (treeBtn && treeLabel) {
      treeBtn.classList.add('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
      treeLabel.innerText = 'Exit Box';
    }

    if (viewport) viewport.style.cursor = 'crosshair';

    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${state.selectedSkillIds.size} skills selected`;
    if (delBtn) delBtn.disabled = state.selectedSkillIds.size === 0;
    if (alignBtn) alignBtn.disabled = state.selectedSkillIds.size <= 1;
  } else {
    btn.classList.remove('bg-brand-600', 'text-white', 'border-brand-500');
    btn.classList.add('bg-surface-800', 'text-slate-300');
    if (label) label.innerText = 'Select Mode';

    if (treeBtn && treeLabel) {
      treeBtn.classList.remove('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
      treeLabel.innerText = 'Box Select';
    }

    if (viewport) viewport.style.cursor = 'grab';

    bar.classList.add('hidden');
  }
}

async function alignSelectedSkills() {
  const selectedSkills = state.skills.filter(s => state.selectedSkillIds.has(s.id));
  if (selectedSkills.length <= 1) return;

  let minX = Infinity;
  let minY = Infinity;
  selectedSkills.forEach(s => {
    const pos = state.nodePositions[s.id];
    if (pos) {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
    }
  });

  if (minX === Infinity) minX = 80;
  if (minY === Infinity) minY = 80;

  const colWidth = 290;
  const rowHeight = 130;
  const numCols = selectedSkills.length > 4 ? 2 : 1;

  const container = document.getElementById('tech-tree-nodes');
  const positionsToSave = {};

  selectedSkills.forEach((skill, idx) => {
    const col = idx % numCols;
    const row = Math.floor(idx / numCols);
    const targetX = minX + col * colWidth;
    const targetY = minY + row * rowHeight;

    skill.pos_x = targetX;
    skill.pos_y = targetY;
    if (state.nodePositions[skill.id]) {
      state.nodePositions[skill.id].x = targetX;
      state.nodePositions[skill.id].y = targetY;
    }
    positionsToSave[skill.id] = { x: targetX, y: targetY };

    if (container) {
      const el = container.querySelector(`[data-skill-id="${skill.id}"]`);
      if (el) {
        el.style.left = `${targetX}px`;
        el.style.top = `${targetY}px`;
      }
    }
  });

  renderTechTreeConnections();

  try {
    await fetch(`${API_BASE}/skills/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions: positionsToSave })
    });
  } catch (err) {
    console.warn('Failed to save aligned positions:', err);
  }
}

function toggleSkillSelection(skillId) {
  if (state.selectedSkillIds.has(skillId)) {
    state.selectedSkillIds.delete(skillId);
  } else {
    state.selectedSkillIds.add(skillId);
  }
  updateSelectModeUI();
  renderCurrentView();
}

function selectAllVisibleSkills() {
  const visible = getFilteredSkills();
  visible.forEach(s => state.selectedSkillIds.add(s.id));
  updateSelectModeUI();
  renderCurrentView();
}

function clearSelectedSkills() {
  state.selectedSkillIds.clear();
  updateSelectModeUI();
  renderCurrentView();
}

async function executeBatchDelete() {
  const count = state.selectedSkillIds.size;
  if (count === 0) return;
  if (!confirm(`Are you sure you want to permanently delete ${count} selected skill(s)? This will also clean up their prerequisites, milestones, and practice logs.`)) {
    return;
  }

  const ids = Array.from(state.selectedSkillIds);
  try {
    await fetch(`${API_BASE}/skills/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    state.selectedSkillIds.clear();
    await refreshData();
    updateSelectModeUI();
  } catch (err) {
    console.error('Batch delete failed:', err);
    alert('Failed to delete skills.');
  }
}

// Modal tab switcher
function switchModalTab(tab) {
  const singleForm = document.getElementById('modal-form-single');
  const batchForm = document.getElementById('modal-form-batch');
  const singleBtn = document.getElementById('modal-tab-single-btn');
  const batchBtn = document.getElementById('modal-tab-batch-btn');

  if (tab === 'single') {
    singleForm.classList.remove('hidden');
    batchForm.classList.add('hidden');
    singleBtn.classList.add('border-brand-500', 'text-white', 'font-bold');
    singleBtn.classList.remove('border-transparent', 'text-slate-400');
    batchBtn.classList.remove('border-brand-500', 'text-white', 'font-bold');
    batchBtn.classList.add('border-transparent', 'text-slate-400');
  } else {
    singleForm.classList.add('hidden');
    batchForm.classList.remove('hidden');
    batchBtn.classList.add('border-brand-500', 'text-white', 'font-bold');
    batchBtn.classList.remove('border-transparent', 'text-slate-400');
    singleBtn.classList.remove('border-brand-500', 'text-white', 'font-bold');
    singleBtn.classList.add('border-transparent', 'text-slate-400');
  }
}

async function submitBatchAddModal() {
  const namesRaw = document.getElementById('modal-batch-names').value;
  const catId = document.getElementById('modal-batch-category').value;
  const status = document.getElementById('modal-batch-status').value;

  const names = namesRaw
    .split('\n')
    .map(n => n.trim())
    .filter(n => n.length > 0);

  if (!names.length) {
    alert('Please enter at least one skill name.');
    return;
  }

  try {
    await fetch(`${API_BASE}/skills/batch-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names, category_id: catId, status })
    });
    closeNewSkillModal();
    document.getElementById('modal-batch-names').value = '';
    await refreshData();
  } catch (err) {
    console.error('Batch add failed:', err);
    alert('Failed to batch add skills.');
  }
}

// View Switching
function switchView(viewName) {
  state.currentView = viewName;
  
  ['tree', 'spider', 'kanban', 'table'].forEach(v => {
    const sec = document.getElementById(`view-${v}`);
    const btn = document.getElementById(`tab-btn-${v}`);
    if (v === viewName) {
      sec.classList.remove('hidden');
      btn.classList.add('bg-brand-600', 'text-white', 'shadow-sm');
      btn.classList.remove('text-slate-400');
    } else {
      sec.classList.add('hidden');
      btn.classList.remove('bg-brand-600', 'text-white', 'shadow-sm');
      btn.classList.add('text-slate-400');
    }
  });

  renderCurrentView();
}

function renderCurrentView() {
  if (state.currentView === 'tree') renderTechTree();
  else if (state.currentView === 'spider') renderSpiderChart();
  else if (state.currentView === 'kanban') renderKanbanBoard();
  else if (state.currentView === 'table') renderTableView();
  safeCreateIcons();
}

// ==========================================
// 1. TECH TREE VISUALIZATION & FREEFORM ARRANGER
// ==========================================

let positionSaveTimeout = null;
let pendingPositionUpdates = {};

function debouncedSavePosition(skillId, x, y) {
  pendingPositionUpdates[skillId] = { x, y };
  debouncedSavePositions();
}

function debouncedSavePositions() {
  clearTimeout(positionSaveTimeout);
  positionSaveTimeout = setTimeout(async () => {
    const toSave = { ...pendingPositionUpdates };
    pendingPositionUpdates = {};
    if (Object.keys(toSave).length === 0) return;
    try {
      await fetch(`${API_BASE}/skills/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: toSave })
      });
    } catch (err) {
      console.warn('Failed to save skill positions:', err);
    }
  }, 400);
}

function toggleGridSnap() {
  state.gridSnap = !state.gridSnap;
  localStorage.setItem('skillforge_grid_snap', state.gridSnap);
  const btn = document.getElementById('grid-snap-btn');
  const label = document.getElementById('grid-snap-label');
  if (btn && label) {
    if (state.gridSnap) {
      label.innerText = 'Snap: On (20px)';
      btn.classList.add('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
    } else {
      label.innerText = 'Snap: Off';
      btn.classList.remove('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
    }
  }
}

function toggleLockLayout() {
  state.lockLayout = !state.lockLayout;
  localStorage.setItem('skillforge_lock_layout', state.lockLayout);
  const btn = document.getElementById('lock-layout-btn');
  const icon = document.getElementById('lock-layout-icon');
  if (btn && icon) {
    if (state.lockLayout) {
      btn.title = 'Layout Locked (click to unlock for dragging)';
      icon.setAttribute('data-lucide', 'lock');
      icon.className = 'w-3.5 h-3.5 text-amber-400';
    } else {
      btn.title = 'Layout Unlocked (cards can be arranged freely)';
      icon.setAttribute('data-lucide', 'unlock');
      icon.className = 'w-3.5 h-3.5 text-emerald-400';
    }
    safeCreateIcons();
  }
  // Update node cursor styling
  document.querySelectorAll('.skill-node-card').forEach(card => {
    if (state.lockLayout) {
      card.classList.remove('cursor-grab', 'active:cursor-grabbing');
      card.classList.add('cursor-pointer');
    } else {
      card.classList.remove('cursor-pointer');
      card.classList.add('cursor-grab');
    }
  });
}

async function autoLayoutTechTree() {
  const skills = state.skills;
  if (!skills.length) return;

  // Compute topological progression rank
  const rankMap = {};
  skills.forEach(s => rankMap[s.id] = 0);

  for (let iter = 0; iter < 8; iter++) {
    state.dependencies.forEach(dep => {
      const pRank = rankMap[dep.prerequisite_id] || 0;
      if (rankMap[dep.dependent_id] <= pRank) {
        rankMap[dep.dependent_id] = pRank + 1;
      }
    });
  }

  const columns = {};
  skills.forEach(s => {
    const r = rankMap[s.id] || 0;
    columns[r] = columns[r] || [];
    columns[r].push(s);
  });

  const colWidth = 340;
  const nodeHeight = 110;
  const gapY = 32;
  const positionsMap = {};

  Object.keys(columns).sort((a, b) => a - b).forEach(rank => {
    const colSkills = columns[rank];
    const x = parseInt(rank) * colWidth + 80;
    colSkills.forEach((skill, idx) => {
      const y = idx * (nodeHeight + gapY) + 80;
      skill.pos_x = x;
      skill.pos_y = y;
      positionsMap[skill.id] = { x, y };
      if (state.nodePositions[skill.id]) {
        state.nodePositions[skill.id].x = x;
        state.nodePositions[skill.id].y = y;
      }
    });
  });

  // Animate node positions
  const cards = document.querySelectorAll('.skill-node-card');
  cards.forEach(card => {
    card.style.transition = 'left 0.35s cubic-bezier(0.25, 1, 0.5, 1), top 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
    const skillId = card.getAttribute('data-skill-id');
    if (positionsMap[skillId]) {
      card.style.left = `${positionsMap[skillId].x}px`;
      card.style.top = `${positionsMap[skillId].y}px`;
    }
  });

  // Redraw SVG connections dynamically during & after animation
  const animInterval = setInterval(renderTechTreeConnections, 50);
  setTimeout(() => {
    clearInterval(animInterval);
    cards.forEach(card => card.style.transition = '');
    renderTechTreeConnections();
  }, 380);

  // Persist updated positions in backend SQLite
  try {
    await fetch(`${API_BASE}/skills/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions: positionsMap })
    });
  } catch (err) {
    console.warn('Failed to save auto-layout positions:', err);
  }
}

function renderTechTree() {
  const container = document.getElementById('tech-tree-nodes');
  const svgGroup = document.getElementById('svg-connections');
  container.innerHTML = '';
  svgGroup.innerHTML = '';

  const skills = state.skills;
  if (!skills.length) return;

  // Initialize button states
  const snapBtn = document.getElementById('grid-snap-btn');
  const snapLabel = document.getElementById('grid-snap-label');
  if (snapBtn && snapLabel) {
    if (state.gridSnap) {
      snapLabel.innerText = 'Snap: On (20px)';
      snapBtn.classList.add('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
    } else {
      snapLabel.innerText = 'Snap: Off';
      snapBtn.classList.remove('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
    }
  }

  const lockBtn = document.getElementById('lock-layout-btn');
  const lockIcon = document.getElementById('lock-layout-icon');
  if (lockBtn && lockIcon) {
    if (state.lockLayout) {
      lockBtn.title = 'Layout Locked (click to unlock)';
      lockIcon.setAttribute('data-lucide', 'lock');
      lockIcon.className = 'w-3.5 h-3.5 text-amber-400';
    } else {
      lockBtn.title = 'Layout Unlocked (drag cards freely)';
      lockIcon.setAttribute('data-lucide', 'unlock');
      lockIcon.className = 'w-3.5 h-3.5 text-emerald-400';
    }
    safeCreateIcons();
  }

  // Calculate default progression layout if skills lack custom positions
  const rankMap = {};
  skills.forEach(s => rankMap[s.id] = 0);
  for (let iter = 0; iter < 8; iter++) {
    state.dependencies.forEach(dep => {
      const pRank = rankMap[dep.prerequisite_id] || 0;
      if (rankMap[dep.dependent_id] <= pRank) {
        rankMap[dep.dependent_id] = pRank + 1;
      }
    });
  }

  const columns = {};
  skills.forEach(s => {
    const r = rankMap[s.id] || 0;
    columns[r] = columns[r] || [];
    columns[r].push(s);
  });

  const colWidth = 340;
  const nodeHeight = 110;
  const gapY = 32;

  // Map of skill positions
  state.nodePositions = {};

  skills.forEach(skill => {
    let posX = skill.pos_x;
    let posY = skill.pos_y;

    // If no custom position, derive from rank
    if (posX == null || posY == null) {
      const r = rankMap[skill.id] || 0;
      const col = columns[r] || [];
      const idx = col.findIndex(s => s.id === skill.id);
      posX = r * colWidth + 80;
      posY = Math.max(0, idx) * (nodeHeight + gapY) + 80;
      skill.pos_x = posX;
      skill.pos_y = posY;
    }

    state.nodePositions[skill.id] = {
      x: posX,
      y: posY,
      width: 260,
      height: nodeHeight
    };
  });

  // Render Skill Node Cards
  skills.forEach(skill => {
    const pos = state.nodePositions[skill.id];
    const isDimmed = (state.categoryFilter !== 'all' && skill.category_id !== state.categoryFilter) ||
                     (state.searchQuery && !skill.name.toLowerCase().includes(state.searchQuery));

    // Status styling
    let statusBorder = 'border-slate-700/80 hover:border-brand-500';
    let statusBadge = '';
    if (skill.status === 'mastered') {
      statusBorder = 'border-emerald-500/80 shadow-emerald-500/10 shadow-lg';
      statusBadge = '<span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">👑 Mastered</span>';
    } else if (skill.status === 'in_progress') {
      statusBorder = 'border-amber-500/80 shadow-amber-500/10 shadow-lg';
      statusBadge = '<span class="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">⚡ Active</span>';
    } else {
      statusBorder = 'border-slate-700/60 bg-surface-850/60';
      statusBadge = '<span class="text-[10px] font-bold text-slate-400 bg-surface-700/50 px-1.5 py-0.5 rounded">🎯 Backlog</span>';
    }

    // Prerequisite Progression indicator
    const prereqDeps = state.dependencies.filter(d => d.dependent_id === skill.id);
    const totalPrereqs = prereqDeps.length;
    let prereqBadge = '';
    if (totalPrereqs > 0) {
      const completedPrereqs = prereqDeps.filter(d => {
        const p = state.skills.find(x => x.id === d.prerequisite_id);
        return p && p.status === 'mastered';
      }).length;

      if (completedPrereqs === totalPrereqs) {
        prereqBadge = '<span class="text-[9px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-0.5">🔓 Unlocked</span>';
      } else {
        prereqBadge = `<span class="text-[9px] text-slate-400 font-semibold px-1.5 py-0.5 rounded bg-surface-800 border border-surface-700 flex items-center gap-0.5">🔒 Req: ${completedPrereqs}/${totalPrereqs}</span>`;
      }
    }

    const isSelected = state.selectedSkillIds.has(skill.id);
    let selectStyle = '';
    if (isSelected) {
      selectStyle = 'ring-2 ring-brand-400 bg-brand-500/15 border-brand-400/90 shadow-brand-500/20 shadow-lg';
    } else if (state.selectMode) {
      selectStyle = 'hover:ring-1 hover:ring-brand-400';
    }

    const cursorClass = state.lockLayout ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing';

    const nodeEl = document.createElement('div');
    nodeEl.className = `skill-node-card absolute rounded-2xl p-3.5 bg-surface-850 border select-none group hover:scale-[1.02] hover:z-30 ${cursorClass} ${statusBorder} ${selectStyle} ${isDimmed ? 'opacity-25 hover:opacity-100' : ''}`;
    nodeEl.setAttribute('data-skill-id', skill.id);
    nodeEl.style.left = `${pos.x}px`;
    nodeEl.style.top = `${pos.y}px`;
    nodeEl.style.width = '260px';
    nodeEl.style.minHeight = `${nodeHeight}px`;

    const checkboxHtml = (state.selectMode || isSelected) ? `
      <div class="mr-1.5 flex items-center">
        <input type="checkbox" ${isSelected ? 'checked' : ''} class="w-4 h-4 rounded text-brand-500 bg-surface-900 border-surface-600 pointer-events-none accent-brand-500" />
      </div>
    ` : '';

    nodeEl.innerHTML = `
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex items-center gap-2 overflow-hidden">
          ${checkboxHtml}
          <span class="text-xl flex-shrink-0 flex items-center justify-center">${renderSkillIcon(skill.icon, 'w-6 h-6')}</span>
          <span class="font-bold text-xs text-white truncate group-hover:text-brand-300 transition-colors">${skill.name}</span>
        </div>
        ${statusBadge}
      </div>
      
      <div class="flex items-center justify-between text-[11px] text-slate-400 mb-2">
        <span class="truncate px-1.5 py-0.5 rounded text-[10px] font-semibold" style="background-color: ${skill.category_color}22; color: ${skill.category_color}">
          ${skill.category_name}
        </span>
        <div class="flex items-center gap-1.5">
          ${prereqBadge}
          <span class="capitalize font-medium text-slate-300">${skill.proficiency_tier}</span>
        </div>
      </div>

      <div class="w-full bg-surface-700/70 rounded-full h-1.5 overflow-hidden">
        <div class="h-full rounded-full transition-all duration-300" 
             style="width: ${skill.progress_pct || 0}%; background-color: ${skill.category_color || '#6366f1'}">
        </div>
      </div>

      <div class="flex items-center justify-between text-[10px] text-slate-500 mt-2">
        <span>${skill.completed_milestones || 0}/${skill.total_milestones || 0} milestones</span>
        <span>${((skill.total_time_spent || 0) / 60).toFixed(1)} hrs</span>
      </div>
    `;

    // Pathway Hover Highlighting
    nodeEl.addEventListener('mouseenter', () => {
      state.highlightedSkillId = skill.id;
      renderTechTreeConnections();
    });

    nodeEl.addEventListener('mouseleave', () => {
      state.highlightedSkillId = null;
      renderTechTreeConnections();
    });

    // Freeform Dragging Event Handler (Single or Multi-Node Group Drag)
    nodeEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, select, input, a, [contenteditable="true"]')) return;

      e.stopPropagation();

      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      let hasDragged = false;

      // Determine moving cards group:
      const isThisSelected = state.selectedSkillIds.has(skill.id);
      let movingIds;
      if (isThisSelected && state.selectedSkillIds.size > 1) {
        movingIds = Array.from(state.selectedSkillIds);
      } else if (state.selectMode || e.shiftKey) {
        state.selectedSkillIds.add(skill.id);
        movingIds = Array.from(state.selectedSkillIds);
        updateSelectModeUI();
      } else {
        if (state.selectedSkillIds.size > 0) {
          state.selectedSkillIds.clear();
          updateSelectModeUI();
        }
        movingIds = [skill.id];
      }

      // Record initial positions & cache DOM elements
      const startPositions = {};
      const cardDomElements = {};
      movingIds.forEach(id => {
        const p = state.nodePositions[id];
        if (p) {
          startPositions[id] = { x: p.x, y: p.y };
          const el = container.querySelector(`[data-skill-id="${id}"]`);
          if (el) {
            cardDomElements[id] = el;
            el.style.zIndex = '50';
            el.classList.add('shadow-2xl', 'ring-2', 'ring-brand-400');
          }
        }
      });

      const onNodeMouseMove = (moveEvt) => {
        if (state.lockLayout) return;

        let dx = (moveEvt.clientX - startMouseX) / state.treePan.scale;
        let dy = (moveEvt.clientY - startMouseY) / state.treePan.scale;

        if (Math.hypot(dx, dy) > 4) {
          hasDragged = true;
        }

        if (!hasDragged) return;

        if (state.gridSnap) {
          dx = Math.round(dx / 20) * 20;
          dy = Math.round(dy / 20) * 20;
        }

        // Move all cards in movingIds together, preserving relative offsets
        movingIds.forEach(id => {
          const initPos = startPositions[id];
          if (!initPos) return;

          let targetX = initPos.x + dx;
          let targetY = initPos.y + dy;

          targetX = Math.max(20, Math.min(3700, targetX));
          targetY = Math.max(20, Math.min(2800, targetY));

          const el = cardDomElements[id];
          if (el) {
            el.style.left = `${targetX}px`;
            el.style.top = `${targetY}px`;
          }

          if (state.nodePositions[id]) {
            state.nodePositions[id].x = targetX;
            state.nodePositions[id].y = targetY;
          }
        });

        renderTechTreeConnections();
      };

      const onNodeMouseUp = () => {
        window.removeEventListener('mousemove', onNodeMouseMove);
        window.removeEventListener('mouseup', onNodeMouseUp);

        movingIds.forEach(id => {
          const el = cardDomElements[id];
          if (el) {
            el.style.zIndex = '';
            el.classList.remove('shadow-2xl', 'ring-2', 'ring-brand-400');
          }
        });

        if (hasDragged) {
          movingIds.forEach(id => {
            const sk = state.skills.find(s => s.id === id);
            if (sk && state.nodePositions[id]) {
              sk.pos_x = state.nodePositions[id].x;
              sk.pos_y = state.nodePositions[id].y;
              pendingPositionUpdates[id] = { x: sk.pos_x, y: sk.pos_y };
            }
          });
          debouncedSavePositions();
        } else {
          // Normal click (not a drag)
          if (state.selectMode || e.shiftKey) {
            toggleSkillSelection(skill.id);
          } else {
            openDetailDrawer(skill.id);
          }
        }
      };

      window.addEventListener('mousemove', onNodeMouseMove);
      window.addEventListener('mouseup', onNodeMouseUp);
    });

    container.appendChild(nodeEl);
  });

  renderTechTreeConnections();
}

// Render dynamic SVG connection arrows between skills
function renderTechTreeConnections() {
  const svgGroup = document.getElementById('svg-connections');
  if (!svgGroup) return;
  svgGroup.innerHTML = '';

  const nodePositions = state.nodePositions || {};
  const highlightedId = state.highlightedSkillId;

  state.dependencies.forEach(dep => {
    const fromPos = nodePositions[dep.prerequisite_id];
    const toPos = nodePositions[dep.dependent_id];

    if (!fromPos || !toPos) return;

    const w1 = fromPos.width || 260;
    const h1 = fromPos.height || 110;
    const w2 = toPos.width || 260;
    const h2 = toPos.height || 110;

    const c1x = fromPos.x + w1 / 2;
    const c1y = fromPos.y + h1 / 2;
    const c2x = toPos.x + w2 / 2;
    const c2y = toPos.y + h2 / 2;

    const dx = c2x - c1x;
    const dy = c2y - c1y;

    let startX, startY, endX, endY, d;

    // Smart cardinal edge anchoring
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        // Target is right of source
        startX = fromPos.x + w1;
        startY = c1y;
        endX = toPos.x;
        endY = c2y;
        const cOffset = Math.max(30, Math.abs(endX - startX) * 0.5);
        d = `M ${startX} ${startY} C ${startX + cOffset} ${startY}, ${endX - cOffset} ${endY}, ${endX} ${endY}`;
      } else {
        // Target is left of source
        startX = fromPos.x;
        startY = c1y;
        endX = toPos.x + w2;
        endY = c2y;
        const cOffset = Math.max(30, Math.abs(startX - endX) * 0.5);
        d = `M ${startX} ${startY} C ${startX - cOffset} ${startY}, ${endX + cOffset} ${endY}, ${endX} ${endY}`;
      }
    } else {
      if (dy >= 0) {
        // Target is below source
        startX = c1x;
        startY = fromPos.y + h1;
        endX = c2x;
        endY = toPos.y;
        const cOffset = Math.max(30, Math.abs(endY - startY) * 0.5);
        d = `M ${startX} ${startY} C ${startX} ${startY + cOffset}, ${endX} ${endY - cOffset}, ${endX} ${endY}`;
      } else {
        // Target is above source
        startX = c1x;
        startY = fromPos.y;
        endX = c2x;
        endY = toPos.y + h2;
        const cOffset = Math.max(30, Math.abs(startY - endY) * 0.5);
        d = `M ${startX} ${startY} C ${startX} ${startY - cOffset}, ${endX} ${endY + cOffset}, ${endX} ${endY}`;
      }
    }

    const prereqSkill = state.skills.find(s => s.id === dep.prerequisite_id);
    const depSkill = state.skills.find(s => s.id === dep.dependent_id);

    const isConnectedToHovered = highlightedId && (dep.prerequisite_id === highlightedId || dep.dependent_id === highlightedId);

    let strokeColor = '#334155';
    let marker = 'url(#arrow-gray)';
    let strokeWidth = '2';
    let dashArray = 'none';

    if (isConnectedToHovered) {
      strokeColor = '#38bdf8';
      marker = 'url(#arrow-highlight)';
      strokeWidth = '3';
    } else if (prereqSkill && prereqSkill.status === 'mastered') {
      strokeColor = '#10b981';
      marker = 'url(#arrow-mastered)';
      strokeWidth = '2.5';
    } else if (prereqSkill && prereqSkill.status === 'in_progress') {
      strokeColor = '#6366f1';
      marker = 'url(#arrow-active)';
      strokeWidth = '2.5';
    } else {
      dashArray = '4 4';
    }

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', strokeColor);
    pathEl.setAttribute('stroke-width', strokeWidth);
    pathEl.setAttribute('stroke-dasharray', dashArray);
    pathEl.setAttribute('marker-end', marker);
    pathEl.setAttribute('class', 'pointer-events-none transition-colors duration-150');

    svgGroup.appendChild(pathEl);
  });
}

let hasTreeMoved = false;
let isTreePanning = false;
let isMarqueeActive = false;
let panStartX = 0;
let panStartY = 0;
let marqueeStartX = 0;
let marqueeStartY = 0;
let initialSelectedIds = new Set();

function setupPanZoom() {
  const viewport = document.getElementById('tech-tree-viewport');
  const container = document.getElementById('tech-tree-container');
  const marqueeBox = document.getElementById('tree-marquee-box');

  let rafId = null;
  function updateTransform() {
    container.style.transform = `translate3d(${state.treePan.x}px, ${state.treePan.y}px, 0) scale(${state.treePan.scale})`;
  }

  function scheduleTransform() {
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        updateTransform();
        rafId = null;
      });
    }
  }

  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, select, input, a, [contenteditable="true"], .skill-node-card')) return;

    // Check if marquee selection should trigger:
    // Left-click AND (Select Mode OR Shift held) AND not holding Space or Alt
    const isMarquee = (e.button === 0) && (state.selectMode || e.shiftKey) && !e.altKey && !e.spaceKey;

    if (isMarquee) {
      isMarqueeActive = true;
      hasTreeMoved = false;
      marqueeStartX = e.clientX;
      marqueeStartY = e.clientY;
      initialSelectedIds = e.shiftKey ? new Set(state.selectedSkillIds) : new Set();
      if (!e.shiftKey && state.selectedSkillIds.size > 0) {
        state.selectedSkillIds.clear();
        updateSelectModeUI();
      }
      viewport.style.cursor = 'crosshair';
      return;
    }

    // Otherwise, normal canvas panning
    isTreePanning = true;
    hasTreeMoved = false;
    panStartX = e.clientX - state.treePan.x;
    panStartY = e.clientY - state.treePan.y;
    viewport.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (isMarqueeActive) {
      const dx = e.clientX - marqueeStartX;
      const dy = e.clientY - marqueeStartY;
      if (Math.hypot(dx, dy) > 4) {
        hasTreeMoved = true;
      }

      if (!hasTreeMoved) return;

      const vpRect = viewport.getBoundingClientRect();
      const left = Math.min(e.clientX, marqueeStartX) - vpRect.left;
      const top = Math.min(e.clientY, marqueeStartY) - vpRect.top;
      const width = Math.abs(e.clientX - marqueeStartX);
      const height = Math.abs(e.clientY - marqueeStartY);

      if (marqueeBox) {
        marqueeBox.style.left = `${left}px`;
        marqueeBox.style.top = `${top}px`;
        marqueeBox.style.width = `${width}px`;
        marqueeBox.style.height = `${height}px`;
        marqueeBox.classList.remove('hidden');
      }

      // Convert viewport coords to tech-tree-container coords:
      const canvasX1 = (left - state.treePan.x) / state.treePan.scale;
      const canvasY1 = (top - state.treePan.y) / state.treePan.scale;
      const canvasX2 = (left + width - state.treePan.x) / state.treePan.scale;
      const canvasY2 = (top + height - state.treePan.y) / state.treePan.scale;

      // Detect card overlaps
      state.skills.forEach(skill => {
        const pos = state.nodePositions[skill.id];
        if (!pos) return;

        const cardX1 = pos.x;
        const cardY1 = pos.y;
        const cardX2 = pos.x + (pos.width || 260);
        const cardY2 = pos.y + (pos.height || 110);

        const overlaps = !(cardX2 < canvasX1 || cardX1 > canvasX2 || cardY2 < canvasY1 || cardY1 > canvasY2);

        if (overlaps) {
          state.selectedSkillIds.add(skill.id);
        } else if (!initialSelectedIds.has(skill.id)) {
          state.selectedSkillIds.delete(skill.id);
        }

        // Live visual update of card border/ring
        const cardEl = container.querySelector(`[data-skill-id="${skill.id}"]`);
        if (cardEl) {
          const isSel = state.selectedSkillIds.has(skill.id);
          if (isSel) {
            cardEl.classList.add('ring-2', 'ring-brand-400', 'bg-brand-500/15', 'border-brand-400/90', 'shadow-brand-500/20', 'shadow-lg');
            const chk = cardEl.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = true;
          } else {
            cardEl.classList.remove('ring-2', 'ring-brand-400', 'bg-brand-500/15', 'border-brand-400/90', 'shadow-brand-500/20', 'shadow-lg');
            const chk = cardEl.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = false;
          }
        }
      });

      // Update counter
      const countEl = document.getElementById('batch-selected-count');
      const delBtn = document.getElementById('batch-delete-btn');
      const alignBtn = document.getElementById('batch-align-btn');
      if (countEl) countEl.innerText = `${state.selectedSkillIds.size} skills selected`;
      if (delBtn) delBtn.disabled = state.selectedSkillIds.size === 0;
      if (alignBtn) alignBtn.disabled = state.selectedSkillIds.size <= 1;
      return;
    }

    if (isTreePanning) {
      const newX = e.clientX - panStartX;
      const newY = e.clientY - panStartY;
      if (Math.abs(newX - state.treePan.x) > 2 || Math.abs(newY - state.treePan.y) > 2) {
        hasTreeMoved = true;
      }
      state.treePan.x = newX;
      state.treePan.y = newY;
      scheduleTransform();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isMarqueeActive) {
      isMarqueeActive = false;
      if (marqueeBox) marqueeBox.classList.add('hidden');
      viewport.style.cursor = state.selectMode ? 'crosshair' : 'grab';

      if (hasTreeMoved) {
        if (state.selectedSkillIds.size > 0 && !state.selectMode) {
          state.selectMode = true;
        }
        updateSelectModeUI();
        renderTechTree();
      } else {
        // Simple click on empty canvas background
        if (state.selectMode && !initialSelectedIds.size) {
          clearSelectedSkills();
        }
      }
      return;
    }

    if (isTreePanning) {
      isTreePanning = false;
      viewport.style.cursor = state.selectMode ? 'crosshair' : 'grab';
    }
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Instant zero-delay proportional zoom centered on cursor
    const zoomFactor = e.deltaY < 0 ? 1.10 : 0.90;
    const oldScale = state.treePan.scale;
    const newScale = Math.min(Math.max(oldScale * zoomFactor, 0.35), 2.2);

    if (newScale !== oldScale) {
      const scaleRatio = newScale / oldScale;
      // Anchor zoom around cursor position:
      state.treePan.x = mouseX - (mouseX - state.treePan.x) * scaleRatio;
      state.treePan.y = mouseY - (mouseY - state.treePan.y) * scaleRatio;
      state.treePan.scale = newScale;
      scheduleTransform();
    }
  }, { passive: false });

  updateTransform();
}

function zoomTree(factor) {
  const container = document.getElementById('tech-tree-container');
  container.style.transition = 'transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)';
  state.treePan.scale = Math.min(Math.max(state.treePan.scale * factor, 0.35), 2.2);
  container.style.transform = `translate3d(${state.treePan.x}px, ${state.treePan.y}px, 0) scale(${state.treePan.scale})`;
  setTimeout(() => {
    container.style.transition = '';
  }, 200);
}

function resetTreeZoom() {
  state.treePan.x = 80;
  state.treePan.y = 80;
  state.treePan.scale = 0.9;
  const container = document.getElementById('tech-tree-container');
  container.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
  container.style.transform = `translate3d(80px, 80px, 0) scale(0.9)`;
  setTimeout(() => {
    container.style.transition = '';
  }, 240);
}

// ==========================================
// 2. SPIDER / RADAR CHART VISUALIZATION
// ==========================================
function renderSpiderChart() {
  const container = document.getElementById('spider-chart-container');
  const cardsList = document.getElementById('category-cards-list');
  const domainCountEl = document.getElementById('spider-domain-count');

  domainCountEl.innerText = `${state.categories.length} Tracked Domains`;
  cardsList.innerHTML = '';

  const categories = state.categories;
  if (!categories.length) {
    container.innerHTML = '<p class="text-xs text-slate-500">No categories found.</p>';
    return;
  }

  // Render Category Breakdown Cards
  categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'bg-surface-800/80 border border-surface-700/70 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-500 transition-colors cursor-pointer';
    card.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style="background-color: ${cat.color}22; color: ${cat.color}">
          <i data-lucide="${cat.icon.toLowerCase()}" class="w-4 h-4"></i>
        </span>
        <div>
          <div class="font-bold text-xs text-white">${cat.name}</div>
          <div class="text-[11px] text-slate-400">${cat.skill_count} skills &bull; Priority Weight ${cat.target_weight}/10</div>
        </div>
      </div>
      <div class="text-right">
        <div class="text-sm font-extrabold text-white">${cat.avg_score}%</div>
        <div class="w-16 bg-surface-700 rounded-full h-1.5 mt-1 overflow-hidden">
          <div class="h-full rounded-full" style="width: ${cat.avg_score}%; background-color: ${cat.color}"></div>
        </div>
      </div>
    `;
    card.onclick = () => {
      document.getElementById('category-filter').value = cat.id;
      onCategoryFilterChange();
      switchView('kanban');
    };
    cardsList.appendChild(card);
  });

  // Calculate Geometry for SVG Polygon
  const size = 420;
  const center = size / 2;
  const radius = 150;
  const totalAxes = categories.length;
  const angleStep = (Math.PI * 2) / totalAxes;

  let gridPolygons = '';
  // Concentric Grid Rings: 20%, 40%, 60%, 80%, 100%
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(level => {
    let pts = [];
    for (let i = 0; i < totalAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = center + radius * level * Math.cos(angle);
      const y = center + radius * level * Math.sin(angle);
      pts.push(`${x},${y}`);
    }
    gridPolygons += `<polygon points="${pts.join(' ')}" fill="none" stroke="#1e293b" stroke-width="1.2" />`;
  });

  // Axis Lines & Text Labels
  let axisLines = '';
  let labels = '';
  for (let i = 0; i < totalAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const endX = center + radius * Math.cos(angle);
    const endY = center + radius * Math.sin(angle);
    axisLines += `<line x1="${center}" y1="${center}" x2="${endX}" y2="${endY}" stroke="#334155" stroke-width="1" />`;

    // Label Placement
    const labelX = center + (radius + 28) * Math.cos(angle);
    const labelY = center + (radius + 28) * Math.sin(angle);
    const cat = categories[i];
    labels += `
      <text x="${labelX}" y="${labelY}" 
            text-anchor="middle" 
            dominant-baseline="middle" 
            fill="${cat.color}" 
            font-size="11" 
            font-weight="700">
        ${cat.name.split(' ')[0]}
      </text>
    `;
  }

  // Actual Score Polygon Points
  let actualPoints = [];
  let dots = '';
  categories.forEach((cat, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const normalized = Math.max((cat.avg_score || 10) / 100, 0.08);
    const x = center + radius * normalized * Math.cos(angle);
    const y = center + radius * normalized * Math.sin(angle);
    actualPoints.push(`${x},${y}`);
    dots += `<circle cx="${x}" cy="${y}" r="4" fill="${cat.color}" stroke="#0f172a" stroke-width="2" />`;
  });

  // Target Polygon (based on target_weight: 1-10)
  let targetPoints = [];
  categories.forEach((cat, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const targetNorm = Math.min((cat.target_weight * 10) / 100, 1.0);
    const x = center + radius * targetNorm * Math.cos(angle);
    const y = center + radius * targetNorm * Math.sin(angle);
    targetPoints.push(`${x},${y}`);
  });

  const svgChart = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="spider-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0.05" />
        </radialGradient>
      </defs>
      ${gridPolygons}
      ${axisLines}
      <!-- Target Polygon (Dashed outline) -->
      <polygon points="${targetPoints.join(' ')}" fill="none" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 4" />
      <!-- Actual Mastery Polygon (Filled glow) -->
      <polygon points="${actualPoints.join(' ')}" fill="url(#spider-glow)" stroke="#6366f1" stroke-width="2.5" />
      ${dots}
      ${labels}
    </svg>
  `;

  container.innerHTML = svgChart;
}

// ==========================================
// 3. KANBAN BOARD
// ==========================================
function renderKanbanBoard() {
  const filteredSkills = getFilteredSkills();

  const cols = {
    want_to_learn: document.getElementById('kanban-col-want_to_learn'),
    in_progress: document.getElementById('kanban-col-in_progress'),
    mastered: document.getElementById('kanban-col-mastered'),
    dormant: document.getElementById('kanban-col-dormant')
  };

  const counts = {
    want_to_learn: 0,
    in_progress: 0,
    mastered: 0,
    dormant: 0
  };

  Object.values(cols).forEach(col => col.innerHTML = '');

  filteredSkills.forEach(skill => {
    const col = cols[skill.status] || cols.want_to_learn;
    counts[skill.status] = (counts[skill.status] || 0) + 1;

    let priorityBadge = '';
    if (skill.priority === 'urgent') priorityBadge = '<span class="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded font-bold">Urgent</span>';
    else if (skill.priority === 'high') priorityBadge = '<span class="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-semibold">High</span>';

    const isSelected = state.selectedSkillIds.has(skill.id);
    let selectStyle = '';
    if (state.selectMode) {
      if (isSelected) {
        selectStyle = 'ring-2 ring-rose-500 bg-rose-500/15 border-rose-500/80 shadow-rose-500/20 shadow-md';
      } else {
        selectStyle = 'hover:ring-1 hover:ring-brand-400';
      }
    }

    const card = document.createElement('div');
    card.setAttribute('draggable', state.selectMode ? 'false' : 'true');
    card.className = `bg-surface-800/90 border border-surface-700/70 hover:border-brand-500/80 rounded-xl p-3.5 shadow-sm hover:shadow-lg transition-all duration-150 ${state.selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} group select-none ${selectStyle}`;
    if (!state.selectMode) {
      card.ondragstart = (e) => onKanbanDragStart(e, skill.id);
    }

    const checkboxHtml = state.selectMode ? `
      <div class="mr-1.5 flex items-center">
        <input type="checkbox" ${isSelected ? 'checked' : ''} class="w-4 h-4 rounded text-rose-600 bg-surface-900 border-surface-600 pointer-events-none" />
      </div>
    ` : '';

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex items-center gap-2">
          ${checkboxHtml}
          <span class="text-lg flex-shrink-0 flex items-center justify-center">${renderSkillIcon(skill.icon, 'w-5 h-5')}</span>
          <span class="font-bold text-xs text-white group-hover:text-brand-300 transition-colors">${skill.name}</span>
        </div>
        ${priorityBadge}
      </div>

      <div class="flex items-center justify-between text-[11px] mb-2.5">
        <span class="px-1.5 py-0.5 rounded font-semibold text-[10px]" style="background-color: ${skill.category_color}22; color: ${skill.category_color}">
          ${skill.category_name}
        </span>
        <span class="text-slate-400 capitalize text-[10px]">${skill.proficiency_tier}</span>
      </div>

      <div class="w-full bg-surface-700 rounded-full h-1.5 overflow-hidden mb-2">
        <div class="h-full rounded-full transition-all duration-300" style="width: ${skill.progress_pct || 0}%; background-color: ${skill.category_color || '#6366f1'}"></div>
      </div>

      <div class="flex items-center justify-between text-[10px] text-slate-400 border-t border-surface-700/50 pt-2 mt-2">
        <span>${skill.completed_milestones || 0}/${skill.total_milestones || 0} tasks</span>
        <select 
          onchange="event.stopPropagation(); updateSkillStatusQuick('${skill.id}', this.value)" 
          class="bg-surface-900 border border-surface-700 rounded px-1.5 py-0.5 text-slate-300 text-[10px] focus:outline-none focus:border-brand-500"
        >
          <option value="want_to_learn" ${skill.status === 'want_to_learn' ? 'selected' : ''}>Backlog</option>
          <option value="in_progress" ${skill.status === 'in_progress' ? 'selected' : ''}>Active</option>
          <option value="mastered" ${skill.status === 'mastered' ? 'selected' : ''}>Mastered</option>
          <option value="dormant" ${skill.status === 'dormant' ? 'selected' : ''}>Dormant</option>
        </select>
      </div>
    `;

    card.onclick = () => {
      if (state.selectMode) {
        toggleSkillSelection(skill.id);
      } else {
        openDetailDrawer(skill.id);
      }
    };
    col.appendChild(card);
  });

  document.getElementById('kanban-count-want').innerText = counts.want_to_learn;
  document.getElementById('kanban-count-progress').innerText = counts.in_progress;
  document.getElementById('kanban-count-mastered').innerText = counts.mastered;
  document.getElementById('kanban-count-dormant').innerText = counts.dormant;
}

let draggedSkillId = null;

function onKanbanDragStart(e, skillId) {
  draggedSkillId = skillId;
  e.dataTransfer.setData('text/plain', skillId);
  e.dataTransfer.effectAllowed = 'move';
}

function onKanbanDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  target.classList.add('bg-brand-500/10', 'border-brand-500/40');
}

function onKanbanDragLeave(e) {
  const target = e.currentTarget;
  target.classList.remove('bg-brand-500/10', 'border-brand-500/40');
}

async function onKanbanDrop(e, targetStatus) {
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove('bg-brand-500/10', 'border-brand-500/40');
  const skillId = draggedSkillId || e.dataTransfer.getData('text/plain');
  if (!skillId) return;
  await updateSkillStatusQuick(skillId, targetStatus);
}

async function updateSkillStatusQuick(skillId, newStatus) {
  try {
    await fetch(`${API_BASE}/skills/${skillId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    await refreshData();
  } catch (err) {
    console.error('Error updating status:', err);
  }
}

// ==========================================
// 4. TABLE VIEW
// ==========================================
function renderTableView() {
  const tbody = document.getElementById('table-skills-body');
  tbody.innerHTML = '';

  const skills = getFilteredSkills();
  skills.forEach(skill => {
    const isSelected = state.selectedSkillIds.has(skill.id);
    const tr = document.createElement('tr');
    tr.className = `hover:bg-surface-800/60 transition-colors cursor-pointer ${isSelected && state.selectMode ? 'bg-rose-500/10' : ''}`;
    
    const checkboxTd = state.selectMode ? `
      <input type="checkbox" ${isSelected ? 'checked' : ''} class="w-4 h-4 rounded text-rose-600 bg-surface-900 border-surface-600 pointer-events-none mr-2" />
    ` : '';

    tr.innerHTML = `
      <td class="p-3.5 flex items-center font-semibold text-white">
        ${checkboxTd}
        <span class="mr-2 flex-shrink-0 inline-flex items-center justify-center">${renderSkillIcon(skill.icon, 'w-4 h-4')}</span>
        <span>${skill.name}</span>
      </td>
      <td class="p-3.5">
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold" style="background-color: ${skill.category_color}22; color: ${skill.category_color}">
          ${skill.category_name}
        </span>
      </td>
      <td class="p-3.5 uppercase text-[10px] font-bold tracking-wider text-slate-300">
        ${skill.status.replace('_', ' ')}
      </td>
      <td class="p-3.5 capitalize text-slate-300">${skill.proficiency_tier}</td>
      <td class="p-3.5">
        <div class="flex items-center gap-2">
          <div class="w-20 bg-surface-700 rounded-full h-1.5 overflow-hidden">
            <div class="h-full rounded-full bg-brand-500" style="width: ${skill.progress_pct || 0}%"></div>
          </div>
          <span class="text-[10px] text-slate-400">${skill.progress_pct}%</span>
        </div>
      </td>
      <td class="p-3.5 text-slate-400">${((skill.total_time_spent || 0) / 60).toFixed(1)} hrs</td>
      <td class="p-3.5 capitalize text-slate-400">${skill.priority}</td>
      <td class="p-3.5 text-right">
        <button onclick="event.stopPropagation(); openDetailDrawer('${skill.id}')" class="text-brand-400 hover:text-brand-300 font-semibold p-1 hover:bg-surface-700 rounded">Open</button>
      </td>
    `;
    tr.onclick = () => {
      if (state.selectMode) {
        toggleSkillSelection(skill.id);
      } else {
        openDetailDrawer(skill.id);
      }
    };
    tbody.appendChild(tr);
  });
}

// ==========================================
// 5. NOTION-STYLE DETAIL DRAWER
// ==========================================
async function openDetailDrawer(skillId) {
  state.activeSkillId = skillId;
  const drawer = document.getElementById('detail-drawer');
  const panel = document.getElementById('drawer-panel');

  try {
    const res = await fetch(`${API_BASE}/skills/${skillId}`);
    const detail = await res.json();
    state.activeDetail = detail;

    // Populate header & properties
    const iconDisplay = document.getElementById('detail-skill-icon-display');
    if (iconDisplay) iconDisplay.innerHTML = renderSkillIcon(detail.icon || '🎯', 'w-6 h-6');
    const iconVal = document.getElementById('detail-skill-icon-val');
    if (iconVal) iconVal.value = detail.icon || '🎯';
    renderSuggestedIconsPalette('detail');
    document.getElementById('detail-skill-name').value = detail.name;
    document.getElementById('detail-skill-category').value = detail.category_id;
    document.getElementById('detail-skill-status').value = detail.status;
    document.getElementById('detail-skill-tier').value = detail.proficiency_tier;
    document.getElementById('detail-skill-priority').value = detail.priority;
    
    // Progress
    document.getElementById('detail-progress-bar').style.width = `${detail.progress_pct || 0}%`;
    document.getElementById('detail-progress-pct').innerText = `${detail.progress_pct || 0}%`;
    document.getElementById('detail-total-time').innerText = `${((detail.total_time_spent || 0) / 60).toFixed(1)} hrs`;

    // Notes
    document.getElementById('detail-notes-textarea').value = detail.notes_content || '';

    // Render tab contents
    renderDetailMilestones();
    renderDetailPracticeLogs();
    renderDetailTechTreeLinks();

    // Show drawer
    drawer.classList.remove('hidden');
    setTimeout(() => {
      panel.classList.remove('translate-x-full');
    }, 20);
  } catch (err) {
    console.error('Failed to load skill details:', err);
  }
}

function closeDetailDrawer() {
  const drawer = document.getElementById('detail-drawer');
  const panel = document.getElementById('drawer-panel');
  panel.classList.add('translate-x-full');
  setTimeout(() => {
    drawer.classList.add('hidden');
  }, 250);
  state.activeSkillId = null;
  state.activeDetail = null;
  refreshData();
}

function switchDetailTab(tabName) {
  state.currentDetailTab = tabName;
  ['milestones', 'practice', 'tech', 'notes'].forEach(t => {
    const content = document.getElementById(`dtab-content-${t}`);
    const btn = document.getElementById(`dtab-btn-${t}`);
    if (t === tabName) {
      content.classList.remove('hidden');
      btn.classList.add('border-brand-500', 'text-white');
      btn.classList.remove('border-transparent', 'text-slate-400');
    } else {
      content.classList.add('hidden');
      btn.classList.remove('border-brand-500', 'text-white');
      btn.classList.add('border-transparent', 'text-slate-400');
    }
  });
}

async function saveSkillHeaderChanges(extraFields = {}) {
  if (!state.activeSkillId) return;
  const payload = {
    name: document.getElementById('detail-skill-name').value,
    category_id: document.getElementById('detail-skill-category').value,
    status: document.getElementById('detail-skill-status').value,
    proficiency_tier: document.getElementById('detail-skill-tier').value,
    priority: document.getElementById('detail-skill-priority').value,
    icon: document.getElementById('detail-skill-icon-val')?.value || '🎯',
    ...extraFields
  };

  await fetch(`${API_BASE}/skills/${state.activeSkillId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await refreshData();
}

async function saveSkillNotes() {
  if (!state.activeSkillId) return;
  const notes = document.getElementById('detail-notes-textarea').value;
  await fetch(`${API_BASE}/skills/${state.activeSkillId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes_content: notes })
  });
  alert('Notes successfully saved!');
}

async function deleteCurrentSkill() {
  if (!state.activeSkillId) return;
  if (!confirm(`Are you sure you want to delete "${state.activeDetail.name}"?`)) return;

  await fetch(`${API_BASE}/skills/${state.activeSkillId}`, { method: 'DELETE' });
  closeDetailDrawer();
}

// Milestones
function renderDetailMilestones() {
  const list = document.getElementById('detail-milestone-list');
  const milestones = state.activeDetail?.milestones || [];
  const completed = milestones.filter(m => m.is_completed).length;

  document.getElementById('detail-milestone-ratio').innerText = `${completed} / ${milestones.length} Completed`;
  list.innerHTML = '';

  if (!milestones.length) {
    list.innerHTML = '<p class="text-xs text-slate-500 py-3 italic">No milestones defined yet. Break this skill down above!</p>';
    return;
  }

  milestones.forEach(m => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-2.5 rounded-lg bg-surface-800/80 border border-surface-700/60 hover:border-slate-500 transition-colors text-xs';
    item.innerHTML = `
      <label class="flex items-center gap-2.5 cursor-pointer flex-1">
        <input 
          type="checkbox" 
          ${m.is_completed ? 'checked' : ''} 
          onchange="toggleMilestoneCheck('${m.id}')"
          class="w-4 h-4 rounded text-brand-600 focus:ring-0 bg-surface-900 border-surface-600 cursor-pointer"
        />
        <span class="${m.is_completed ? 'line-through text-slate-500' : 'text-slate-200'} font-medium">
          ${m.title}
        </span>
      </label>
      <button onclick="deleteMilestoneItem('${m.id}')" class="text-slate-500 hover:text-rose-400 p-1 rounded">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    `;
    list.appendChild(item);
  });
  safeCreateIcons();
}

async function toggleMilestoneCheck(milestoneId) {
  const res = await fetch(`${API_BASE}/milestones/${milestoneId}/toggle`, { method: 'POST' });
  const updatedSkill = await res.json();
  state.activeDetail = updatedSkill;
  document.getElementById('detail-progress-bar').style.width = `${updatedSkill.progress_pct || 0}%`;
  document.getElementById('detail-progress-pct').innerText = `${updatedSkill.progress_pct || 0}%`;
  renderDetailMilestones();
}

async function submitNewMilestone() {
  const input = document.getElementById('new-milestone-input');
  const title = input.value.trim();
  if (!title || !state.activeSkillId) return;

  const res = await fetch(`${API_BASE}/skills/${state.activeSkillId}/milestones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  const updatedSkill = await res.json();
  state.activeDetail = updatedSkill;
  input.value = '';
  renderDetailMilestones();
}

async function deleteMilestoneItem(milestoneId) {
  const res = await fetch(`${API_BASE}/milestones/${milestoneId}`, { method: 'DELETE' });
  const updatedSkill = await res.json();
  state.activeDetail = updatedSkill;
  renderDetailMilestones();
}

// Practice Logs & Time Management
let practiceLogMode = 'add'; // 'add' or 'deduct'

function setPracticeLogMode(mode) {
  practiceLogMode = mode;
  const addBtn = document.getElementById('pmode-add-btn');
  const deductBtn = document.getElementById('pmode-deduct-btn');
  const submitBtn = document.getElementById('submit-practice-btn');
  const submitLabel = document.getElementById('submit-practice-label');
  const title = document.getElementById('practice-card-title');
  const icon = document.getElementById('practice-mode-icon');
  const durationLabel = document.getElementById('practice-duration-label');

  if (mode === 'deduct') {
    if (addBtn) addBtn.className = 'px-2.5 py-0.5 rounded font-medium text-slate-400 hover:text-emerald-300 transition-all flex items-center gap-1';
    if (deductBtn) deductBtn.className = 'px-2.5 py-0.5 rounded font-bold text-white bg-rose-600 transition-all flex items-center gap-1 shadow-sm';
    if (submitBtn) {
      submitBtn.className = 'w-full bg-rose-600 hover:bg-rose-500 text-white py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5';
    }
    if (submitLabel) submitLabel.innerText = 'Deduct Time from Skill (-)';
    if (title) title.innerText = 'Deduct / Reduce Course Time';
    if (icon) {
      icon.setAttribute('data-lucide', 'minus-circle');
      icon.className = 'w-4 h-4 text-rose-400';
    }
    if (durationLabel) durationLabel.innerText = 'Deduct Duration (Mins)';
  } else {
    if (addBtn) addBtn.className = 'px-2.5 py-0.5 rounded font-bold text-white bg-emerald-600 transition-all flex items-center gap-1 shadow-sm';
    if (deductBtn) deductBtn.className = 'px-2.5 py-0.5 rounded font-medium text-slate-400 hover:text-rose-300 transition-all flex items-center gap-1';
    if (submitBtn) {
      submitBtn.className = 'w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5';
    }
    if (submitLabel) submitLabel.innerText = 'Record Practice Session (+)';
    if (title) title.innerText = 'Log Practice Session';
    if (icon) {
      icon.setAttribute('data-lucide', 'plus-circle');
      icon.className = 'w-4 h-4 text-emerald-400';
    }
    if (durationLabel) durationLabel.innerText = 'Duration (Mins)';
  }
  safeCreateIcons();
}

function renderDetailPracticeLogs() {
  const list = document.getElementById('detail-practice-logs-list');
  const countEl = document.getElementById('practice-logs-count');
  const directInput = document.getElementById('direct-hours-input');
  const logs = state.activeDetail?.practice_logs || [];
  list.innerHTML = '';

  if (countEl) countEl.innerText = `${logs.length} logged`;

  // Prepopulate direct hours input
  if (directInput && state.activeDetail) {
    const currentHours = ((state.activeDetail.total_time_spent || 0) / 60).toFixed(1);
    directInput.value = currentHours;
  }

  if (!logs.length) {
    list.innerHTML = '<p class="text-xs text-slate-500 py-2 italic">No practice sessions logged yet. Record or deduct time above!</p>';
    return;
  }

  logs.forEach(log => {
    const row = document.createElement('div');
    row.className = 'p-3 bg-surface-800/80 border border-surface-700/60 rounded-xl text-xs space-y-1';
    const dateFormatted = new Date(log.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const isNegative = log.duration_minutes < 0;
    const badgeColor = isNegative ? 'text-rose-400' : 'text-emerald-400';
    const signPrefix = isNegative ? '' : '+';
    const displayDuration = `${signPrefix}${log.duration_minutes} mins`;

    row.innerHTML = `
      <div class="flex items-center justify-between text-slate-400">
        <span class="font-bold ${badgeColor} flex items-center gap-1">
          <i data-lucide="${isNegative ? 'minus-circle' : 'clock'}" class="w-3.5 h-3.5"></i>
          ${displayDuration}
        </span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-slate-500">${dateFormatted}</span>
          <button type="button" onclick="deletePracticeSession('${log.id}')" class="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors" title="Delete session log (deducts time)">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
      </div>
      <p class="text-slate-200 text-xs">${log.session_notes || (isNegative ? 'Time reduction' : 'Focused practice session')}</p>
    `;
    list.appendChild(row);
  });
  safeCreateIcons();
}

async function submitPracticeLog() {
  const durationInput = document.getElementById('log-duration-input');
  let duration = parseInt(durationInput.value) || 30;
  if (practiceLogMode === 'deduct') {
    duration = -Math.abs(duration);
  } else {
    duration = Math.abs(duration);
  }

  const notesInput = document.getElementById('log-notes-input');
  const notes = notesInput.value.trim();
  if (!state.activeSkillId) return;

  const res = await fetch(`${API_BASE}/skills/${state.activeSkillId}/practice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration_minutes: duration, session_notes: notes })
  });
  const updatedSkill = await res.json();
  state.activeDetail = updatedSkill;

  // Sync state.skills
  const idx = state.skills.findIndex(s => s.id === updatedSkill.id);
  if (idx !== -1) {
    state.skills[idx] = { ...state.skills[idx], ...updatedSkill };
  }

  notesInput.value = '';
  document.getElementById('detail-total-time').innerText = `${((updatedSkill.total_time_spent || 0) / 60).toFixed(1)} hrs`;
  renderDetailPracticeLogs();
  updateTopMetrics();
  renderCurrentView();
}

async function saveDirectHours() {
  const input = document.getElementById('direct-hours-input');
  const hours = Math.max(0, parseFloat(input.value) || 0);
  const minutes = Math.round(hours * 60);

  if (!state.activeSkillId) return;

  const res = await fetch(`${API_BASE}/skills/${state.activeSkillId}/set-time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ total_minutes: minutes })
  });
  const updatedSkill = await res.json();
  state.activeDetail = updatedSkill;

  const idx = state.skills.findIndex(s => s.id === updatedSkill.id);
  if (idx !== -1) {
    state.skills[idx] = { ...state.skills[idx], ...updatedSkill };
  }

  document.getElementById('detail-total-time').innerText = `${(minutes / 60).toFixed(1)} hrs`;
  renderDetailPracticeLogs();
  updateTopMetrics();
  renderCurrentView();
}

async function confirmResetCurrentTimeZero() {
  if (!state.activeSkillId) return;
  if (!confirm(`Reset logged time for "${state.activeDetail?.name || 'this skill'}" to 0 hours?`)) return;

  const res = await fetch(`${API_BASE}/skills/${state.activeSkillId}/reset-time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const updatedSkill = await res.json();
  state.activeDetail = updatedSkill;

  const idx = state.skills.findIndex(s => s.id === updatedSkill.id);
  if (idx !== -1) {
    state.skills[idx] = { ...state.skills[idx], ...updatedSkill };
  }

  document.getElementById('detail-total-time').innerText = '0.0 hrs';
  const directInput = document.getElementById('direct-hours-input');
  if (directInput) directInput.value = '0.0';
  renderDetailPracticeLogs();
  updateTopMetrics();
  renderCurrentView();
}

function promptSetExactTime() {
  switchDetailTab('practice');
  const directInput = document.getElementById('direct-hours-input');
  if (directInput) {
    directInput.focus();
    directInput.select();
  }
}

async function deletePracticeSession(logId) {
  if (!confirm('Delete this practice session? This will deduct its duration from the total logged time.')) return;

  const res = await fetch(`${API_BASE}/practice/${logId}`, {
    method: 'DELETE'
  });
  const updatedSkill = await res.json();
  state.activeDetail = updatedSkill;

  const idx = state.skills.findIndex(s => s.id === updatedSkill.id);
  if (idx !== -1) {
    state.skills[idx] = { ...state.skills[idx], ...updatedSkill };
  }

  document.getElementById('detail-total-time').innerText = `${((updatedSkill.total_time_spent || 0) / 60).toFixed(1)} hrs`;
  renderDetailPracticeLogs();
  updateTopMetrics();
  renderCurrentView();
}

async function confirmResetAllPresetTimes() {
  if (!confirm('Are you sure you want to reset all preset skill logged hours to 0?\n\nThis will give you a clean slate so you can track your own personal practice time from scratch.')) return;

  await fetch(`${API_BASE}/skills/reset-all-times`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board_id: state.activeBoardId })
  });

  await refreshData();
  closeSettingsModal();
  alert('All skill hours have been reset to 0 hrs. Happy practicing!');
}

// Prerequisites & Unlocks Links
function renderDetailTechTreeLinks() {
  const prereqsList = document.getElementById('detail-prereqs-list');
  const unlocksList = document.getElementById('detail-unlocks-list');
  const prereqSelect = document.getElementById('add-prereq-select');

  prereqsList.innerHTML = '';
  unlocksList.innerHTML = '';

  const prereqs = state.activeDetail?.prerequisites || [];
  const unlocks = state.activeDetail?.unlocks || [];

  if (!prereqs.length) {
    prereqsList.innerHTML = '<p class="text-xs text-slate-500 italic">No prerequisites. This is a foundational root skill.</p>';
  } else {
    prereqs.forEach(p => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-2.5 rounded-lg bg-surface-800 border border-surface-700 text-xs';
      item.innerHTML = `
        <span class="font-bold text-white">${p.prerequisite_name}</span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-slate-400 capitalize">${p.proficiency_tier}</span>
          <button onclick="removeDependency('${p.id}')" class="text-slate-500 hover:text-rose-400 p-1">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
      prereqsList.appendChild(item);
    });
  }

  if (!unlocks.length) {
    unlocksList.innerHTML = '<p class="text-xs text-slate-500 italic">Does not currently unlock any higher-level skills.</p>';
  } else {
    unlocks.forEach(u => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-2.5 rounded-lg bg-surface-800 border border-surface-700 text-xs';
      item.innerHTML = `
        <span class="font-bold text-white">${u.dependent_name}</span>
        <span class="text-[10px] text-slate-400 capitalize">${u.proficiency_tier}</span>
      `;
      unlocksList.appendChild(item);
    });
  }

  // Populate Add Prereq dropdown
  prereqSelect.innerHTML = '<option value="">Select prerequisite skill...</option>';
  state.skills
    .filter(s => s.id !== state.activeSkillId && !prereqs.some(p => p.prerequisite_id === s.id))
    .forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      prereqSelect.appendChild(opt);
    });

  safeCreateIcons();
}

async function submitAddPrerequisite() {
  const select = document.getElementById('add-prereq-select');
  const prereqId = select.value;
  if (!prereqId || !state.activeSkillId) return;

  await fetch(`${API_BASE}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prerequisite_id: prereqId,
      dependent_id: state.activeSkillId,
      requirement_type: 'hard_prerequisite'
    })
  });

  const res = await fetch(`${API_BASE}/skills/${state.activeSkillId}`);
  state.activeDetail = await res.json();
  renderDetailTechTreeLinks();
}

async function removeDependency(depId) {
  await fetch(`${API_BASE}/dependencies/${depId}`, { method: 'DELETE' });
  const res = await fetch(`${API_BASE}/skills/${state.activeSkillId}`);
  state.activeDetail = await res.json();
  renderDetailTechTreeLinks();
}

// ==========================================
// 6. NEW SKILL MODAL
// ==========================================
function openNewSkillModal() {
  renderSuggestedIconsPalette('modal');
  document.getElementById('new-skill-modal').classList.remove('hidden');
  safeCreateIcons();
}

function closeNewSkillModal() {
  document.getElementById('new-skill-modal').classList.add('hidden');
}

function quickAddSkill(defaultStatus) {
  document.getElementById('modal-skill-status').value = defaultStatus;
  openNewSkillModal();
}

async function submitNewSkillModal() {
  const name = document.getElementById('modal-skill-name').value.trim();
  const catId = document.getElementById('modal-skill-category').value;
  const status = document.getElementById('modal-skill-status').value;
  const tier = document.getElementById('modal-skill-tier').value;
  const priority = document.getElementById('modal-skill-priority').value;
  const targetHours = parseInt(document.getElementById('modal-skill-hours').value) || 20;
  const icon = document.getElementById('modal-skill-icon-val')?.value || '🎯';

  if (!name) {
    alert('Please provide a skill name.');
    return;
  }

  const payload = {
    name,
    category_id: catId,
    status,
    proficiency_tier: tier,
    priority,
    target_hours: targetHours,
    icon
  };

  try {
    const res = await fetch(`${API_BASE}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const created = await res.json();
    closeNewSkillModal();
    document.getElementById('modal-skill-name').value = '';
    selectSuggestedIcon('🎯', 'modal', true);
    await refreshData();
    openDetailDrawer(created.id);
  } catch (err) {
    console.error('Error creating skill:', err);
  }
}
