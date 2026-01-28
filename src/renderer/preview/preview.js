const previewCanvas = document.getElementById('previewCanvas');
const previewStage = document.querySelector('.image-stage');
const meta = document.getElementById('meta');
const pathLabel = document.getElementById('path');
const recentList = document.getElementById('recentList');
const recentCount = document.getElementById('recentCount');
const saveAllButton = document.getElementById('saveAllButton');
const deleteAllButton = document.getElementById('deleteAllButton');

const copyButton = document.getElementById('copy');
const saveAsButton = document.getElementById('saveAs');
const openFolderButton = document.getElementById('openFolder');
const toolButtons = Array.from(document.querySelectorAll('[data-tool]'));
const actionButtons = Array.from(document.querySelectorAll('[data-action]'));
const colorInput = document.getElementById('strokeColor');
const swatches = Array.from(document.querySelectorAll('[data-swatch]'));
const stepButtons = Array.from(document.querySelectorAll('[data-step]'));
const sizeInput = document.getElementById('strokeSize');
const sizeValue = document.getElementById('strokeSizeValue');
const opacityInput = document.getElementById('strokeOpacity');
const opacityValue = document.getElementById('strokeOpacityValue');
const textSizeInput = document.getElementById('textSize');
const textSizeValue = document.getElementById('textSizeValue');
const fillToggle = document.getElementById('fillToggle');

const ctx = previewCanvas.getContext('2d');

const MAX_HISTORY = 20;

let currentTool = 'pen';
let strokeColor = colorInput.value || '#ff3b30';
let strokeSize = Number(sizeInput.value) || 3;
let strokeOpacity = Number(opacityInput.value) || 100;
let fillEnabled = fillToggle.checked;
let textSize = Number(textSizeInput.value) || 20;
let isDrawing = false;
let startPoint = null;
let baseImageData = null;
let history = [];
let historyIndex = -1;
let currentRecent = [];
let selectedIndex = 0;
let syncTimer = null;

const mosaicCanvas = document.createElement('canvas');
const mosaicCtx = mosaicCanvas.getContext('2d');

const textInput = document.createElement('div');
textInput.className = 'text-input';
textInput.dataset.placeholder = '텍스트 입력';
textInput.contentEditable = 'true';
textInput.spellcheck = false;
textInput.style.display = 'none';
previewStage.appendChild(textInput);
let textAnchor = null;

const cropOverlay = document.createElement('div');
cropOverlay.className = 'crop-overlay';
cropOverlay.style.display = 'none';
const cropRect = document.createElement('div');
cropRect.className = 'crop-rect';
cropOverlay.appendChild(cropRect);
const cropHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
cropHandles.forEach((handle) => {
  const dot = document.createElement('div');
  dot.className = `crop-handle crop-handle--${handle}`;
  cropRect.appendChild(dot);
});
previewStage.appendChild(cropOverlay);
const CROP_HANDLE_SIZE = 10;
const MIN_CROP_SIZE = 4;
let cropRectState = null;
let cropDrag = null;

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTime(timestamp) {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const normalized =
    value.length === 3
      ? value.split('').map((char) => char + char).join('')
      : value;
  const intValue = parseInt(normalized, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStrokeStyle() {
  return hexToRgba(strokeColor, strokeOpacity / 100);
}

function setStrokeColor(color) {
  strokeColor = color;
  colorInput.value = color;
  swatches.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.swatch === color);
  });
  if (textInput.style.display !== 'none') {
    const textColor = getStrokeStyle();
    textInput.style.color = textColor;
    textInput.style.caretColor = textColor;
  }
}

function setStrokeStyle() {
  ctx.strokeStyle = getStrokeStyle();
  ctx.lineWidth = strokeSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
}

function setFillStyle() {
  ctx.fillStyle = getStrokeStyle();
}

function updateSettingLabels() {
  sizeValue.textContent = `${strokeSize}`;
  opacityValue.textContent = `${strokeOpacity}%`;
  textSizeValue.textContent = `${textSize}`;
}

