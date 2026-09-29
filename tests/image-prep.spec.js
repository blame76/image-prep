import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'sample.png');

async function createImageFile(page, type, name) {
  const bytes = await page.evaluate(async imageType => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    context.fillStyle = '#e00000';
    context.fillRect(0, 0, 160, 180);
    context.fillStyle = '#0040e0';
    context.fillRect(160, 0, 160, 180);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, imageType, 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, type);
  return { name, mimeType: type, buffer: Buffer.from(bytes) };
}

async function getDownload(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bild herunterladen' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  return { download, buffer: await readFile(filePath) };
}

async function decodeDimensions(page, buffer, type) {
  return page.evaluate(async ({ bytes, mimeType }) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }, { bytes: Array.from(buffer), mimeType: type });
}

test('loads as a local-only image tool', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Image Prep' })).toBeVisible();
  await expect(page.getByText('Keine Uploads · kein Tracking')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bild herunterladen' })).toBeDisabled();
  expect(pageErrors).toEqual([]);
});

test('loads an image and enables editing', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').setInputFiles(fixture);
  await expect(page.getByText(/sample\.png/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bild herunterladen' })).toBeEnabled();
  await expect(page.locator('#empty-state')).toBeHidden();
});

test('switches between profile and Open Graph presets', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').setInputFiles(fixture);

  await expect(page.locator('#output-meta')).toHaveText('Ausgabe: 800 × 800');
  await expect(page.locator('#preview')).toHaveAttribute('width', '800');
  await expect(page.locator('#preview')).toHaveAttribute('height', '800');
  await expect(page.locator('#circle-preview')).toBeChecked();

  await page.getByRole('button', { name: 'Open Graph · 1200×630' }).click();
  await expect(page.locator('#output-meta')).toHaveText('Ausgabe: 1200 × 630');
  await expect(page.locator('#preview')).toHaveAttribute('width', '1200');
  await expect(page.locator('#preview')).toHaveAttribute('height', '630');
  await expect(page.locator('#circle-preview')).not.toBeChecked();
  await expect(page.locator('#circle-preview')).toBeDisabled();

  await page.getByRole('button', { name: 'Square · 1080×1080' }).click();
  await expect(page.locator('#output-meta')).toHaveText('Ausgabe: 1080 × 1080');
  await expect(page.locator('#preview')).toHaveAttribute('width', '1080');
  await expect(page.locator('#preview')).toHaveAttribute('height', '1080');
  await expect(page.locator('#circle-preview')).toBeEnabled();
});

test('zoom changes and reset restores 100 percent', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').setInputFiles(fixture);
  await page.locator('#zoom').fill('1.5');
  await expect(page.locator('#zoom-value')).toHaveText('150%');
  await page.getByRole('button', { name: 'Ausschnitt zurücksetzen' }).click();
  await expect(page.locator('#zoom-value')).toHaveText('100%');
});

test('does not upload image data while editing', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol)) {
      requests.push({ method: request.method(), url });
    }
  });

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  const allowedPaths = new Set([
    '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
    '/sw.js', '/assets/icon-192.png', '/assets/icon-512.png'
  ]);
  for (const request of requests) {
    expect(request.method).toBe('GET');
    expect(request.url.origin).toBe('http://127.0.0.1:4173');
    expect(request.url.search).toBe('');
    expect(allowedPaths.has(request.url.pathname)).toBe(true);
  }
  requests.length = 0;

  await page.locator('#image-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Square · 1080×1080' }).click();
  await page.locator('#zoom').fill('1.2');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bild herunterladen' }).click();
  await downloadPromise;
  expect(requests).toEqual([]);
});

test('loads JPEG, PNG and WebP images', async ({ page }) => {
  await page.goto('/');
  const formats = [['image/jpeg', 'photo.jpg'], ['image/png', 'graphic.png'], ['image/webp', 'photo.webp']];
  for (const [type, name] of formats) {
    const file = await createImageFile(page, type, name);
    await page.locator('#image-input').setInputFiles(file);
    await expect(page.locator('#file-meta')).toContainText(name);
    await expect(page.locator('#file-meta')).toContainText('320 × 180');
  }
});

