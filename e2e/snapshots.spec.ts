import { expect, test, type Page } from '@playwright/test';

const node = (page: Page, text: string) => page.locator('.react-flow__node', { hasText: text });
const saved = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: 'Kaydedildi' })).toBeVisible({
    timeout: 10_000,
  });

test('snapshot a design, compare after a change, restore it, fork it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  const original = page.url();

  const menu = page.locator('#snapshots-menu');
  await page.getByRole('button', { name: 'Sürümler' }).click();
  await menu.getByLabel('Anlık görüntü adı').fill('v1');
  await menu.getByRole('button', { name: 'Anlık görüntü al' }).click();
  await expect(menu.getByRole('status')).toHaveText('Anlık görüntü alındı.');
  await expect(menu.getByText('v1', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await node(page, 'Sera API').click();
  await page.getByLabel('Etiket').fill('Sera servisi');
  await saved(page);

  // Comparing opens the way back as a proposal; the canvas shows what would change.
  await page.getByRole('button', { name: 'Sürümler' }).click();
  await menu.getByRole('button', { name: 'Karşılaştır' }).click();
  await expect(page.getByRole('tab', { name: /Öneriler/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(node(page, 'Sera API')).toContainText('Değişecek');
  await page.getByRole('button', { name: 'Öneriyi uygula' }).click();
  await expect(page.getByText('Öneri uygulandı.')).toBeVisible();
  await expect(node(page, 'Sera servisi')).toHaveCount(0);
  await saved(page);

  await page.getByRole('button', { name: 'Sürümler' }).click();
  await menu.getByRole('button', { name: 'Kopyasını aç' }).click();
  await expect(page).not.toHaveURL(original);
  await expect(page.getByRole('heading', { name: 'Sera IoT (v1)' })).toBeVisible();
});