function updateMeta(payload = {}) {
  meta.textContent = `${payload.width || 0} × ${payload.height || 0}`;
  pathLabel.textContent = payload.savedPath || '저장 위치 없음';
}

function renderRecentList(recent = [], selected = 0) {
  recentList.innerHTML = '';
  if (recent.length === 0) {
    recentCount.textContent = '0';
  } else {
    const safeSelected = Math.max(0, Math.min(selected, recent.length - 1));
    recentCount.textContent = `${safeSelected + 1}/${recent.length}`;
  }
  if (saveAllButton) {
    saveAllButton.disabled = recent.length === 0;
  }
  if (deleteAllButton) {
    deleteAllButton.disabled = recent.length === 0;
  }

  if (!recent.length) {
    const empty = document.createElement('div');
    empty.className = 'recent-item';
    empty.textContent = '최근 캡처가 없습니다.';
    empty.style.cursor = 'default';
    recentList.appendChild(empty);
    return;
  }

  recent.forEach((item, index) => {
    const entry = document.createElement('div');
    entry.className = 'recent-item';
    if (index === selected) {
      entry.classList.add('is-active');
    }

    const thumb = document.createElement('img');
    thumb.className = 'recent-thumb';
    thumb.src = item.thumbDataUrl || item.dataUrl;
    thumb.alt = '최근 캡처';

    const metaRow = document.createElement('div');
    metaRow.className = 'recent-meta';

    const size = document.createElement('span');
    size.textContent = `${item.width}×${item.height}`;

    const time = document.createElement('span');
    time.textContent = formatTime(item.createdAt);

    metaRow.appendChild(size);
    metaRow.appendChild(time);

    entry.appendChild(thumb);
    entry.appendChild(metaRow);

    entry.addEventListener('click', () => {
      window.previewApi.select(index);
    });

    recentList.appendChild(entry);
  });
}

function setActiveTool(tool) {
  currentTool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === tool);
  });
  if (tool !== 'crop') {
    cropDrag = null;
    cropRectState = null;
    cropOverlay.classList.remove('is-dragging');
    clearCropOverlay();
    previewCanvas.style.cursor = 'default';
  } else {
    cropDrag = null;
    cropRectState = null;
    previewCanvas.style.cursor = 'default';
    showCropOverlay();
  }
}

function resetHistory() {
  history = [];
  historyIndex = -1;
}

function snapshotCanvas() {
  return {
    imageData: ctx.getImageData(0, 0, previewCanvas.width, previewCanvas.height),
    width: previewCanvas.width,
    height: previewCanvas.height,
  };
}

function applySnapshot(snapshot) {
  previewCanvas.width = snapshot.width;
  previewCanvas.height = snapshot.height;
  ctx.putImageData(snapshot.imageData, 0, 0);
}

function pushHistory() {
  if (!previewCanvas.width || !previewCanvas.height) {
    return;
  }
  const snapshot = snapshotCanvas();
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(snapshot);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  actionButtons.forEach((button) => {
    if (button.dataset.action === 'undo') {
      button.disabled = historyIndex <= 0;
    }
    if (button.dataset.action === 'redo') {
      button.disabled = historyIndex >= history.length - 1;
    }
  });
}

function scheduleSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (!previewCanvas.width || !previewCanvas.height) {
      return;
    }
    const dataUrl = previewCanvas.toDataURL('image/png');
    if (currentRecent[selectedIndex]) {
      currentRecent[selectedIndex] = {
        ...currentRecent[selectedIndex],
        dataUrl,
        thumbDataUrl: dataUrl,
        width: previewCanvas.width,
        height: previewCanvas.height,
      };
      renderRecentList(currentRecent, selectedIndex);
    }
    window.previewApi.updateImage({
      dataUrl,
      width: previewCanvas.width,
      height: previewCanvas.height,
      selectedIndex,
    });
  }, 120);
}

