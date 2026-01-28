const { app, ipcMain, clipboard, dialog, screen, shell, nativeImage, BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');

const captureService = require('./captureService');
const trayManager = require('./trayManager');
const shortcutManager = require('./shortcutManager');
const windowManager = require('./windowManager');
const storage = require('./storage');

let lastCapture = null;
const recentCaptures = [];
const MAX_RECENTS = 12;
let currentPreviewIndex = 0;
let regionCaptureUiState = null;
let settingsOpen = false;
const WEB_CAPTURE_PARTITION = 'web-capture';
let webCaptureSessionReady = false;

function ensureWebCaptureSession() {
  const webCaptureSession = session.fromPartition(WEB_CAPTURE_PARTITION);
  if (!webCaptureSessionReady) {
    webCaptureSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    if (typeof webCaptureSession.setPermissionCheckHandler === 'function') {
      webCaptureSession.setPermissionCheckHandler(() => false);
    }
    webCaptureSessionReady = true;
  }
  return webCaptureSession;
}

function sanitizeSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object') {
    return {};
  }
  const sanitized = {};
  if (typeof patch.autoCopy === 'boolean') {
    sanitized.autoCopy = patch.autoCopy;
  }
  if (typeof patch.autoSave === 'boolean') {
    sanitized.autoSave = patch.autoSave;
  }
  if (typeof patch.showLauncher === 'boolean') {
    sanitized.showLauncher = patch.showLauncher;
  }
  if (typeof patch.saveFolder === 'string' && patch.saveFolder.trim()) {
    sanitized.saveFolder = patch.saveFolder.trim();
  }
  if (patch.format === 'png' || patch.format === 'jpg') {
    sanitized.format = patch.format;
  }
  if (Number.isFinite(patch.jpegQuality)) {
    const quality = Math.max(10, Math.min(100, Math.round(patch.jpegQuality)));
    sanitized.jpegQuality = quality;
  }
  if (patch.shortcuts && typeof patch.shortcuts === 'object') {
    const shortcuts = {};
    const sanitizeShortcutValue = (value) => {
      if (typeof value !== 'string') {
        return undefined;
      }
      const trimmed = value.trim();
      if (trimmed.length > 64) {
        return undefined;
      }
      return trimmed;
    };

    const full = sanitizeShortcutValue(patch.shortcuts.full);
    const window = sanitizeShortcutValue(patch.shortcuts.window);
    const region = sanitizeShortcutValue(patch.shortcuts.region);
    const quick = sanitizeShortcutValue(patch.shortcuts.quick);
    if (full !== undefined) shortcuts.full = full;
    if (window !== undefined) shortcuts.window = window;
    if (region !== undefined) shortcuts.region = region;
    if (quick !== undefined) shortcuts.quick = quick;

    if (typeof patch.shortcuts.quickMode === 'string') {
      const mode = patch.shortcuts.quickMode.trim();
      if (mode === 'region' || mode === 'window' || mode === 'full') {
        shortcuts.quickMode = mode;
      }
    }

    if (Object.keys(shortcuts).length > 0) {
      sanitized.shortcuts = shortcuts;
    }
  }
  return sanitized;
}

function stashRegionCaptureUi() {
  regionCaptureUiState = {
    launcherVisible: windowManager.isLauncherVisible(),
    previewVisible: windowManager.isPreviewVisible(),
  };
  windowManager.hideLauncher();
  windowManager.hidePreview();
}

function restoreRegionCaptureUi({ canceled } = {}) {
  if (!regionCaptureUiState) {
    return;
  }
  const { launcherVisible, previewVisible } = regionCaptureUiState;
  regionCaptureUiState = null;
  if (launcherVisible) {
    windowManager.showLauncher();
  }
  if (canceled && previewVisible) {
    windowManager.showPreviewWindow();
  }
}

function serializeRecentCaptures() {
  return recentCaptures.map((item) => ({
    dataUrl: item.dataUrl,
    thumbDataUrl: item.thumbDataUrl,
    savedPath: item.savedPath,
    width: item.width,
    height: item.height,
    createdAt: item.createdAt,
  }));
}

function persistRecentCaptures() {
  const persisted = recentCaptures
    .filter((item) => item.savedPath)
    .map((item) => ({
      savedPath: item.savedPath,
      width: item.width,
      height: item.height,
      createdAt: item.createdAt,
    }));
  storage.updateSettings({ recentCaptures: persisted });
}

