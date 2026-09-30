import { expect, test, type Page } from '@playwright/test';

const node = (page: Page, text: string) => page.locator('.react-flow__node', { hasText: text });

test('review a proposal on the canvas, apply part of it, undo it in one step', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  const id = page.url().split('/p/')[1]!;

  // What an MCP client does: propose, never write. The session cookie is the page's own.
  const res = await page.request.post(`/api/projects/${id}/proposals`, {
    data: {
      summary: 'API önüne Redis önbelleği ekle ve paneli yeniden adlandır',
      ops: [
        {
          op: 'add_node',
          node: { id: 'cache', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} },
        },
        {
          op: 'add_edge',
          edge: { id: 'e-cache', source: 'api', target: 'cache', protocol: 'TCP', props: {} },
        },
        { op: 'update_node', id: 'dashboard', patch: { label: 'Yönetim paneli' } },
      ],
    },
  });
  expect(res.status()).toBe(201);
  await page.reload();

  await page.getByRole('tab', { name: /Öneriler/ }).click();
  await page.getByRole('button', { name: /Redis önbelleği/ }).click();

  // The canvas previews the outcome without changing the doc.
  await expect(node(page, 'Redis')).toContainText('Yeni');
  await expect(node(page, 'Yönetim paneli')).toContainText('Değişecek');

  // Keep the cache, leave the rename out.
  await page.getByLabel('“Panel” için etiket değiştir').uncheck();
  await expect(node(page, 'Yönetim paneli')).toHaveCount(0);
  await page.getByRole('button', { name: 'Öneriyi uygula' }).click();
  await expect(page.getByText('Öneri uygulandı.')).toBeVisible();

  await expect(node(page, 'Redis')).not.toContainText('Yeni');
  await expect(node(page, 'Panel')).toBeVisible();

  // The whole proposal is one undo step, and redo brings it back.
  await page.keyboard.press('Control+z');
  await expect(node(page, 'Redis')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(node(page, 'Redis')).toBeVisible();

  await expect(page.getByRole('status').filter({ hasText: 'Kaydedildi' })).toBeVisible({
    timeout: 10_000,
  });
  await page.reload();
  await expect(node(page, 'Redis')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Öneriler' })).toBeVisible();
});
