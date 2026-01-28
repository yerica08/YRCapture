const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  onInit: (callback) => ipcRenderer.on('overlay:init', (_event, data) => callback(data)),
  completeSelection: (rect) => ipcRenderer.send('overlay:selection', rect),
  cancel: () => ipcRenderer.send('overlay:cancel'),
});

contextBridge.exposeInMainWorld('previewApi', {
  onImage: (callback) => ipcRenderer.on('preview:image', (_event, data) => callback(data)),
  onPath: (callback) => ipcRenderer.on('preview:path', (_event, data) => callback(data)),
  copy: () => ipcRenderer.invoke('preview:copy'),
  saveAs: () => ipcRenderer.invoke('preview:saveAs'),
  saveAll: () => ipcRenderer.invoke('preview:saveAll'),
  deleteAll: () => ipcRenderer.invoke('preview:deleteAll'),
  openFolder: () => ipcRenderer.invoke('preview:openFolder'),
  close: () => ipcRenderer.send('preview:close'),
  select: (index) => ipcRenderer.send('preview:select', index),
  updateImage: (payload) => ipcRenderer.send('preview:updateImage', payload),
  show: () => ipcRenderer.send('preview:show'),
});

contextBridge.exposeInMainWorld('pickerApi', {
  onSources: (callback) => ipcRenderer.on('picker:sources', (_event, data) => callback(data)),
  select: (sourceId) => ipcRenderer.send('picker:select', sourceId),
  cancel: () => ipcRenderer.send('picker:cancel'),
});

contextBridge.exposeInMainWorld('launcherApi', {
  getSettings: () => ipcRenderer.invoke('launcher:getSettings'),
  updateSettings: (patch) => ipcRenderer.invoke('launcher:updateSettings', patch),
  captureRegion: () => ipcRenderer.send('launcher:capture:region'),
  captureWindow: () => ipcRenderer.send('launcher:capture:window'),
  captureFull: () => ipcRenderer.send('launcher:capture:full'),
  captureScroll: () => ipcRenderer.send('launcher:capture:scroll'),
  show: () => ipcRenderer.send('launcher:show'),
  hide: () => ipcRenderer.send('launcher:hide'),
  minimize: () => ipcRenderer.send('launcher:minimize'),
  openFolder: () => ipcRenderer.send('launcher:openFolder'),
  openPreview: () => ipcRenderer.send('launcher:openPreview'),
  openSettings: () => ipcRenderer.send('launcher:openSettings'),
  closeToTray: () => ipcRenderer.send('launcher:closeToTray'),
  quit: () => ipcRenderer.send('launcher:quit'),
  resize: (height) => ipcRenderer.send('launcher:resize', height),
  toggleMenu: () => ipcRenderer.send('launcher:menu:toggle'),
  hideMenu: () => ipcRenderer.send('launcher:menu:hide'),
});

contextBridge.exposeInMainWorld('menuApi', {
  getSettings: () => ipcRenderer.invoke('menu:getSettings'),
  updateSettings: (patch) => ipcRenderer.invoke('menu:updateSettings', patch),
  openFolder: () => ipcRenderer.send('menu:openFolder'),
  hideLauncher: () => ipcRenderer.send('menu:hideLauncher'),
  quit: () => ipcRenderer.send('menu:quit'),
  close: () => ipcRenderer.send('menu:close'),
});

contextBridge.exposeInMainWorld('settingsApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  close: () => ipcRenderer.send('settings:close'),
});

contextBridge.exposeInMainWorld('webCaptureApi', {
  submit: (url) => ipcRenderer.send('webcapture:submit', url),
  cancel: () => ipcRenderer.send('webcapture:cancel'),
});
