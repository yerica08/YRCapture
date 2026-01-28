const form = document.getElementById('webCaptureForm');
const urlInput = document.getElementById('urlInput');
const statusEl = document.getElementById('status');
const cancelButton = document.getElementById('cancelButton');

function setStatus(message) {
  statusEl.textContent = message;
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return new URL(trimmed).toString();
  } catch (error) {
    return `https://${trimmed}`;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = normalizeUrl(urlInput.value);
  if (!url) {
    setStatus('URL을 입력하세요.');
    urlInput.focus();
    return;
  }
  window.webCaptureApi.submit(url);
});

cancelButton.addEventListener('click', () => {
  window.webCaptureApi.cancel();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.webCaptureApi.cancel();
  }
});

urlInput.addEventListener('input', () => {
  if (urlInput.value.trim()) {
    setStatus('캡처를 시작할 준비가 됐어요.');
  } else {
    setStatus('URL을 입력하세요.');
  }
});

urlInput.focus();
