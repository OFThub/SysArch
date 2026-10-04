import { expect, test, type Page } from '@playwright/test';

const node = (page: Page, text: string) => page.locator('.react-flow__node', { hasText: text });

const COMPOSE = `services:
  billing:
    build: ./billing
    depends_on: [ledger, jobs]
  ledger:
    image: postgres:17
  jobs:
    image: redis:7
  metrics:
    image: grafana/grafana
`;

test('import a compose file as a proposal, review it, apply it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  await page.getByRole('button', { name: 'İçe aktar' }).click();
  const dialog = page.getByRole('dialog');
  // Not a format it reads: says so, sends nothing.
  await dialog.getByLabel('İçe aktarılacak metin').fill('just: yaml');
  await expect(dialog.getByText('Bu biçim tanınmadı.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Öneri olarak ekle' })).toBeDisabled();

  await dialog.getByLabel('İçe aktarılacak metin').fill(COMPOSE);
  await expect(dialog.getByRole('status')).toContainText('docker-compose: 4 bileşen, 2 bağlantı');
  await expect(dialog).toContainText('metrics: türü adından tahmin edildi');
  await dialog.getByRole('button', { name: 'Öneri olarak ekle' }).click();
  await expect(dialog).toHaveCount(0);

  // It opens for review; the canvas previews it, the design is unchanged.
  await expect(page.getByRole('tab', { name: /Öneriler/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('docker-compose içe aktarıldı', { exact: false })).toBeVisible();
  await expect(node(page, 'billing')).toContainText('Yeni');

  await page.getByRole('button', { name: 'Öneriyi uygula' }).click();
  await expect(page.getByText('Öneri uygulandı.')).toBeVisible();
  await expect(node(page, 'ledger')).not.toContainText('Yeni');
  await expect(node(page, 'jobs')).toBeVisible();
});