test('rejects an invalid replacement and clears the previous image', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Bild herunterladen' })).toBeEnabled();
  await page.locator('#image-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.locator('#status')).toContainText('zuvor geladene Bild wurde entfernt');
  await expect(page.getByRole('button', { name: 'Bild herunterladen' })).toBeDisabled();
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('validates custom dimensions and limits circle preview to squares', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Eigene Maße' }).click();
  await page.locator('#custom-width').fill('900');
  await page.locator('#custom-height').fill('500');
  await expect(page.locator('#output-meta')).toHaveText('Ausgabe: 900 × 500');
  await expect(page.locator('#preview')).toHaveAttribute('width', '900');
  await expect(page.locator('#preview')).toHaveAttribute('height', '500');
  await expect(page.locator('#circle-preview')).toBeDisabled();
  await expect(page.locator('#circle-note')).toContainText('Nur bei quadratischen Ausgaben');
  await page.locator('#custom-height').fill('900');
  await expect(page.locator('#circle-preview')).toBeEnabled();
  await page.locator('#format').selectOption('image/png');
  const customResult = await getDownload(page);
  expect(customResult.download.suggestedFilename()).toBe('sample-custom-900x900.png');
  expect(await decodeDimensions(page, customResult.buffer, 'image/png')).toEqual({ width: 900, height: 900 });
  await page.locator('#custom-width').fill('8192');
  await page.locator('#custom-height').fill('8192');
  await expect(page.locator('#status')).toContainText('höchstens 16,7 Megapixel');
  await expect(page.getByRole('button', { name: 'Bild herunterladen' })).toBeDisabled();
  await page.getByRole('button', { name: 'Square · 1080×1080' }).click();
  await expect(page.getByRole('button', { name: 'Bild herunterladen' })).toBeEnabled();
});

test('exports WebP and PNG with real bytes and exact dimensions', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').setInputFiles(fixture);
  await expect(page.locator('#circle-preview')).toBeChecked();
  await expect(page.locator('#circle-note')).toContainText('Export bleibt quadratisch');
  let result = await getDownload(page);
  expect(result.download.suggestedFilename()).toBe('sample-profile-800.webp');
  expect(result.buffer.length).toBeGreaterThan(0);
  expect(result.buffer.subarray(0, 4).toString()).toBe('RIFF');
  expect(result.buffer.subarray(8, 12).toString()).toBe('WEBP');
  expect(await decodeDimensions(page, result.buffer, 'image/webp')).toEqual({ width: 800, height: 800 });
  await page.locator('#format').selectOption('image/png');
  await expect(page.locator('#quality')).toBeDisabled();
  await expect(page.locator('#quality-note')).toBeVisible();
  result = await getDownload(page);
  expect(result.download.suggestedFilename()).toBe('sample-profile-800.png');
  expect(result.buffer.length).toBeGreaterThan(0);
  expect(result.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(await decodeDimensions(page, result.buffer, 'image/png')).toEqual({ width: 800, height: 800 });
});

test('supports keyboard and pointer crop without empty edges', async ({ page }) => {
  await page.goto('/');
  const file = await createImageFile(page, 'image/png', 'landscape.png');
  await page.locator('#image-input').setInputFiles(file);
  await page.locator('#zoom').fill('1.5');
  const beforeKeyboard = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
  await page.locator('#preview').focus();
  await page.keyboard.press('ArrowRight');
  const afterKeyboard = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
  expect(afterKeyboard).not.toBe(beforeKeyboard);
  await page.getByRole('button', { name: 'Ausschnitt zurücksetzen' }).click();
  await page.locator('#preview').scrollIntoViewIfNeeded();
  const beforeDrag = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
  const box = await page.locator('#preview').boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 2, y: box.y + box.height / 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const afterDrag = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
  expect(afterDrag).not.toBe(beforeDrag);
  const cornerAlpha = await page.locator('#preview').evaluate(canvas => {
    const context = canvas.getContext('2d');
    const points = [[0, 0], [canvas.width - 1, 0], [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]];
    return points.map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]);
  });
  expect(cornerAlpha).toEqual([255, 255, 255, 255]);
});

test('keeps file selection and crop controls keyboard accessible', async ({ page }) => {
  await page.goto('/');
  await page.locator('#image-input').focus();
  await expect(page.locator('#image-input')).toBeFocused();
  const outline = await page.locator('.file-drop').evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
  await expect(page.locator('#status')).toHaveAttribute('aria-live', 'polite');
  await page.locator('#image-input').setInputFiles(fixture);
  await expect(page.locator('#preview')).toHaveAttribute('tabindex', '0');
  await page.locator('#preview').focus();
  await expect(page.locator('#preview')).toBeFocused();
  await expect(page.locator('#preview')).toHaveAccessibleName('Bildvorschau und Ausschnitt');
});

test('links the legal pages and public repository from the footer', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('.site-footer');
  await expect(footer.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', './impressum.html');
  await expect(footer.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', './datenschutz.html');
  await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/blame76/image-prep');

  await footer.getByRole('link', { name: 'Impressum' }).click();
  await expect(page).toHaveURL(/\/impressum\.html$/);
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Impressum' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Datenschutz' }).click();
  await expect(page).toHaveURL(/\/datenschutz\.html$/);
  await expect(page.getByRole('heading', { name: 'Datenschutz' })).toBeVisible();
  await expect(page.getByText(/nicht an einen Server übertragen/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('script')).toHaveCount(0);
});

test('reloads the app shell offline after service worker installation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Image Prep' })).toBeVisible();
  await page.getByRole('link', { name: 'Impressum' }).click();
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.context().setOffline(true);
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Image Prep' })).toBeVisible();
    await page.goto('/datenschutz.html', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Datenschutz' })).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
});

test('rejects input files larger than 25 MB before decoding', async ({ page }) => {
  await page.goto('/');
  const oversized = { name: 'oversized.png', mimeType: 'image/png', buffer: Buffer.alloc(25 * 1024 * 1024 + 1) };
  await page.locator('#image-input').setInputFiles(oversized);
  await expect(page.locator('#status')).toContainText('größer als 25 MB');
  await expect(page.getByRole('button', { name: 'Bild herunterladen' })).toBeDisabled();
});
