import { expect, test } from '@playwright/test';

test('start a project from a template other than the default', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Şablonla başla' })).toBeVisible();
  await page.getByRole('button', { name: 'RAG uygulaması şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  await expect(page.getByRole('heading', { name: 'RAG uygulaması' })).toBeVisible();
  await expect(page.locator('.react-flow__node', { hasText: 'Yanıt modeli' })).toBeVisible();
  // It comes with its flows, already within their targets.
  await page.getByRole('tab', { name: /Akışlar/ }).click();
  await expect(page.getByLabel('Akış adı')).toHaveCount(2);
  await expect(page.getByText('Hedefi aşıyor')).toHaveCount(0);
});
