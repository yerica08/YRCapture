const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = 'settings.json';
const MAX_AUTO_SAVED = 100;
const AUTO_SAVE_PATTERN = /^\d{8}_\d{6}_\d{3}\.(png|jpg)$/i;

const DEFAULT_SETTINGS = {
  autoSave: false,
  autoCopy: true,
  saveFolder: null,
  format: 'png',
  jpegQuality: 90,
  showLauncher: true,
  previewWindowBounds: null,
  recentCaptures: [],
  shortcuts: {
    full: 'Control+Shift+1',
    window: 'Control+Shift+2',
    region: 'Control+Shift+3',
    quick: 'PrintScreen',
    quickMode: 'region',
  },
};

let settings = null;

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function timestamp() {
  const now = new Date();
  return (
    `${now.getFullYear()}` +
    `${pad(now.getMonth() + 1)}` +
    `${pad(now.getDate())}_` +
    `${pad(now.getHours())}` +
    `${pad(now.getMinutes())}` +
    `${pad(now.getSeconds())}_` +
    `${pad(now.getMilliseconds(), 3)}`
  );
}

function ensureFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function loadSettings() {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (error) {
    // Ignore corrupted settings and fall back to defaults.
  }
  return {};
}

function persistSettings() {
  const filePath = getSettingsPath();
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
}

function init() {
  const baseFolder = path.join(app.getPath('pictures'), 'YRcapture');
  const saved = loadSettings();
  settings = {
    ...DEFAULT_SETTINGS,
    saveFolder: baseFolder,
    ...saved,
  };
  ensureFolder(settings.saveFolder);
  persistSettings();
}

function getSettings() {
  return settings;
}

function updateSettings(patch) {
  settings = { ...settings, ...patch };
  ensureFolder(settings.saveFolder);
  persistSettings();
}

function generateFilename(ext) {
  return `${timestamp()}.${ext}`;
}

function saveImage(image, options = {}) {
  const extFromPath = options.filePath
    ? path.extname(options.filePath).slice(1).toLowerCase()
    : '';
  const normalizedExt = extFromPath === 'jpeg' ? 'jpg' : extFromPath;
  const format = options.format || normalizedExt || settings.format || 'png';
  const ext = format === 'jpg' ? 'jpg' : 'png';
  const folder = options.folder || settings.saveFolder;
  const filePath =
    options.filePath || path.join(folder, generateFilename(ext));

  ensureFolder(path.dirname(filePath));

  const buffer =
    ext === 'jpg'
      ? image.toJPEG(options.jpegQuality || settings.jpegQuality || 90)
      : image.toPNG();

  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function pruneAutoSaved() {
  const folder = settings.saveFolder;
  if (!folder || !fs.existsSync(folder)) {
    return;
  }
  const entries = fs.readdirSync(folder)
    .filter((name) => AUTO_SAVE_PATTERN.test(name))
    .sort();
  if (entries.length <= MAX_AUTO_SAVED) {
    return;
  }
  const excess = entries.length - MAX_AUTO_SAVED;
  const targets = entries.slice(0, excess);
  targets.forEach((name) => {
    const targetPath = path.join(folder, name);
    try {
      fs.unlinkSync(targetPath);
    } catch (error) {
      // Ignore deletion failures.
    }
  });
}

async function autoSave(image) {
  if (!settings?.autoSave) {
    return null;
  }
  const savedPath = saveImage(image);
  pruneAutoSaved();
  return savedPath;
}

function openFolder() {
  ensureFolder(settings.saveFolder);
  shell.openPath(settings.saveFolder);
}

module.exports = {
  init,
  getSettings,
  updateSettings,
  generateFilename,
  saveImage,
  autoSave,
  openFolder,
};
