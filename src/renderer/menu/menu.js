const toggleLauncher = document.getElementById('toggleLauncher');
const toggleCopy = document.getElementById('toggleCopy');
const openFolderButton = document.getElementById('openFolder');
const hideLauncherButton = document.getElementById('hideLauncher');
const quitButton = document.getElementById('quitApp');

function applySettings(settings) {
  toggleLauncher.checked = !!settings.showLauncher;
  toggleCopy.checked = !!settings.autoCopy;
}

toggleLauncher.addEventListener('change', async () => {
  await window.menuApi.updateSettings({ showLauncher: toggleLauncher.checked });
});

toggleCopy.addEventListener('change', async () => {
  await window.menuApi.updateSettings({ autoCopy: toggleCopy.checked });
});

openFolderButton.addEventListener('click', () => {
  window.menuApi.openFolder();
  window.menuApi.close();
});

hideLauncherButton.addEventListener('click', async () => {
  await window.menuApi.updateSettings({ showLauncher: false });
  window.menuApi.close();
});

quitButton.addEventListener('click', () => {
  window.menuApi.quit();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.menuApi.close();
  }
});

window.menuApi.getSettings().then(applySettings);
