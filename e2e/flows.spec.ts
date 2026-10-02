import { expect, test, type Page } from '@playwright/test';

/**
 * Adds a link to the selection the way a user would: Ctrl-click on a point
 * of its line that nothing covers. Retried until it shows as selected,
 * because a freshly loaded canvas may still be fitting its view; a link that
 * is already selected is never clicked again (Ctrl-click would toggle it off).
 */
async function selectEdge(page: Page, id: string) {
  const edge = page.locator(`.react-flow__edge[data-id="${id}"]`);
  await expect(async () => {
    if (!(await edge.getAttribute('class'))?.includes('selected')) {
      const at = await edge
        .locator('path')
        .first()
        .evaluate((p: SVGPathElement, edgeId) => {
          const t = p.getScreenCTM()!;
          for (const f of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
            const m = p.getPointAtLength(p.getTotalLength() * f);
            const x = m.x * t.a + m.y * t.c + t.e;
            const y = m.x * t.b + m.y * t.d + t.f;
            const hit = document.elementFromPoint(x, y)?.closest('.react-flow__edge');
            if (hit?.getAttribute('data-id') === edgeId) return { x, y };
          }
          throw new Error(`no uncovered point on ${edgeId}`);
        }, id);
      await page.keyboard.down('Control');
      await page.mouse.click(at.x, at.y);
      await page.keyboard.up('Control');
    }
    await expect(edge).toHaveClass(/selected/, { timeout: 500 });
  }).toPass({ timeout: 5_000 });
}

test('make a flow from selected links, time it against a target, play it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  // Sensor to broker to API to database, picked on the overview with Ctrl.
  for (const id of ['e-store', 'e-publish', 'e-subscribe']) await selectEdge(page, id);

  await page.getByRole('tab', { name: 'Akışlar' }).click();
  await page.getByRole('button', { name: 'Seçili bağlantılardan akış oluştur' }).click();
  const row = page.getByRole('listitem').filter({ has: page.getByLabel('Akış adı') });
  await expect(row).toContainText('3 adım');

  await row.getByLabel('Akış adı').fill('Telemetri');
  // A target the flow cannot meet.
  const target = row.getByPlaceholder('ms');
  await target.fill('1');
  await target.press('Enter');
  await expect(row).toContainText('Hedefi aşıyor');
  await page.getByRole('tab', { name: /Sorunlar/ }).click();
  await expect(page.getByText('“Telemetri” akışı', { exact: false })).toBeVisible();

  await page.getByRole('tab', { name: /Akışlar/ }).click();
  await row.getByRole('button', { name: 'Oynat' }).click();
  await expect(page.locator('.react-flow__edge circle')).toHaveCount(1);

  await expect(page.getByRole('status').filter({ hasText: 'Kaydedildi' })).toBeVisible({
    timeout: 10_000,
  });
  await page.reload();
  await page.getByRole('tab', { name: /Akışlar/ }).click();
  await expect(page.getByLabel('Akış adı')).toHaveValue('Telemetri');
});
