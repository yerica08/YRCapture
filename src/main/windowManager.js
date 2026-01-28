const { BrowserWindow, screen } = require('electron');
const path = require('path');

let overlayWindows = new Map();
let previewWindow = null;
let pickerWindow = null;
let launcherWindow = null;
let menuWindow = null;
let settingsWindow = null;
let webCaptureWindow = null;
let pendingPreviewPayload = null;
let pendingPreviewPath = null;
let pendingPickerSources = null;
const menuSize = { width: 220, height: 300 };
let lastMenuHideAt = 0;
let previewConfig = {
  getBounds: null,
  saveBounds: null,
};
let previewBoundsTimer = null;
let settingsHooks = {
  onShow: null,
  onClose: null,
};

function buildWindowOptions() {
  return {
    icon: path.join(__dirname, '..', 'img', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

function configurePreview(config = {}) {
  previewConfig = { ...previewConfig, ...config };
}

function configureSettingsHooks(hooks = {}) {
  settingsHooks = { ...settingsHooks, ...hooks };
}

function getDefaultPreviewBounds() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = Math.round(workArea.width * 0.8);
  const height = Math.round(workArea.height * 0.8);
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);
  return { x, y, width, height };
}

function normalizePreviewBounds(bounds) {
  const fallback = getDefaultPreviewBounds();
  const display = screen.getDisplayNearestPoint({
    x: bounds?.x ?? fallback.x,
    y: bounds?.y ?? fallback.y,
  });
  const workArea = display.workArea;

  const minWidth = 320;
  const minHeight = 240;

  const width = Math.min(
    workArea.width,
    Math.max(minWidth, bounds?.width ?? fallback.width)
  );
  const height = Math.min(
    workArea.height,
    Math.max(minHeight, bounds?.height ?? fallback.height)
  );

  const x = Math.min(
    Math.max(bounds?.x ?? fallback.x, workArea.x),
    workArea.x + workArea.width - width
  );
  const y = Math.min(
    Math.max(bounds?.y ?? fallback.y, workArea.y),
    workArea.y + workArea.height - height
  );

  return { x, y, width, height };
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    ...buildWindowOptions(),
    width: 680,
    height: 86,
    resizable: false,
    frame: false,
    transparent: true,
    minimizable: true,
    skipTaskbar: false,
    movable: true,
  });

  launcherWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'launcher', 'launcher.html')
  );

  launcherWindow.on('move', () => {
    hideMenu();
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
    hideMenu();
  });
}

function showLauncher() {
  if (!launcherWindow) {
    createLauncherWindow();
  }
  launcherWindow.show();
}

function isLauncherVisible() {
  return !!launcherWindow && !launcherWindow.isDestroyed() && launcherWindow.isVisible();
}

function hideLauncher() {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.hide();
  }
  hideMenu();
}

function minimizeLauncher() {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.minimize();
  }
}

function flashLauncher(durationMs = 2000) {
  if (!launcherWindow || launcherWindow.isDestroyed()) {
    return;
  }
  launcherWindow.flashFrame(true);
  setTimeout(() => {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.flashFrame(false);
    }
  }, Math.max(500, durationMs));
}

function resizeLauncher(height) {
  if (!launcherWindow || launcherWindow.isDestroyed()) {
    return;
  }
  const [width] = launcherWindow.getSize();
  launcherWindow.setSize(width, height);
}

function createMenuWindow() {
  menuWindow = new BrowserWindow({
    ...buildWindowOptions(),
    width: menuSize.width,
    height: menuSize.height,
    resizable: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    movable: false,
    hasShadow: false,
  });

  menuWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'menu', 'menu.html')
  );

  menuWindow.on('blur', () => {
    hideMenu();
  });

  menuWindow.on('closed', () => {
    menuWindow = null;
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    ...buildWindowOptions(),
    width: 520,
    height: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    title: 'YRcapture 설정',
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.setAutoHideMenuBar(true);

  settingsWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'settings', 'settings.html')
  );

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    settingsHooks.onClose?.();
  });
}

function showSettings() {
  if (!settingsWindow) {
    createSettingsWindow();
  }
  settingsWindow.show();
  settingsWindow.focus();
  settingsHooks.onShow?.();
}

function closeSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
}

function getLauncherBounds() {
  if (!launcherWindow || launcherWindow.isDestroyed()) {
    return null;
  }
  return launcherWindow.getBounds();
}

function positionMenu() {
  const bounds = getLauncherBounds();
  if (!bounds || !menuWindow) {
    return;
  }

  const anchorX = bounds.x + bounds.width - menuSize.width - 8;
  const anchorY = bounds.y + bounds.height + 6;
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const workArea = display.workArea;

  const x = Math.min(
    Math.max(anchorX, workArea.x),
    workArea.x + workArea.width - menuSize.width
  );
  const y = Math.min(
    Math.max(anchorY, workArea.y),
    workArea.y + workArea.height - menuSize.height
  );

  menuWindow.setBounds({ x, y, width: menuSize.width, height: menuSize.height });
}

function showMenu() {
  if (!launcherWindow) {
    return;
  }
  if (!menuWindow) {
    createMenuWindow();
  }
  positionMenu();
  menuWindow.show();
  menuWindow.focus();
}

function hideMenu() {
  if (menuWindow && !menuWindow.isDestroyed()) {
    menuWindow.hide();
  }
  lastMenuHideAt = Date.now();
}

function toggleMenu() {
  const recentlyHidden = Date.now() - lastMenuHideAt < 250;
  if (recentlyHidden) {
    return;
  }
  if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
    showMenu();
  } else {
    hideMenu();
  }
}