function loadImageToCanvas(payload) {
  if (!payload?.dataUrl) {
    previewCanvas.width = 1;
    previewCanvas.height = 1;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    resetHistory();
    updateMeta(payload || {});
    cropRectState = null;
    clearCropOverlay();
    return;
  }

  const img = new Image();
  img.onload = () => {
    previewCanvas.width = img.naturalWidth;
    previewCanvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(img, 0, 0);
    resetHistory();
    pushHistory();
    updateMeta(payload);
    cropRectState = null;
    if (currentTool === 'crop') {
      showCropOverlay();
    } else {
      clearCropOverlay();
    }
  };
  img.src = payload.dataUrl;
}

window.previewApi.onImage((payload) => {
  const nextIndex = Number.isInteger(payload.selectedIndex)
    ? payload.selectedIndex
    : 0;
  currentRecent = payload.recent || [];
  selectedIndex = Math.max(0, Math.min(nextIndex, currentRecent.length - 1));
  renderRecentList(currentRecent, selectedIndex);
  loadImageToCanvas(payload);
});

window.previewApi.onPath((savedPath) => {
  pathLabel.textContent = savedPath || '저장 위치 없음';
});

copyButton.addEventListener('click', () => {
  window.previewApi.copy();
});

saveAsButton.addEventListener('click', () => {
  window.previewApi.saveAs();
});

openFolderButton.addEventListener('click', () => {
  window.previewApi.openFolder();
});


if (saveAllButton) {
  saveAllButton.addEventListener('click', async () => {
    await window.previewApi.saveAll?.();
  });
}

if (deleteAllButton) {
  deleteAllButton.addEventListener('click', async () => {
    const confirmDelete = window.confirm('최근 캡처 목록을 모두 비울까요? 저장된 파일은 유지됩니다.');
    if (!confirmDelete) {
      return;
    }
    await window.previewApi.deleteAll?.();
  });
}

toolButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTool(button.dataset.tool);
    if (textInput.style.display !== 'none') {
      textInput.blur();
    }
  });
});

actionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.action === 'undo' && historyIndex > 0) {
      historyIndex -= 1;
      applySnapshot(history[historyIndex]);
      updateHistoryButtons();
      scheduleSync();
    }
    if (button.dataset.action === 'redo' && historyIndex < history.length - 1) {
      historyIndex += 1;
      applySnapshot(history[historyIndex]);
      updateHistoryButtons();
      scheduleSync();
    }
  });
});

function getCanvasPoint(event) {
  const rect = previewCanvas.getBoundingClientRect();
  const stageRect = previewStage.getBoundingClientRect();
  const scaleX = previewCanvas.width / rect.width;
  const scaleY = previewCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  return {
    x: Math.max(0, Math.min(previewCanvas.width, x)),
    y: Math.max(0, Math.min(previewCanvas.height, y)),
    cssX: event.clientX - stageRect.left,
    cssY: event.clientY - stageRect.top,
  };
}

function drawArrow(fromX, fromY, toX, toY) {
  const headLength = 16 + strokeSize;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function applyMosaicRect(x, y, w, h) {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const sx = Math.max(0, Math.round(x));
  const sy = Math.max(0, Math.round(y));

  const blockSize = Math.max(4, Math.round(strokeSize * 2));
  const blockW = Math.max(1, Math.floor(width / blockSize));
  const blockH = Math.max(1, Math.floor(height / blockSize));

  mosaicCanvas.width = blockW;
  mosaicCanvas.height = blockH;
  mosaicCtx.imageSmoothingEnabled = false;
  mosaicCtx.clearRect(0, 0, blockW, blockH);
  mosaicCtx.drawImage(
    previewCanvas,
    sx,
    sy,
    width,
    height,
    0,
    0,
    blockW,
    blockH
  );

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mosaicCanvas, 0, 0, blockW, blockH, sx, sy, width, height);
  ctx.imageSmoothingEnabled = true;
}

function commitHistory() {
  pushHistory();
  scheduleSync();
}

function getCanvasMetrics() {
  const canvasRect = previewCanvas.getBoundingClientRect();
  const stageRect = previewStage.getBoundingClientRect();
  const scaleX = canvasRect.width ? previewCanvas.width / canvasRect.width : 1;
  const scaleY = canvasRect.height ? previewCanvas.height / canvasRect.height : 1;
  return { canvasRect, stageRect, scaleX, scaleY };
}