function loadRecentCaptures() {
  const stored = storage.getSettings().recentCaptures || [];
  const loaded = [];

  stored.forEach((item) => {
    if (!item.savedPath || !fs.existsSync(item.savedPath)) {
      return;
    }
    const image = nativeImage.createFromPath(item.savedPath);
    if (!image || image.isEmpty()) {
      return;
    }
    const thumb = image.resize({ width: 240 });
    loaded.push({
      ...item,
      image,
      dataUrl: image.toDataURL(),
      thumbDataUrl: (thumb && !thumb.isEmpty()) ? thumb.toDataURL() : image.toDataURL(),
    });
  });

  recentCaptures.length = 0;
  recentCaptures.push(...loaded.slice(0, MAX_RECENTS));
  currentPreviewIndex = 0;
  persistRecentCaptures();
}

function buildPreviewPayload(index = 0) {
  const recent = serializeRecentCaptures();
  if (!recentCaptures.length) {
    lastCapture = null;
    return {
      dataUrl: null,
      savedPath: null,
      width: 0,
      height: 0,
      recent,
      selectedIndex: 0,
    };
  }

  const safeIndex = Math.min(Math.max(index, 0), recentCaptures.length - 1);
  const entry = recentCaptures[safeIndex];
  if (!entry.dataUrl && entry.image && !entry.image.isEmpty()) {
    entry.dataUrl = entry.image.toDataURL();
  }
  currentPreviewIndex = safeIndex;
  lastCapture = {
    image: entry.image,
    savedPath: entry.savedPath,
    width: entry.width,
    height: entry.height,
  };

  return {
    dataUrl: entry.dataUrl,
    savedPath: entry.savedPath,
    width: entry.width,
    height: entry.height,
    recent,
    selectedIndex: safeIndex,
  };
}

async function handleCapture(image, meta = {}) {
  if (!image || image.isEmpty()) {
    return;
  }

  const settings = storage.getSettings();
  const savedPath = null;
  if (settings.autoCopy) {
    clipboard.writeImage(image);
  }

  lastCapture = {
    image,
    savedPath,
    width: image.getSize().width,
    height: image.getSize().height,
    ...meta,
  };

  const thumbImage = image.resize({ width: 240 });
  const entry = {
    image,
    dataUrl: image.toDataURL(),
    thumbDataUrl: thumbImage && !thumbImage.isEmpty() ? thumbImage.toDataURL() : image.toDataURL(),
    savedPath,
    width: lastCapture.width,
    height: lastCapture.height,
    createdAt: Date.now(),
  };

  recentCaptures.unshift(entry);
  if (recentCaptures.length > MAX_RECENTS) {
    recentCaptures.pop();
  }
  currentPreviewIndex = 0;
  persistRecentCaptures();

  windowManager.showPreview(buildPreviewPayload(0));
}

async function startFullScreenCapture() {
  windowManager.hideMenu();
  const point = screen.getCursorScreenPoint();
  const result = await captureService.captureFullScreenAtPoint(point);
  if (!result) {
    return;
  }
  await handleCapture(result.image, { displayId: result.display?.id });
}

async function startRegionCapture() {
  stashRegionCaptureUi();
  windowManager.openOverlays();
}

async function startWindowCapture() {
  windowManager.hideMenu();
  const sources = await captureService.getWindowSources();
  if (!sources.length) {
    return;
  }
  windowManager.showPicker(sources);
}

