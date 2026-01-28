const { Menu, Tray, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

let tray = null;
let trayIcon = null;
let flashTimer = null;

const TRANSPARENT_PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XH+oQAAAAASUVORK5CYII=';

function buildIcon() {
  const logoPath = path.join(__dirname, '..', 'img', 'logo.png');
  const trayPath = path.join(__dirname, '..', 'img', 'tray.png');
  const preferredPath = fs.existsSync(logoPath) ? logoPath : trayPath;
  if (fs.existsSync(preferredPath)) {
    const image = nativeImage.createFromPath(preferredPath);
    if (image && !image.isEmpty()) {
      return image;
    }
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="8" y="14" width="48" height="36" rx="6" fill="#1f1f1f"/>
      <rect x="12" y="18" width="40" height="28" rx="4" fill="#3ddc97"/>
      <circle cx="44" cy="26" r="5" fill="#1f1f1f"/>
      <rect x="26" y="8" width="12" height="6" rx="2" fill="#1f1f1f"/>
    </svg>`;

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return nativeImage.createFromDataURL(dataUrl);
}

function init({
  onCaptureFull,
  onCaptureWindow,
  onCaptureRegion,
  onQuickCapture,
  onOpenFolder,
  onShowLauncher,
  onOpenPreview,
  onQuit,
}) {
  if (tray) {
    return;
  }

  trayIcon = buildIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip('YRcapture');

  const contextMenu = Menu.buildFromTemplate([
    { label: '실행창 열기', click: onShowLauncher },
    { label: '결과창 열기', click: onOpenPreview },
    { type: 'separator' },
    { label: '영역 캡처 (Ctrl+Shift+3)', click: onCaptureRegion },
    { label: '전체 화면 캡처 (Ctrl+Shift+1)', click: onCaptureFull },
    { label: '창 캡처 (Ctrl+Shift+2)', click: onCaptureWindow },
    { type: 'separator' },
    { label: '저장 폴더 열기', click: onOpenFolder },
    { type: 'separator' },
    { label: '종료', click: onQuit },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (onShowLauncher) {
      onShowLauncher();
      return;
    }
    if (onQuickCapture) {
      onQuickCapture();
      return;
    }
    tray.popUpContextMenu();
  });
  tray.on('right-click', () => tray.popUpContextMenu());
}

function flash({ times = 6, interval = 350 } = {}) {
  if (!tray) {
    return;
  }
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  const emptyIcon = nativeImage.createFromDataURL(TRANSPARENT_PNG);
  const maxTicks = Math.max(1, times) * 2;
  let tick = 0;

  flashTimer = setInterval(() => {
    if (!tray || !trayIcon) {
      clearInterval(flashTimer);
      flashTimer = null;
      return;
    }
    tray.setImage(tick % 2 === 0 ? emptyIcon : trayIcon);
    tick += 1;
    if (tick >= maxTicks) {
      tray.setImage(trayIcon);
      clearInterval(flashTimer);
      flashTimer = null;
    }
  }, interval);
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
    trayIcon = null;
  }
}

function isReady() {
  return !!tray;
}

module.exports = {
  init,
  destroy,
  isReady,
  flash,
};
