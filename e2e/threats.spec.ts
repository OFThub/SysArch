import { expect, test, type Page } from '@playwright/test';

/** Selects a link by clicking a point on its line that nothing covers. */
async function clickEdge(page: Page, id: string) {
  const edge = page.locator(`.react-flow__edge[data-id="${id}"]`);
  await expect(async () => {
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
    await page.mouse.click(at.x, at.y);
    await expect(edge).toHaveClass(/selected/, { timeout: 500 });
  }).toPass({ timeout: 5_000 });
}

test('see trust zones on the canvas and an unencrypted crossing flagged', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'SaaS uygulaması şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  // The template comes zoned, every crossing link on TLS.
  await page.getByRole('tab', { name: 'Tehditler' }).click();
  await expect(page.getByLabel('Sınır adı')).toHaveCount(3);
  await expect(page.getByText('Güvenlik bulgusu yok.')).toBeVisible();
  await expect(page.locator('[data-boundary="inside"]')).toBeVisible();

  // Take TLS off the payment call: it now leaves for the internet in the clear.
  await clickEdge(page, 'e-charge');
  await page.getByLabel('Şifreli (TLS)').uncheck();
  await expect(page.getByText('şifresiz geçiyor', { exact: false })).toBeVisible();
});
