import { stat } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// The console errors and uncaught exceptions of the page, from now on.
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

// The number of distinct colors in a PNG, counted in the page. A blank canvas has one.
const colorsOf = (page: Page, png: string) =>
  page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = [image.width, image.height];
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = new Uint32Array(context.getImageData(0, 0, image.width, image.height).data.buffer);
    return new Set(pixels).size;
  }, png);

test('loads with no console error, and draws the 3D view', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/');
  const canvas = page.locator('.canvas-host canvas');
  await expect.poll(async () => colorsOf(page, (await canvas.screenshot()).toString('base64'))).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('a length edit changes the cut list, and a bad length shows its message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cut list' }).click();
  const table = page.locator('table.cutlist.parts');
  const before = await table.innerText();
  const length = page.getByRole('textbox', { name: 'Length (left to right)', exact: true });

  await length.fill(`12'`);
  await length.press('Enter');
  await expect(table).not.toHaveText(before, { useInnerText: true });

  await length.fill('twelve');
  await length.press('Enter');
  await expect(page.getByText(`Not a length, e.g. 7' 8-5/8"`)).toBeVisible();
  await expect(length).toHaveAttribute('aria-invalid', 'true');
});

test('Download 3D and Download PDF each save a file', async ({ page }) => {
  test.slow(); // the PDF draws every sheet
  await page.goto('/');
  for (const [tab, button] of [['3D', 'Download 3D'], ['Framing', 'Download PDF']]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
    expect((await stat(await file.path())).size).toBeGreaterThan(1000);
  }
});

test('a stored design that does not load shows a notice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shed-builder.config', '{"width": "wide"}'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Cannot load the design saved in this browser');
});

test('without WebGL, the 3D view says so, and the rest of the app works', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return kind.startsWith('webgl') ? null : real.call(this, kind as '2d', ...(rest as []));
    } as typeof real;
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The 3D view did not start');
  await page.getByRole('tab', { name: 'Cut list' }).click();
  await expect(page.locator('table.cutlist.parts')).toBeVisible();
});

test('a 3D view that did not load loads on Retry', async ({ page }) => {
  let blocked = true;
  await page.route(/assets\/View3D-.*\.js/, (route) => (blocked ? route.abort() : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The 3D view did not start');
  blocked = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.canvas-host canvas')).toBeVisible();
});

test('a rejected draft stays with its row when the row before it goes', async ({ page }) => {
  await page.goto('/');
  await page.locator('summary', { hasText: 'Openings' }).first().click();
  const sills = page.getByRole('textbox', { name: 'Sill height, floor to RO bottom' });
  await sills.first().fill('abc');
  await sills.first().press('Tab');
  await page.getByRole('button', { name: 'Remove opening row' }).first().click();
  await expect(sills).toHaveCount(1);
  await expect(sills.first()).toHaveValue('46-1/4"');
  await expect(sills.first()).not.toHaveAttribute('aria-invalid', 'true');
});

test('names each checkbox, and moves along the tabs with the arrow keys', async ({ page }) => {
  await page.goto('/');
  await page.locator('summary', { hasText: 'Walls' }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Cap plate', exact: true })).toBeChecked();
  await page.getByRole('tab', { name: '3D' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Framing' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Framing' })).toHaveAttribute('aria-selected', 'true');
});

test('keeps the cut list notes on a portrait page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Cut list' }).click();
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 720, height: 1000 });
  await expect(page.locator('table.cutlist.parts td.note').first()).toBeVisible();
});

test('a new door named like another type takes a number, not a refusal', async ({ page }) => {
  await page.goto('/');
  await page.locator('summary', { hasText: 'Openings' }).first().click();
  await page.locator('summary', { hasText: 'Opening types' }).first().click();
  await page.getByRole('button', { name: '+ Door' }).click();
  await page.getByRole('button', { name: '+ Window' }).click();
  await page.getByRole('combobox', { name: 'Kind', exact: true }).last().selectOption('door');
  await expect(page.locator('.error', { hasText: 'Duplicate' })).toHaveCount(0);
  const titles = await page.locator('.card > summary .title').allInnerTexts();
  expect(titles.filter((title) => title.startsWith('door 36'))).toEqual(['door 36', 'door 36 2']);
});
