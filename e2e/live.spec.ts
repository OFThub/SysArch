import { expect, test } from '@playwright/test';

test('an open tab picks up saves and proposals from elsewhere without reloading', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  const id = page.url().split('/p/')[1]!;

  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.getByRole('heading', { name: 'Sera IoT' })).toBeVisible();

  // A proposal from an MCP client shows up in the open tab.
  const res = await page.request.post(`/api/projects/${id}/proposals`, {
    data: {
      summary: 'Paneli yeniden adlandır',
      ops: [{ op: 'update_node', id: 'dashboard', patch: { label: 'Yönetim paneli' } }],
    },
  });
  expect(res.status()).toBe(201);
  await expect(other.getByRole('tab', { name: /Öneriler.*1/ })).toBeVisible();

  // An edit saved in the first tab loads into the second, which had nothing unsaved.
  await page.getByLabel('Ad', { exact: true }).fill('Sera canlı');
  await expect(other.getByRole('heading', { name: 'Sera canlı' })).toBeVisible({
    timeout: 10_000,
  });
  // The tab that saved does not reload itself into a conflict.
  await expect(page.getByRole('status').filter({ hasText: 'Kaydedildi' })).toBeVisible();
});
