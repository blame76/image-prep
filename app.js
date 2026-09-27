const PRESETS = {
  'profile-m': { width: 800, height: 800, circle: true, label: 'profile-800' },
  'profile-l': { width: 1024, height: 1024, circle: true, label: 'profile-1024' },
  og: { width: 1200, height: 630, circle: false, label: 'open-graph-1200x630' },
  wide: { width: 1200, height: 675, circle: false, label: 'preview-1200x675' },
  square: { width: 1080, height: 1080, circle: false, label: 'square-1080' },
  portrait: { width: 1080, height: 1350, circle: false, label: 'portrait-1080x1350' }
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_OUTPUT_SIDE = 8192;
const MAX_OUTPUT_PIXELS = 16_777_216;

const els = {
  input: document.querySelector('#image-input'),
  fileMeta: document.querySelector('#file-meta'),
  preview: document.querySelector('#preview'),
  wrap: document.querySelector('#canvas-wrap'),
  empty: document.querySelector('#empty-state'),
  zoom: document.querySelector('#zoom'),
  zoomValue: document.querySelector('#zoom-value'),
  reset: document.querySelector('#reset-crop'),
  circle: document.querySelector('#circle-preview'),
  circleNote: document.querySelector('#circle-note'),
  customSize: document.querySelector('#custom-size'),
  customWidth: document.querySelector('#custom-width'),
  customHeight: document.querySelector('#custom-height'),
  format: document.querySelector('#format'),
  quality: document.querySelector('#quality'),
  qualityValue: document.querySelector('#quality-value'),
  qualityNote: document.querySelector('#quality-note'),
  outputMeta: document.querySelector('#output-meta'),
  download: document.querySelector('#download'),
  status: document.querySelector('#status'),
  presets: [...document.querySelectorAll('[data-preset]')]
};

const ctx = els.preview.getContext('2d', { alpha: true });
const state = {
  bitmap: null,
  sourceName: 'image',
  presetKey: 'profile-m',
  customWidth: 1200,
  customHeight: 630,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0
};

function currentPreset() {
  if (state.presetKey !== 'custom') return PRESETS[state.presetKey];
  return {
    width: state.customWidth,
    height: state.customHeight,
    circle: false,
    label: `custom-${state.customWidth}x${state.customHeight}`
  };
}

function setControlsEnabled(enabled) {
  [els.zoom, els.reset, els.format, els.download].forEach(el => {
    el.disabled = !enabled;
  });
  updateCircleControl();
  updateQualityControl();
}

function resetCrop() {
  state.zoom = 1;
  state.offsetX = 0;
  state.offsetY = 0;
  els.zoom.value = '1';
  els.zoomValue.value = '100%';
  render();
}

function resizeCanvasForPreset() {
  const preset = currentPreset();
  els.preview.width = preset.width;
  els.preview.height = preset.height;
  els.outputMeta.textContent = `Ausgabe: ${preset.width} × ${preset.height}`;
  els.customSize.hidden = state.presetKey !== 'custom';
  els.circle.checked = preset.circle === true;
  setControlsEnabled(Boolean(state.bitmap));
  resetCrop();
}

function getDrawGeometry() {
  if (!state.bitmap) return null;
  const { width: cw, height: ch } = els.preview;
  const iw = state.bitmap.width;
  const ih = state.bitmap.height;
  const coverScale = Math.max(cw / iw, ch / ih);
  const scale = coverScale * state.zoom;
  const drawWidth = iw * scale;
  const drawHeight = ih * scale;
  const maxOffsetX = Math.max(0, (drawWidth - cw) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - ch) / 2);
  state.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, state.offsetX));
  state.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, state.offsetY));
  return {
    x: (cw - drawWidth) / 2 + state.offsetX,
    y: (ch - drawHeight) / 2 + state.offsetY,
    width: drawWidth,
    height: drawHeight
  };
}

function render() {
  ctx.clearRect(0, 0, els.preview.width, els.preview.height);
  if (!state.bitmap) return;
  const g = getDrawGeometry();
  ctx.drawImage(state.bitmap, g.x, g.y, g.width, g.height);
}

function updateCirclePreview() {
  const preset = currentPreset();
  const square = preset.width === preset.height;
  els.wrap.classList.toggle('circle', square && els.circle.checked);
}

function updateCircleControl() {
  const preset = currentPreset();
  const square = preset.width === preset.height;
  if (!square) els.circle.checked = false;
  els.circle.disabled = !state.bitmap || !square;
  els.circleNote.textContent = square
    ? 'Nur Vorschau – der Export bleibt quadratisch.'
    : 'Nur bei quadratischen Ausgaben verfügbar – der Export bleibt rechteckig.';
  updateCirclePreview();
}

function updateQualityControl() {
  const isPng = els.format.value === 'image/png';
  els.quality.disabled = !state.bitmap || isPng;
  els.qualityNote.hidden = !isPng;
}

function readCustomSize() {
  const width = Number(els.customWidth.value);
  const height = Number(els.customHeight.value);
  const sidesValid = Number.isInteger(width) && Number.isInteger(height)
    && width >= 16 && height >= 16
    && width <= MAX_OUTPUT_SIDE && height <= MAX_OUTPUT_SIDE;
  const areaValid = sidesValid && width * height <= MAX_OUTPUT_PIXELS;
  const message = !sidesValid
    ? 'Breite und Höhe müssen ganze Zahlen zwischen 16 und 8192 sein.'
    : areaValid ? '' : 'Die Ausgabe darf höchstens 16,7 Megapixel groß sein.';
  els.customWidth.setCustomValidity(message);
  els.customHeight.setCustomValidity(message);
  if (message) {
    els.download.disabled = true;
    els.status.textContent = message;
    return null;
  }
  return { width, height };
}