function clampCropRect(rect) {
  const x = Math.max(0, Math.min(rect.x, previewCanvas.width - 1));
  const y = Math.max(0, Math.min(rect.y, previewCanvas.height - 1));
  const width = Math.max(1, Math.min(rect.width, previewCanvas.width - x));
  const height = Math.max(1, Math.min(rect.height, previewCanvas.height - y));
  return { x, y, width, height };
}

function renderCropOverlay(rect) {
  const { canvasRect, stageRect, scaleX, scaleY } = getCanvasMetrics();
  if (!canvasRect.width || !canvasRect.height) {
    return;
  }
  const left = canvasRect.left - stageRect.left + rect.x / scaleX;
  const top = canvasRect.top - stageRect.top + rect.y / scaleY;
  const width = rect.width / scaleX;
  const height = rect.height / scaleY;
  cropRect.style.left = `${left}px`;
  cropRect.style.top = `${top}px`;
  cropRect.style.width = `${Math.max(0, width)}px`;
  cropRect.style.height = `${Math.max(0, height)}px`;
  cropOverlay.style.display = 'block';
}

function clearCropOverlay() {
  cropOverlay.style.display = 'none';
  cropOverlay.classList.remove('is-dragging');
}

function showCropOverlay() {
  if (
    !previewCanvas.width ||
    !previewCanvas.height ||
    previewCanvas.width < MIN_CROP_SIZE ||
    previewCanvas.height < MIN_CROP_SIZE
  ) {
    return;
  }
  ensureCropRect();
  if (!cropRectState) {
    return;
  }
  cropOverlay.classList.remove('is-dragging');
  renderCropOverlay(cropRectState);
}

function ensureCropRect() {
  if (!previewCanvas.width || !previewCanvas.height) {
    return null;
  }
  cropRectState = {
    x: 0,
    y: 0,
    width: previewCanvas.width,
    height: previewCanvas.height,
  };
  return cropRectState;
}

function getCropHandle(event) {
  if (!cropRectState) {
    return null;
  }
  const { canvasRect, scaleX, scaleY } = getCanvasMetrics();
  if (!canvasRect.width || !canvasRect.height) {
    return null;
  }
  const cssX = event.clientX - canvasRect.left;
  const cssY = event.clientY - canvasRect.top;
  const left = cropRectState.x / scaleX;
  const right = (cropRectState.x + cropRectState.width) / scaleX;
  const top = cropRectState.y / scaleY;
  const bottom = (cropRectState.y + cropRectState.height) / scaleY;
  const withinH =
    cssX >= left - CROP_HANDLE_SIZE && cssX <= right + CROP_HANDLE_SIZE;
  const withinV =
    cssY >= top - CROP_HANDLE_SIZE && cssY <= bottom + CROP_HANDLE_SIZE;
  const nearLeft = Math.abs(cssX - left) <= CROP_HANDLE_SIZE && withinV;
  const nearRight = Math.abs(cssX - right) <= CROP_HANDLE_SIZE && withinV;
  const nearTop = Math.abs(cssY - top) <= CROP_HANDLE_SIZE && withinH;
  const nearBottom = Math.abs(cssY - bottom) <= CROP_HANDLE_SIZE && withinH;

  if (nearLeft && nearTop) {
    return 'nw';
  }
  if (nearRight && nearTop) {
    return 'ne';
  }
  if (nearLeft && nearBottom) {
    return 'sw';
  }
  if (nearRight && nearBottom) {
    return 'se';
  }
  if (nearLeft) {
    return 'w';
  }
  if (nearRight) {
    return 'e';
  }
  if (nearTop) {
    return 'n';
  }
  if (nearBottom) {
    return 's';
  }
  return null;
}

function getCropCursor(handle) {
  if (!handle) {
    return 'default';
  }
  if (handle === 'n' || handle === 's') {
    return 'ns-resize';
  }
  if (handle === 'e' || handle === 'w') {
    return 'ew-resize';
  }
  if (handle === 'ne' || handle === 'sw') {
    return 'nesw-resize';
  }
  if (handle === 'nw' || handle === 'se') {
    return 'nwse-resize';
  }
  return 'default';
}

