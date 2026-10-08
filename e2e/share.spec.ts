import { expect, test } from '@playwright/test';

test('share a read-only link, open it signed out, then revoke it', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  const menu = page.locator('#share-menu');
  await page.getByRole('button', { name: 'Paylaş' }).click();
  await menu.getByRole('button', { name: 'Bağlantı oluştur' }).click();
  const url = await menu.getByLabel('Paylaşım bağlantısı').inputValue();
  expect(url).toMatch(/\/s\/[\w-]{43}$/);

  // Someone without an account: no cookies at all.
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const view = await guest.newPage();
  await view.goto(url);
  await expect(view.getByRole('heading', { name: 'Sera IoT' })).toBeVisible();
  await expect(view.getByText('Salt okunur')).toBeVisible();
  await expect(view.locator('.react-flow__node', { hasText: 'Sera API' })).toBeVisible();
  await view.getByRole('tab', { name: 'Donanım' }).click();
  await expect(view.locator('.react-flow__node', { hasText: 'ESP32-S3' })).toBeVisible();

  await menu.getByRole('button', { name: 'Paylaşımı kaldır' }).click();
  await expect(menu.getByRole('status')).toContainText('Paylaşım kaldırıldı');
  await view.reload();
  await expect(
    view.getByText('Bu bağlantı geçersiz ya da kaldırılmış.', { exact: false }),
  ).toBeVisible();
  await guest.close();
});