async function startWebCapture(rawUrl) {
  if (!rawUrl) {
    return;
  }
  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  ensureWebCaptureSession();
  const captureWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: WEB_CAPTURE_PARTITION,
    },
  });

  try {
    await captureWindow.loadURL(targetUrl);
  } catch (error) {
    dialog.showMessageBox({
      type: 'error',
      message: '웹페이지를 열 수 없습니다.',
      detail: error?.message || String(error),
    });
    captureWindow.close();
    return;
  }

  await captureService.delay(300);

  const { webContents } = captureWindow;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const debuggerSession = webContents.debugger;
  let attached = false;
  try {
    if (!debuggerSession.isAttached()) {
      debuggerSession.attach('1.3');
      attached = true;
    }
    await debuggerSession.sendCommand('Page.enable');
    const metrics = await debuggerSession.sendCommand('Page.getLayoutMetrics');
    const contentSize = metrics?.contentSize || { width: 1280, height: 720 };
    const maxDimension = 16000;
    const width = Math.min(Math.ceil(contentSize.width || 1280), maxDimension);
    const height = Math.min(Math.ceil(contentSize.height || 720), maxDimension);

    await debuggerSession.sendCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const screenshot = await debuggerSession.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });

    await debuggerSession.sendCommand('Emulation.clearDeviceMetricsOverride');

    const dataUrl = `data:image/png;base64,${screenshot.data}`;
    const image = nativeImage.createFromDataURL(dataUrl);
    await handleCapture(image, { url: targetUrl, source: 'web' });

    if (contentSize.height > maxDimension || contentSize.width > maxDimension) {
      dialog.showMessageBox({
        type: 'warning',
        message: '페이지가 너무 길어 일부만 캡처되었습니다.',
        detail: '필요하면 페이지를 나눠서 캡처해 주세요.',
      });
    }
  } catch (error) {
    dialog.showMessageBox({
      type: 'error',
      message: '웹페이지 캡처에 실패했습니다.',
      detail: error?.message || String(error),
    });
  } finally {
    try {
      if (attached) {
        debuggerSession.detach();
      }
    } catch (error) {
      // ignore detach errors
    }
    captureWindow.close();
  }
}

function startQuickCapture() {
  const mode = storage.getSettings()?.shortcuts?.quickMode || 'region';
  if (mode === 'full') {
    startFullScreenCapture();
    return;
  }
  if (mode === 'window') {
    startWindowCapture();
    return;
  }
  startRegionCapture();
}

function registerShortcuts() {
  shortcutManager.register({
    shortcuts: storage.getSettings().shortcuts,
    onCaptureFull: startFullScreenCapture,
    onCaptureWindow: startWindowCapture,
    onCaptureRegion: startRegionCapture,
  });
}