function updateCropCursor(event) {
  if (currentTool !== 'crop' || cropDrag) {
    return;
  }
  if (!previewCanvas.width || !previewCanvas.height) {
    return;
  }
  if (!cropRectState) {
    ensureCropRect();
  }
  const handle = getCropHandle(event);
  previewCanvas.style.cursor = handle ? getCropCursor(handle) : 'default';
}

function resizeCropRect(handle, startRect, point) {
  let left = startRect.x;
  let right = startRect.x + startRect.width;
  let top = startRect.y;
  let bottom = startRect.y + startRect.height;

  if (handle.includes('w')) {
    left = point.x;
  }
  if (handle.includes('e')) {
    right = point.x;
  }
  if (handle.includes('n')) {
    top = point.y;
  }
  if (handle.includes('s')) {
    bottom = point.y;
  }

  left = Math.max(0, Math.min(left, previewCanvas.width - MIN_CROP_SIZE));
  right = Math.max(left + MIN_CROP_SIZE, Math.min(right, previewCanvas.width));
  top = Math.max(0, Math.min(top, previewCanvas.height - MIN_CROP_SIZE));
  bottom = Math.max(
    top + MIN_CROP_SIZE,
    Math.min(bottom, previewCanvas.height)
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function applyCrop(rect) {
  const cropRectClamped = clampCropRect(rect);
  if (
    cropRectClamped.width < MIN_CROP_SIZE ||
    cropRectClamped.height < MIN_CROP_SIZE
  ) {
    return;
  }
  const imageData = ctx.getImageData(
    Math.round(cropRectClamped.x),
    Math.round(cropRectClamped.y),
    Math.round(cropRectClamped.width),
    Math.round(cropRectClamped.height)
  );
  previewCanvas.width = Math.round(cropRectClamped.width);
  previewCanvas.height = Math.round(cropRectClamped.height);
  ctx.putImageData(imageData, 0, 0);
  commitHistory();
}

function startShape(point) {
  startPoint = point;
  baseImageData = ctx.getImageData(
    0,
    0,
    previewCanvas.width,
    previewCanvas.height
  );
}

function drawShape(point) {
  if (!startPoint || !baseImageData) {
    return;
  }
  ctx.putImageData(baseImageData, 0, 0);
  setStrokeStyle();

  if (currentTool === 'rect') {
    const x = Math.min(startPoint.x, point.x);
    const y = Math.min(startPoint.y, point.y);
    const w = Math.abs(point.x - startPoint.x);
    const h = Math.abs(point.y - startPoint.y);
    if (fillEnabled) {
      setFillStyle();
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.strokeRect(x, y, w, h);
    }
  }
  if (currentTool === 'arrow') {
    drawArrow(startPoint.x, startPoint.y, point.x, point.y);
  }
  if (currentTool === 'mosaic') {
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ff0000';
    ctx.strokeRect(
      Math.min(startPoint.x, point.x),
      Math.min(startPoint.y, point.y),
      Math.abs(point.x - startPoint.x),
      Math.abs(point.y - startPoint.y)
    );
  }
}

function finishShape(point) {
  drawShape(point);
  baseImageData = null;
  startPoint = null;
  commitHistory();
}

function finishMosaic(point) {
  if (!startPoint || !baseImageData) {
    return;
  }
  const x = Math.min(startPoint.x, point.x);
  const y = Math.min(startPoint.y, point.y);
  const w = Math.abs(point.x - startPoint.x);
  const h = Math.abs(point.y - startPoint.y);
  ctx.putImageData(baseImageData, 0, 0);
  if (w > 2 && h > 2) {
    applyMosaicRect(x, y, w, h);
  }
  baseImageData = null;
  startPoint = null;
  commitHistory();
}

function openTextInput(point) {
  textAnchor = point;
  textInput.style.left = `${point.cssX}px`;
  textInput.style.top = `${point.cssY}px`;
  textInput.textContent = '';
  textInput.style.display = 'block';
  textInput.style.fontSize = `${textSize}px`;
  textInput.style.color = getStrokeStyle();
  textInput.style.caretColor = getStrokeStyle();
  requestAnimationFrame(() => {
    textInput.focus({ preventScroll: true });
  });
}

function commitText() {
  if (!textAnchor) {
    return;
  }
  const value = textInput.textContent.trim();
  textInput.style.display = 'none';
  if (!value) {
    textAnchor = null;
    return;
  }
  const canvasRect = previewCanvas.getBoundingClientRect();
  const inputRect = textInput.getBoundingClientRect();
  const scaleX = previewCanvas.width / canvasRect.width;
  const scaleY = previewCanvas.height / canvasRect.height;
  const anchorX = (inputRect.left - canvasRect.left) * scaleX;
  const anchorY = (inputRect.top - canvasRect.top) * scaleY;
  ctx.fillStyle = getStrokeStyle();
  ctx.font = `${textSize}px "Segoe UI", "Pretendard", "Malgun Gothic", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const metrics = ctx.measureText(value);
  const baselineY = anchorY + (metrics.actualBoundingBoxAscent || 0);
  ctx.fillText(value, anchorX, baselineY);
  textAnchor = null;
  commitHistory();
}

function isTypingTarget(target) {
  if (!target) {
    return false;
  }
  if (target === textInput) {
    return true;
  }
  const tag = target.tagName ? target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea') {
    return true;
  }
  return Boolean(target.isContentEditable);
}

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitText();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    textInput.style.display = 'none';
    textAnchor = null;
  }
});

textInput.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
});

textInput.addEventListener('blur', () => {
  commitText();
});

previewCanvas.addEventListener('pointerdown', (event) => {
  if (!previewCanvas.width || !previewCanvas.height) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  if (textInput.style.display !== 'none') {
    textInput.blur();
  }
  const point = getCanvasPoint(event);

  if (currentTool === 'text') {
    event.preventDefault();
    openTextInput(point);
    return;
  }
  if (currentTool === 'crop') {
    event.preventDefault();
    if (!previewCanvas.width || !previewCanvas.height) {
      return;
    }
    ensureCropRect();
    const handle = getCropHandle(event);
    if (!handle) {
      return;
    }
    cropDrag = {
      handle,
      startRect: { ...cropRectState },
      pointerId: event.pointerId,
    };
    cropOverlay.classList.add('is-dragging');
    renderCropOverlay(cropRectState);
    previewCanvas.style.cursor = getCropCursor(handle);
    previewCanvas.setPointerCapture(event.pointerId);
    return;
  }
  if (!currentRecent.length) {
    return;
  }

  isDrawing = true;
  previewCanvas.setPointerCapture(event.pointerId);

  if (currentTool === 'pen') {
    setStrokeStyle();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  } else if (
    currentTool === 'rect' ||
    currentTool === 'arrow' ||
    currentTool === 'mosaic'
  ) {
    startShape(point);
  }
});

previewCanvas.addEventListener('pointermove', (event) => {
  if (cropDrag && cropRectState) {
    const point = getCanvasPoint(event);
    cropRectState = resizeCropRect(cropDrag.handle, cropDrag.startRect, point);
    renderCropOverlay(cropRectState);
    return;
  }
  if (currentTool === 'crop' && !isDrawing) {
    updateCropCursor(event);
  }
  if (!isDrawing) {
    return;
  }
  const point = getCanvasPoint(event);

  if (currentTool === 'pen') {
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  } else if (
    currentTool === 'rect' ||
    currentTool === 'arrow' ||
    currentTool === 'mosaic'
  ) {
    drawShape(point);
  }
});

function finishDrawing(event) {
  if (cropDrag && cropRectState) {
    if (previewCanvas.hasPointerCapture(event.pointerId)) {
      previewCanvas.releasePointerCapture(event.pointerId);
    }
    const rect = cropRectState;
    cropDrag = null;
    cropOverlay.classList.remove('is-dragging');
    previewCanvas.style.cursor = 'default';
    if (event.type !== 'pointercancel') {
      applyCrop(rect);
    }
    cropRectState = null;
    if (currentTool === 'crop') {
      showCropOverlay();
    } else {
      clearCropOverlay();
    }
    return;
  }
  if (!isDrawing) {
    return;
  }
  const point = getCanvasPoint(event);
  isDrawing = false;
  if (previewCanvas.hasPointerCapture(event.pointerId)) {
    previewCanvas.releasePointerCapture(event.pointerId);
  }

  if (currentTool === 'pen') {
    commitHistory();
  } else if (currentTool === 'rect' || currentTool === 'arrow') {
    finishShape(point);
  } else if (currentTool === 'mosaic') {
    finishMosaic(point);
  }
}

previewCanvas.addEventListener('pointerup', finishDrawing);
previewCanvas.addEventListener('pointercancel', finishDrawing);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cropDrag) {
    if (
      typeof cropDrag.pointerId === 'number' &&
      previewCanvas.hasPointerCapture(cropDrag.pointerId)
    ) {
      previewCanvas.releasePointerCapture(cropDrag.pointerId);
    }
    cropDrag = null;
    cropRectState = null;
    cropOverlay.classList.remove('is-dragging');
    previewCanvas.style.cursor = 'default';
    if (currentTool === 'crop') {
      showCropOverlay();
    } else {
      clearCropOverlay();
    }
    return;
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key.toLowerCase() === 'v' || event.key.toLowerCase() === 'c') &&
    !isTypingTarget(event.target)
  ) {
    event.preventDefault();
    window.previewApi.copy();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (historyIndex > 0) {
      historyIndex -= 1;
      applySnapshot(history[historyIndex]);
      updateHistoryButtons();
      scheduleSync();
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    if (historyIndex < history.length - 1) {
      historyIndex += 1;
      applySnapshot(history[historyIndex]);
      updateHistoryButtons();
      scheduleSync();
    }
  }
});

setActiveTool(currentTool);
updateHistoryButtons();
updateSettingLabels();
setStrokeColor(strokeColor);

colorInput.addEventListener('input', () => {
  setStrokeColor(colorInput.value);
});

swatches.forEach((button) => {
  button.addEventListener('click', () => {
    setStrokeColor(button.dataset.swatch);
  });
});

sizeInput.addEventListener('input', () => {
  strokeSize = Number(sizeInput.value) || 1;
  updateSettingLabels();
});

opacityInput.addEventListener('input', () => {
  strokeOpacity = Number(opacityInput.value) || 100;
  updateSettingLabels();
});

textSizeInput.addEventListener('input', () => {
  textSize = Number(textSizeInput.value) || 12;
  updateSettingLabels();
  if (textInput.style.display !== 'none') {
    textInput.style.fontSize = `${textSize}px`;
  }
});

stepButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const stepType = button.dataset.step;
    const delta = Number(button.dataset.delta) || 0;
    if (stepType === 'size') {
      const min = Number(sizeInput.min) || 1;
      const max = Number(sizeInput.max) || 16;
      strokeSize = Math.max(min, Math.min(max, strokeSize + delta));
      sizeInput.value = String(strokeSize);
    }
    if (stepType === 'opacity') {
      const min = Number(opacityInput.min) || 10;
      const max = Number(opacityInput.max) || 100;
      strokeOpacity = Math.max(min, Math.min(max, strokeOpacity + delta));
      opacityInput.value = String(strokeOpacity);
    }
    if (stepType === 'text') {
      const min = Number(textSizeInput.min) || 10;
      const max = Number(textSizeInput.max) || 48;
      textSize = Math.max(min, Math.min(max, textSize + delta));
      textSizeInput.value = String(textSize);
    }
    updateSettingLabels();
    if (textInput.style.display !== 'none') {
      textInput.style.fontSize = `${textSize}px`;
    }
  });
});

fillToggle.addEventListener('change', () => {
  fillEnabled = fillToggle.checked;
});
