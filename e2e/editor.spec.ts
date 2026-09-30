import { expect, test, type Page } from '@playwright/test';

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const addFromPalette = (page: Page, name: string) =>
  page
    .getByRole('complementary', { name: 'Bileşenler' })
    .getByRole('button', { name })
    .first()
    .click();
const node = (page: Page, text: string) => page.locator('.react-flow__node', { hasText: text });

async function connect(page: Page, from: string, to: string) {
  await node(page, from).hover();
  await node(page, from)
    .locator('[data-handleid="out:new"]')
    .dragTo(node(page, to).locator('[data-handleid="in:new"]'));
}

test('design across three domains, catch a voltage mismatch, keep it after reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projeler' })).toBeVisible();
  await page.getByRole('button', { name: 'Boş proje oluştur' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  // One component per domain tab, two of them real hardware parts.
  await tab(page, 'Donanım').click();
  await addFromPalette(page, 'ESP32-S3');
  await addFromPalette(page, 'HC-SR04');
  await tab(page, 'Full Stack').click();
  await addFromPalette(page, 'API servisi');
  await tab(page, 'Yapay Zeka').click();
  await addFromPalette(page, 'Model sunucu');

  // Everything meets in the overview; lay it out so nothing overlaps.
  await tab(page, 'Bütünleşik').click();
  await page.getByRole('button', { name: 'Otomatik yerleştir' }).click();

  // Cross-domain link: the MCU talks to the backend.
  await connect(page, 'ESP32-S3', 'API servisi');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  // Wire the 5 V sonar to the 3.3 V MCU as GPIO: the pins get suggested,
  // and the voltage rule must object.
  await connect(page, 'ESP32-S3', 'HC-SR04');
  await page.getByLabel('Protokol').selectOption('GPIO');
  await expect(page.getByText(/gerilim uyuşmazlığı/).first()).toBeVisible();

  // Autosave, then a reload brings the same design and the same finding back.
  await expect(page.getByRole('status').filter({ hasText: 'Kaydedildi' })).toBeVisible({
    timeout: 10_000,
  });
  await page.reload();
  await expect(node(page, 'HC-SR04')).toBeVisible();
  await expect(node(page, 'Model sunucu')).toBeVisible();
  await expect(page.getByText(/gerilim uyuşmazlığı/).first()).toBeVisible();
});

test("another user's project is not reachable", async ({ page }) => {
  await page.goto('/p/does-not-exist');
  await expect(page.getByText('Bu proje bulunamadı.', { exact: false })).toBeVisible();
});
