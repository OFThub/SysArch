import { expect, test, type Page } from '@playwright/test';

async function openTemplate(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  return page.url().split('/p/')[1]!;
}

test('says the assistant is off when the server has no model key', async ({ page }) => {
  await openTemplate(page);
  await page.getByRole('tab', { name: 'Asistan' }).click();
  await expect(page.getByText('Asistan kapalı.', { exact: false })).toBeVisible();
});

test('streams a reply and opens the proposal it made for review', async ({ page }) => {
  const id = await openTemplate(page);
  // A real pending proposal, as the server would create from the reply's ops.
  const created = await page.request.post(`/api/projects/${id}/proposals`, {
    data: {
      summary: 'Paneli yeniden adlandırdım.',
      ops: [{ op: 'update_node', id: 'dashboard', patch: { label: 'Yönetim paneli' } }],
    },
  });
  const { proposal } = (await created.json()) as { proposal: { id: string } };

  // No model in E2E: the assistant endpoint plays back a recorded reply.
  await page.route('**/api/projects/*/assistant', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { available: true, messages: [] } })
      : route.fulfill({
          contentType: 'text/event-stream',
          body: [
            'event: text\ndata: "Paneli "\n\n',
            'event: text\ndata: "yeniden adlandırdım."\n\n',
            `event: done\ndata: ${JSON.stringify({ text: 'Paneli yeniden adlandırdım.', refused: false, proposal })}\n\n`,
          ].join(''),
        }),
  );
  await page.reload();

  await page.getByRole('tab', { name: 'Asistan' }).click();
  const box = page.getByLabel('Bir şey sor ya da değişiklik iste');
  await box.fill('Paneli yeniden adlandır');
  await box.press('Enter');

  await expect(page.getByText('Paneli yeniden adlandır', { exact: true })).toBeVisible();
  await expect(page.getByText('Paneli yeniden adlandırdım.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Öneriyi incele' }).click();

  await expect(page.getByRole('tab', { name: /Öneriler/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Öneriyi uygula' })).toBeVisible();
});
