const launcher = document.getElementById('launcher');
const menuButton = document.getElementById('menuButton');
const minimizeButton = document.getElementById('minimizeButton');
const closeButton = document.getElementById('closeButton');
const COLLAPSED_HEIGHT = 86;

launcher.addEventListener('click', (event) => {
  const button = event.target.closest('.tool');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  if (action === 'region') {
    window.launcherApi.hideMenu();
    window.launcherApi.captureRegion();
  } else if (action === 'window') {
    window.launcherApi.hideMenu();
    window.launcherApi.captureWindow();
  } else if (action === 'full') {
    window.launcherApi.hideMenu();
    window.launcherApi.captureFull();
  } else if (action === 'scroll') {
    window.launcherApi.hideMenu();
    window.launcherApi.captureScroll();
  } else if (action === 'preview') {
    window.launcherApi.hideMenu();
    window.launcherApi.openPreview();
  } else if (action === 'settings') {
    window.launcherApi.hideMenu();
    window.launcherApi.openSettings();
  }
});

menuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  window.launcherApi.toggleMenu();
});

if (minimizeButton) {
  minimizeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    window.launcherApi.hideMenu();
    window.launcherApi.minimize();
  });
}

if (closeButton) {
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    window.launcherApi.hideMenu();
    window.launcherApi.closeToTray();
  });
}

window.launcherApi.resize(COLLAPSED_HEIGHT);