function clearLoadedImage(message = '') {
  state.bitmap?.close?.();
  state.bitmap = null;
  state.sourceName = 'image';
  state.dragging = false;
  state.pointerId = null;
  els.input.value = '';
  els.fileMeta.textContent = 'Noch kein gültiges Bild geladen.';
  els.empty.hidden = false;
  setControlsEnabled(false);
  render();
  els.status.textContent = message;
}

async function loadFile(file) {
  els.status.textContent = '';
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    clearLoadedImage('Bitte JPEG, PNG oder WebP auswählen. Das zuvor geladene Bild wurde entfernt.');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    clearLoadedImage('Das Bild ist größer als 25 MB und wurde nicht geladen.');
    return;
  }

  clearLoadedImage();
  els.fileMeta.textContent = 'Bild wird geprüft …';
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
      bitmap.close?.();
      clearLoadedImage('Das Bild hat mehr als 40 Megapixel und wurde nicht geladen.');
      return;
    }
    state.bitmap = bitmap;
    state.sourceName = file.name.replace(/\.[^.]+$/, '') || 'image';
    els.fileMeta.textContent = `${file.name} · ${bitmap.width} × ${bitmap.height} · ${formatBytes(file.size)}`;
    els.empty.hidden = true;
    setControlsEnabled(true);
    resetCrop();
  } catch {
    clearLoadedImage('Das Bild konnte im Browser nicht dekodiert werden. Das zuvor geladene Bild wurde entfernt.');
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extensionForMime(type) {
  return ({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' })[type] || 'png';
}

function canvasToBlob(type, quality) {
  return new Promise(resolve => els.preview.toBlob(resolve, type, quality));
}

async function downloadImage() {
  if (!state.bitmap) return;
  render();
  const requestedType = els.format.value;
  const quality = Number(els.quality.value);
  const blob = await canvasToBlob(requestedType, quality);
  if (!blob) {
    els.status.textContent = 'Export fehlgeschlagen.';
    return;
  }

  const actualType = blob.type || 'image/png';
  const preset = currentPreset();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.sourceName}-${preset.label}.${extensionForMime(actualType)}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  els.status.textContent = actualType === requestedType
    ? `Export bereit: ${formatBytes(blob.size)}.`
    : `Browser-Fallback auf ${actualType}: ${formatBytes(blob.size)}.`;
}

els.input.addEventListener('change', event => loadFile(event.target.files?.[0]));

els.presets.forEach(button => {
  button.addEventListener('click', () => {
    const nextKey = button.dataset.preset;
    if (nextKey === 'custom') {
      const size = readCustomSize();
      els.customSize.hidden = false;
      if (!size) return;
      state.customWidth = size.width;
      state.customHeight = size.height;
    }
    els.status.textContent = '';
    state.presetKey = nextKey;
    els.presets.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    resizeCanvasForPreset();
  });
});


[els.customWidth, els.customHeight].forEach(input => {
  input.addEventListener('input', () => {
    if (state.presetKey !== 'custom') return;
    const size = readCustomSize();
    if (!size) return;
    state.customWidth = size.width;
    state.customHeight = size.height;
    els.status.textContent = '';
    resizeCanvasForPreset();
  });
});
els.zoom.addEventListener('input', () => {
  state.zoom = Number(els.zoom.value);
  els.zoomValue.value = `${Math.round(state.zoom * 100)}%`;
  render();
});

els.quality.addEventListener('input', () => {
  els.qualityValue.value = `${Math.round(Number(els.quality.value) * 100)}%`;
});
els.format.addEventListener('change', updateQualityControl);

els.reset.addEventListener('click', resetCrop);
els.circle.addEventListener('change', updateCirclePreview);
els.download.addEventListener('click', downloadImage);

els.preview.addEventListener('pointerdown', event => {
  if (!state.bitmap) return;
  state.dragging = true;
  state.pointerId = event.pointerId;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  els.preview.setPointerCapture(event.pointerId);
});

els.preview.addEventListener('pointermove', event => {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  const rect = els.preview.getBoundingClientRect();
  const scaleX = els.preview.width / rect.width;
  const scaleY = els.preview.height / rect.height;
  state.offsetX += (event.clientX - state.lastX) * scaleX;
  state.offsetY += (event.clientY - state.lastY) * scaleY;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  render();
});

function endDrag(event) {
  if (event.pointerId !== state.pointerId) return;
  state.dragging = false;
  state.pointerId = null;
}

els.preview.addEventListener('pointerup', endDrag);
els.preview.addEventListener('pointercancel', endDrag);

els.preview.addEventListener('keydown', event => {
  if (!state.bitmap) return;
  const directions = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  const step = event.shiftKey ? 50 : 10;
  state.offsetX += direction[0] * step;
  state.offsetY += direction[1] * step;
  render();
});

window.addEventListener('beforeunload', () => state.bitmap?.close?.());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

resizeCanvasForPreset();