function openOverlays() {
  closeOverlays();
  const displays = screen.getAllDisplays();

  displays.forEach((display) => {
    const overlayWindow = new BrowserWindow({
      ...buildWindowOptions(),
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.loadFile(
      path.join(__dirname, '..', 'renderer', 'overlay', 'overlay.html')
    );

    overlayWindow.webContents.once('did-finish-load', () => {
      overlayWindow.webContents.send('overlay:init', {
        displayId: display.id,
        scaleFactor: display.scaleFactor,
      });
      overlayWindow.focus();
    });

    overlayWindow.on('closed', () => {
      overlayWindows.delete(display.id);
    });

    overlayWindows.set(display.id, overlayWindow);
  });
}

function closeOverlays() {
  overlayWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });
  overlayWindows.clear();
}

function createPreviewWindow() {
  const savedBounds = previewConfig.getBounds?.();
  const initialBounds = normalizePreviewBounds(savedBounds);

  previewWindow = new BrowserWindow({
    ...buildWindowOptions(),
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 320,
    minHeight: 240,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    title: 'YRcapture Preview',
  });
  previewWindow.setMenuBarVisibility(false);
  previewWindow.setAutoHideMenuBar(true);

  previewWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'preview', 'preview.html')
  );

  previewWindow.webContents.once('did-finish-load', () => {
    if (pendingPreviewPayload) {
      previewWindow.webContents.send('preview:image', pendingPreviewPayload);
      pendingPreviewPayload = null;
    }
    if (pendingPreviewPath) {
      previewWindow.webContents.send('preview:path', pendingPreviewPath);
      pendingPreviewPath = null;
    }
  });

  const scheduleSaveBounds = () => {
    if (!previewConfig.saveBounds || !previewWindow) {
      return;
    }
    if (previewBoundsTimer) {
      clearTimeout(previewBoundsTimer);
    }
    previewBoundsTimer = setTimeout(() => {
      if (previewWindow && !previewWindow.isDestroyed()) {
        previewConfig.saveBounds(previewWindow.getBounds());
      }
    }, 300);
  };

  previewWindow.on('resize', scheduleSaveBounds);
  previewWindow.on('move', scheduleSaveBounds);

  previewWindow.on('close', () => {
    if (previewConfig.saveBounds && previewWindow && !previewWindow.isDestroyed()) {
      previewConfig.saveBounds(previewWindow.getBounds());
    }
  });

  previewWindow.on('closed', () => {
    if (previewBoundsTimer) {
      clearTimeout(previewBoundsTimer);
      previewBoundsTimer = null;
    }
    previewWindow = null;
  });
}

function showPreview(payload) {
  if (!previewWindow) {
    createPreviewWindow();
  }
  previewWindow.show();
  previewWindow.focus();
  if (previewWindow.webContents.isLoading()) {
    pendingPreviewPayload = payload;
  } else {
    previewWindow.webContents.send('preview:image', payload);
  }
}

function isPreviewVisible() {
  return !!previewWindow && !previewWindow.isDestroyed() && previewWindow.isVisible();
}

function showPreviewWindow() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.show();
  }
}

function hidePreview() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.hide();
  }
}

function updatePreviewPath(savedPath) {
  if (previewWindow && !previewWindow.isDestroyed()) {
    if (previewWindow.webContents.isLoading()) {
      pendingPreviewPath = savedPath;
    } else {
      previewWindow.webContents.send('preview:path', savedPath);
    }
  }
}

function closePreview() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close();
  }
  previewWindow = null;
}

function createPickerWindow() {
  pickerWindow = new BrowserWindow({
    ...buildWindowOptions(),
    width: 720,
    height: 520,
    resizable: true,
    alwaysOnTop: true,
    title: '창 선택',
  });

  pickerWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'picker', 'picker.html')
  );

  pickerWindow.webContents.once('did-finish-load', () => {
    if (pendingPickerSources) {
      pickerWindow.webContents.send('picker:sources', pendingPickerSources);
      pendingPickerSources = null;
    }
  });

  pickerWindow.on('closed', () => {
    pickerWindow = null;
  });
}

function showPicker(sources) {
  if (!pickerWindow) {
    createPickerWindow();
  }
  pickerWindow.show();
  if (pickerWindow.webContents.isLoading()) {
    pendingPickerSources = sources;
  } else {
    pickerWindow.webContents.send('picker:sources', sources);
  }
}

function closePicker() {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.close();
  }
  pickerWindow = null;
}

function createWebCaptureWindow() {
  webCaptureWindow = new BrowserWindow({
    ...buildWindowOptions(),
    width: 420,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    title: '웹페이지 캡처',
  });

  webCaptureWindow.setMenuBarVisibility(false);
  webCaptureWindow.setAutoHideMenuBar(true);

  webCaptureWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'webcapture', 'webcapture.html')
  );

  webCaptureWindow.on('closed', () => {
    webCaptureWindow = null;
  });
}

function showWebCapture() {
  if (!webCaptureWindow) {
    createWebCaptureWindow();
  }
  webCaptureWindow.show();
  webCaptureWindow.focus();
}

function closeWebCapture() {
  if (webCaptureWindow && !webCaptureWindow.isDestroyed()) {
    webCaptureWindow.close();
  }
  webCaptureWindow = null;
}

module.exports = {
  configurePreview,
  configureSettingsHooks,
  openOverlays,
  closeOverlays,
  showPreview,
  isPreviewVisible,
  showPreviewWindow,
  hidePreview,
  updatePreviewPath,
  closePreview,
  showPicker,
  closePicker,
  showLauncher,
  isLauncherVisible,
  hideLauncher,
  minimizeLauncher,
  flashLauncher,
  resizeLauncher,
  showMenu,
  hideMenu,
  toggleMenu,
  showSettings,
  closeSettings,
  showWebCapture,
  closeWebCapture,
};
