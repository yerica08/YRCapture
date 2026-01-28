const selection = document.getElementById('selection');
const sizeLabel = document.getElementById('size');

let displayId = null;
let startX = 0;
let startY = 0;
let selecting = false;

window.overlayApi.onInit((payload) => {
  displayId = payload.displayId;
});

function updateSelection(currentX, currentY) {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  selection.style.left = `${x}px`;
  selection.style.top = `${y}px`;
  selection.style.width = `${width}px`;
  selection.style.height = `${height}px`;

  sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`;

  return { x, y, width, height };
}

function cancelSelection() {
  selecting = false;
  selection.style.display = 'none';
  window.overlayApi.cancel();
}

document.addEventListener('mousedown', (event) => {
  selecting = true;
  startX = event.clientX;
  startY = event.clientY;
  selection.style.display = 'block';
  updateSelection(event.clientX, event.clientY);
});

document.addEventListener('mousemove', (event) => {
  if (!selecting) {
    return;
  }
  updateSelection(event.clientX, event.clientY);
});

document.addEventListener('mouseup', (event) => {
  if (!selecting) {
    return;
  }
  selecting = false;
  const rect = updateSelection(event.clientX, event.clientY);
  selection.style.display = 'none';

  if (rect.width < 2 || rect.height < 2) {
    window.overlayApi.cancel();
    return;
  }

  window.overlayApi.completeSelection({
    displayId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    cancelSelection();
  }
});
