const { globalShortcut } = require('electron');

function registerShortcut(accelerator, handler) {
  if (!accelerator || typeof accelerator !== 'string') {
    return;
  }
  const trimmed = accelerator.trim();
  if (!trimmed) {
    return;
  }
  globalShortcut.register(trimmed, () => handler?.());
}

function resolveQuickHandler(shortcuts, handlers) {
  const mode = shortcuts?.quickMode || 'region';
  if (mode === 'window') {
    return handlers.onCaptureWindow;
  }
  if (mode === 'full') {
    return handlers.onCaptureFull;
  }
  return handlers.onCaptureRegion;
}

function register({ shortcuts = {}, onCaptureFull, onCaptureWindow, onCaptureRegion }) {
  globalShortcut.unregisterAll();

  registerShortcut(shortcuts.full, onCaptureFull);
  registerShortcut(shortcuts.window, onCaptureWindow);
  registerShortcut(shortcuts.region, onCaptureRegion);

  const quickHandler = resolveQuickHandler(shortcuts, {
    onCaptureFull,
    onCaptureWindow,
    onCaptureRegion,
  });
  registerShortcut(shortcuts.quick, quickHandler);
}

function unregister() {
  globalShortcut.unregisterAll();
}

module.exports = {
  register,
  unregister,
};
