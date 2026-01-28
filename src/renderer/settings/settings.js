const statusEl = document.getElementById('status');
const fullShortcut = document.getElementById('fullShortcut');
const windowShortcut = document.getElementById('windowShortcut');
const regionShortcut = document.getElementById('regionShortcut');
const quickShortcut = document.getElementById('quickShortcut');
const quickMode = document.getElementById('quickMode');
const saveButton = document.getElementById('saveButton');
const closeButton = document.getElementById('closeButton');
const resetButton = document.getElementById('resetButton');

const shortcutInputs = [fullShortcut, windowShortcut, regionShortcut, quickShortcut];
const isMac = typeof navigator !== 'undefined'
  && navigator.platform
  && navigator.platform.toLowerCase().includes('mac');
const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const keyLabelMap = new Map([
  [' ', 'Space'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['Esc', 'Escape'],
  ['Print', 'PrintScreen'],
  ['Snapshot', 'PrintScreen'],
  ['PrintScreen', 'PrintScreen'],
  ['SysRq', 'PrintScreen'],
  ['SysReq', 'PrintScreen'],
  ['+', 'Plus'],
  ['-', 'Minus'],
  ['=', 'Equal'],
  [',', 'Comma'],
  ['.', 'Period'],
  ['/', 'Slash'],
  ['\\', 'Backslash'],
  [';', 'Semicolon'],
  ["'", 'Quote'],
  ['`', 'Backquote'],
  ['[', 'BracketLeft'],
  [']', 'BracketRight'],
]);
const DEFAULT_SHORTCUTS = {
  full: 'Control+Shift+1',
  window: 'Control+Shift+2',
  region: 'Control+Shift+3',
  quick: 'PrintScreen',
  quickMode: 'region',
};

function normalizeShortcut(value) {
  if (!value) {
    return '';
  }
  return value
    .trim()
    .replace(/\s*\+\s*/g, '+')
    .replace(/\bCtrl\b/gi, 'Control')
    .replace(/\bCmd\b/gi, 'Command')
    .replace(/\bWin\b/gi, 'Super')
    .replace(/\bPrint\s*Screen\b/gi, 'PrintScreen')
    .replace(/\bPrt\s*Sc(?:n|r)?\b/gi, 'PrintScreen')
    .replace(/\bSys\s*Rq\b/gi, 'PrintScreen');
}

function setStatus(message, tone = 'idle') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function applyShortcutValues(shortcuts = {}) {
  fullShortcut.value = shortcuts.full || '';
  windowShortcut.value = shortcuts.window || '';
  regionShortcut.value = shortcuts.region || '';
  quickShortcut.value = shortcuts.quick || '';
  quickMode.value = shortcuts.quickMode || 'region';
}

function resolveKeyLabel(event) {
  if (!event || modifierKeys.has(event.key)) {
    return '';
  }
  if (event.code === 'PrintScreen') {
    return 'PrintScreen';
  }
  const mapped = keyLabelMap.get(event.key);
  if (mapped) {
    return mapped;
  }
  if (event.code && event.code.startsWith('Key')) {
    return event.code.slice(3);
  }
  if (event.code && event.code.startsWith('Digit')) {
    return event.code.slice(5);
  }
  if (event.code && event.code.startsWith('Numpad')) {
    const numpadKey = event.code.slice(6);
    if (numpadKey) {
      return numpadKey;
    }
  }
  if (event.key && event.key.length === 1) {
    return event.key.toUpperCase();
  }
  return event.key || '';
}

function buildShortcutValue(event) {
  const keyLabel = resolveKeyLabel(event);
  if (!keyLabel) {
    return '';
  }
  const parts = [];
  if (isMac) {
    if (event.metaKey) parts.push('Command');
    if (event.ctrlKey) parts.push('Control');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
  } else {
    if (event.ctrlKey) parts.push('Control');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');
  }
  parts.push(keyLabel);
  return parts.join('+');
}

function handleShortcutKeyEvent(event, input) {
  if (event.type === 'keyup' && event.key !== 'PrintScreen' && event.code !== 'PrintScreen') {
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    input.blur();
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    input.value = '';
    setStatus('지움', 'idle');
    return;
  }

  const value = buildShortcutValue(event);
  if (!value) {
    return;
  }
  input.value = value;
  setStatus('입력됨', 'ready');
}

async function loadSettings() {
  try {
    const settings = await window.settingsApi.getSettings();
    const shortcuts = settings?.shortcuts || {};
    applyShortcutValues(shortcuts);
    setStatus('불러옴', 'ready');
  } catch (error) {
    setStatus('불러오기 실패', 'error');
  }
}

async function saveSettings() {
  saveButton.disabled = true;
  try {
    const payload = {
      shortcuts: {
        full: normalizeShortcut(fullShortcut.value),
        window: normalizeShortcut(windowShortcut.value),
        region: normalizeShortcut(regionShortcut.value),
        quick: normalizeShortcut(quickShortcut.value),
        quickMode: quickMode.value || 'region',
      },
    };
    await window.settingsApi.updateSettings(payload);
    setStatus('저장됨', 'success');
  } catch (error) {
    setStatus('저장 실패', 'error');
  } finally {
    saveButton.disabled = false;
  }
}

saveButton.addEventListener('click', saveSettings);
closeButton.addEventListener('click', () => window.settingsApi.close());
if (resetButton) {
  resetButton.addEventListener('click', () => {
    applyShortcutValues(DEFAULT_SHORTCUTS);
    setStatus('초기화됨 (저장 필요)', 'idle');
  });
}

shortcutInputs.forEach((input) => {
  if (!input) {
    return;
  }
  input.readOnly = true;
  input.addEventListener('focus', () => {
    input.select();
    setStatus('키 조합을 누르세요', 'idle');
  });
  input.addEventListener('click', () => input.select());
  input.addEventListener('keydown', (event) => handleShortcutKeyEvent(event, input));
  input.addEventListener('keyup', (event) => handleShortcutKeyEvent(event, input));
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveSettings();
  }
  if (event.key === 'Escape') {
    window.settingsApi.close();
  }
});

loadSettings();
