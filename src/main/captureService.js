const { desktopCapturer, screen } = require('electron');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDisplayById(displayId) {
  const displays = screen.getAllDisplays();
  return displays.find((display) => String(display.id) === String(displayId));
}

function getMaxDisplaySize() {
  const displays = screen.getAllDisplays();
  return displays.reduce(
    (acc, display) => {
      const width = Math.round(display.size.width * display.scaleFactor);
      const height = Math.round(display.size.height * display.scaleFactor);
      acc.width = Math.max(acc.width, width);
      acc.height = Math.max(acc.height, height);
      return acc;
    },
    { width: 0, height: 0 }
  );
}

async function captureDisplay(display) {
  const scaleFactor = display.scaleFactor || 1;
  const width = Math.round(display.size.width * scaleFactor);
  const height = Math.round(display.size.height * scaleFactor);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });

  const source =
    sources.find((item) => item.display_id === String(display.id)) || sources[0];

  if (!source) {
    return null;
  }

  return {
    image: source.thumbnail,
    display,
    scaleFactor,
  };
}

function clampRect(rect, imageWidth, imageHeight) {
  const x = Math.max(0, Math.min(rect.x, imageWidth - 1));
  const y = Math.max(0, Math.min(rect.y, imageHeight - 1));
  const width = Math.max(
    1,
    Math.min(rect.width, imageWidth - x)
  );
  const height = Math.max(
    1,
    Math.min(rect.height, imageHeight - y)
  );
  return { x, y, width, height };
}

async function captureFullScreenAtPoint(point) {
  const display = screen.getDisplayNearestPoint(point);
  const result = await captureDisplay(display);
  return result;
}

async function captureRegion(payload) {
  const display = getDisplayById(payload.displayId) || screen.getPrimaryDisplay();
  const result = await captureDisplay(display);
  if (!result) {
    return null;
  }

  const scaleFactor = result.scaleFactor || 1;
  const cropRect = clampRect(
    {
      x: Math.round(payload.x * scaleFactor),
      y: Math.round(payload.y * scaleFactor),
      width: Math.round(payload.width * scaleFactor),
      height: Math.round(payload.height * scaleFactor),
    },
    result.image.getSize().width,
    result.image.getSize().height
  );

  const image = result.image.crop(cropRect);
  return { image, display };
}

async function getWindowSources() {
  const thumbnailSize = { width: 320, height: 200 };
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    fetchWindowIcons: true,
    thumbnailSize,
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }));
}

async function captureWindowById(sourceId) {
  const maxSize = getMaxDisplaySize();
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    fetchWindowIcons: true,
    thumbnailSize: {
      width: Math.max(800, maxSize.width),
      height: Math.max(600, maxSize.height),
    },
  });

  const source = sources.find((item) => item.id === sourceId);
  if (!source) {
    return null;
  }

  return { image: source.thumbnail };
}

module.exports = {
  delay,
  captureFullScreenAtPoint,
  captureRegion,
  getWindowSources,
  captureWindowById,
};