function registerIpcHandlers() {
  ipcMain.on('overlay:selection', async (_event, payload) => {
    windowManager.closeOverlays();
    await captureService.delay(80);
    const result = await captureService.captureRegion(payload);
    if (!result) {
      restoreRegionCaptureUi({ canceled: true });
      return;
    }
    await handleCapture(result.image, { displayId: payload.displayId });
    restoreRegionCaptureUi({ canceled: false });
  });

  ipcMain.on('overlay:cancel', () => {
    windowManager.closeOverlays();
    restoreRegionCaptureUi({ canceled: true });
  });

  ipcMain.on('picker:select', async (_event, sourceId) => {
    windowManager.closePicker();
    await captureService.delay(60);
    const result = await captureService.captureWindowById(sourceId);
    if (!result) {
      return;
    }
    await handleCapture(result.image, { sourceId });
  });

  ipcMain.on('picker:cancel', () => {
    windowManager.closePicker();
  });

  ipcMain.handle('preview:copy', () => {
    if (!lastCapture?.image) {
      return false;
    }
    clipboard.writeImage(lastCapture.image);
    return true;
  });

  ipcMain.handle('preview:saveAs', async () => {
    if (!lastCapture?.image) {
      return null;
    }
    const settings = storage.getSettings();
    const ext = settings.format === 'jpg' ? 'jpg' : 'png';
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '캡처 저장',
      defaultPath: path.join(settings.saveFolder, storage.generateFilename(ext)),
      filters: [
        { name: ext.toUpperCase(), extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) {
      return null;
    }
    const savedPath = storage.saveImage(lastCapture.image, { filePath });
    lastCapture.savedPath = savedPath;
    windowManager.updatePreviewPath(savedPath);
    return savedPath;
  });

  ipcMain.handle('preview:saveAll', async () => {
    if (!recentCaptures.length) {
      return false;
    }
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '저장할 폴더 선택',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths?.length) {
      return false;
    }
    const targetFolder = filePaths[0];
    let updated = false;
    recentCaptures.forEach((entry, index) => {
      if (!entry?.image || entry.image.isEmpty()) {
        return;
      }
      if (entry.savedPath) {
        return;
      }
      const savedPath = storage.saveImage(entry.image, { folder: targetFolder });
      entry.savedPath = savedPath;
      updated = true;
      if (index === currentPreviewIndex && lastCapture) {
        lastCapture.savedPath = savedPath;
      }
    });
    if (updated) {
      persistRecentCaptures();
      const selected = recentCaptures[currentPreviewIndex];
      if (selected?.savedPath) {
        windowManager.updatePreviewPath(selected.savedPath);
      }
      windowManager.showPreview(buildPreviewPayload(currentPreviewIndex));
    }
    return true;
  });

  ipcMain.handle('preview:deleteAll', () => {
    if (!recentCaptures.length) {
      return false;
    }
    recentCaptures.length = 0;
    currentPreviewIndex = 0;
    lastCapture = null;
    persistRecentCaptures();
    windowManager.showPreview(buildPreviewPayload(0));
    return true;
  });

  ipcMain.handle('preview:openFolder', () => {
    const target = lastCapture?.savedPath;
    if (target) {
      shell.showItemInFolder(target);
    } else {
      shell.openPath(storage.getSettings().saveFolder);
    }
    return true;
  });

  ipcMain.on('preview:close', () => {
    windowManager.closePreview();
  });

  ipcMain.on('preview:select', (_event, index) => {
    const selectedIndex = Number(index);
    if (!Number.isInteger(selectedIndex)) {
      return;
    }
    const entry = recentCaptures[selectedIndex];
    if (!entry) {
      return;
    }
    lastCapture = {
      image: entry.image,
      savedPath: entry.savedPath,
      width: entry.width,
      height: entry.height,
    };
    currentPreviewIndex = selectedIndex;
    windowManager.showPreview(buildPreviewPayload(selectedIndex));
  });

  ipcMain.on('preview:updateImage', (_event, payload) => {
    if (!payload?.dataUrl) {
      return;
    }
    const image = nativeImage.createFromDataURL(payload.dataUrl);
    lastCapture = {
      image,
      savedPath: lastCapture?.savedPath || null,
      width: payload.width || image.getSize().width,
      height: payload.height || image.getSize().height,
    };

    const index = Number(payload.selectedIndex ?? currentPreviewIndex);
    if (Number.isInteger(index) && recentCaptures[index]) {
      const thumb = image.resize({ width: 240 });
      recentCaptures[index] = {
        ...recentCaptures[index],
        image,
        dataUrl: payload.dataUrl,
        thumbDataUrl: thumb && !thumb.isEmpty() ? thumb.toDataURL() : payload.dataUrl,
        width: lastCapture.width,
        height: lastCapture.height,
      };
      if (recentCaptures[index].savedPath) {
        storage.saveImage(image, { filePath: recentCaptures[index].savedPath });
      }
      persistRecentCaptures();
    }
  });

  ipcMain.on('preview:show', () => {
    windowManager.showPreview(buildPreviewPayload(currentPreviewIndex));
  });

  ipcMain.handle('launcher:getSettings', () => storage.getSettings());

  ipcMain.handle('launcher:updateSettings', (_event, patch) => {
    const sanitizedPatch = sanitizeSettingsPatch(patch);
    if (!Object.keys(sanitizedPatch).length) {
      return storage.getSettings();
    }
    storage.updateSettings(sanitizedPatch);
    const settings = storage.getSettings();
    if (Object.prototype.hasOwnProperty.call(sanitizedPatch, 'showLauncher')) {
      if (settings.showLauncher) {
        windowManager.showLauncher();
      } else {
        windowManager.hideLauncher();
      }
    }
    return settings;
  });

  ipcMain.on('launcher:capture:region', startRegionCapture);
  ipcMain.on('launcher:capture:window', startWindowCapture);
  ipcMain.on('launcher:capture:full', startFullScreenCapture);
  ipcMain.on('launcher:capture:scroll', () => windowManager.showWebCapture());
  ipcMain.on('launcher:show', () => {
    storage.updateSettings({ showLauncher: true });
    windowManager.showLauncher();
  });
  ipcMain.on('launcher:hide', () => {
    storage.updateSettings({ showLauncher: false });
    windowManager.hideLauncher();
  });
  ipcMain.on('launcher:minimize', () => {
    windowManager.minimizeLauncher();
    windowManager.flashLauncher(2200);
  });
  ipcMain.on('launcher:closeToTray', () => {
    windowManager.hideLauncher();
    trayManager.flash({ times: 6, interval: 320 });
  });
  ipcMain.on('launcher:openFolder', () => storage.openFolder());
  ipcMain.on('launcher:openPreview', () => {
    windowManager.showPreview(buildPreviewPayload(currentPreviewIndex));
  });
  ipcMain.on('launcher:openSettings', () => {
    windowManager.showSettings();
  });
  ipcMain.on('launcher:quit', () => app.quit());
  ipcMain.on('launcher:resize', (_event, height) => {
    if (Number.isFinite(height)) {
      windowManager.resizeLauncher(height);
    }
  });
  ipcMain.on('launcher:menu:toggle', () => windowManager.toggleMenu());
  ipcMain.on('launcher:menu:hide', () => windowManager.hideMenu());

  ipcMain.handle('menu:getSettings', () => storage.getSettings());
  ipcMain.handle('menu:updateSettings', (_event, patch) => {
    const sanitizedPatch = sanitizeSettingsPatch(patch);
    if (!Object.keys(sanitizedPatch).length) {
      return storage.getSettings();
    }
    storage.updateSettings(sanitizedPatch);
    const settings = storage.getSettings();
    if (Object.prototype.hasOwnProperty.call(sanitizedPatch, 'showLauncher')) {
      if (settings.showLauncher) {
        windowManager.showLauncher();
      } else {
        windowManager.hideLauncher();
        windowManager.hideMenu();
      }
    }
    return settings;
  });
  ipcMain.on('menu:openFolder', () => storage.openFolder());
  ipcMain.on('menu:hideLauncher', () => {
    storage.updateSettings({ showLauncher: false });
    windowManager.hideLauncher();
    windowManager.hideMenu();
  });
  ipcMain.on('menu:quit', () => app.quit());
  ipcMain.on('menu:close', () => windowManager.hideMenu());

  ipcMain.handle('settings:get', () => storage.getSettings());
  ipcMain.handle('settings:update', (_event, patch) => {
    const sanitizedPatch = sanitizeSettingsPatch(patch);
    if (!Object.keys(sanitizedPatch).length) {
      return storage.getSettings();
    }
    storage.updateSettings(sanitizedPatch);
    const settings = storage.getSettings();
    if (sanitizedPatch?.shortcuts) {
      if (!settingsOpen) {
        registerShortcuts();
      }
    }
    return settings;
  });
  ipcMain.on('settings:close', () => windowManager.closeSettings());

  ipcMain.on('webcapture:submit', async (_event, url) => {
    windowManager.closeWebCapture();
    await startWebCapture(url);
  });

  ipcMain.on('webcapture:cancel', () => {
    windowManager.closeWebCapture();
  });
}

function boot() {
  storage.init();
  loadRecentCaptures();
  registerIpcHandlers();

  windowManager.configurePreview({
    getBounds: () => storage.getSettings().previewWindowBounds,
    saveBounds: (bounds) => storage.updateSettings({ previewWindowBounds: bounds }),
  });
  windowManager.configureSettingsHooks({
    onShow: () => {
      if (!settingsOpen) {
        settingsOpen = true;
        shortcutManager.unregister();
      }
    },
    onClose: () => {
      if (settingsOpen) {
        settingsOpen = false;
        registerShortcuts();
      }
    },
  });

  trayManager.init({
    onCaptureFull: startFullScreenCapture,
    onCaptureWindow: startWindowCapture,
    onCaptureRegion: startRegionCapture,
    onQuickCapture: startQuickCapture,
    onOpenFolder: () => storage.openFolder(),
    onShowLauncher: () => {
      storage.updateSettings({ showLauncher: true });
      windowManager.showLauncher();
    },
    onOpenPreview: () => windowManager.showPreview(buildPreviewPayload(currentPreviewIndex)),
    onQuit: () => app.quit(),
  });

  registerShortcuts();

  if (storage.getSettings().showLauncher) {
    windowManager.showLauncher();
  }
}

app.whenReady().then(boot);

app.on('activate', () => {
  if (!trayManager.isReady()) {
    trayManager.init({
      onCaptureFull: startFullScreenCapture,
      onCaptureWindow: startWindowCapture,
      onCaptureRegion: startRegionCapture,
      onQuickCapture: startQuickCapture,
      onOpenFolder: () => storage.openFolder(),
      onShowLauncher: () => {
        storage.updateSettings({ showLauncher: true });
        windowManager.showLauncher();
      },
      onOpenPreview: () => windowManager.showPreview(buildPreviewPayload(currentPreviewIndex)),
      onQuit: () => app.quit(),
    });
  }

  if (storage.getSettings()?.showLauncher) {
    windowManager.showLauncher();
  }
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  shortcutManager.unregister();
  trayManager.destroy();
  windowManager.closeOverlays();
  windowManager.closePreview();
  windowManager.closePicker();
  windowManager.hideMenu();
  windowManager.closeSettings();
});
