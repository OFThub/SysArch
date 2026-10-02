import { expect, test, type Page } from '@playwright/test';

const node = (page: Page, text: string) => page.locator('.react-flow__node', { hasText: text });
const crumbs = (page: Page) => page.getByRole('navigation', { name: 'Konum' });

test('open a component, add a part inside it, come back out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await page.getByRole('tab', { name: 'Full Stack', exact: true }).click();

  await node(page, 'Sera API').dblclick();
  await expect(crumbs(page)).toContainText('Full Stack');
  await expect(crumbs(page)).toContainText('Sera API');
  await expect(page.getByText('Paletten bir bileşeni', { exact: false })).toBeVisible();

  await page
    .getByRole('complementary', { name: 'Bileşenler' })
    .getByRole('button', { name: 'Önbellek' })
    .first()
    .click();
  await expect(node(page, 'Önbellek')).toBeVisible();

  // Back up: the inner part is not on the tab, the API says it has one.
  await crumbs(page).getByRole('button', { name: 'Full Stack' }).click();
  await expect(crumbs(page)).toHaveCount(0);
  await expect(node(page, 'Önbellek')).toHaveCount(0);
  await expect(node(page, 'Sera API')).toContainText('1 alt bileşen');

  await expect(page.getByRole('status').filter({ hasText: 'Kaydedildi' })).toBeVisible({
    timeout: 10_000,
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Full Stack', exact: true }).click();
  await node(page, 'Sera API').dblclick();
  await expect(node(page, 'Önbellek')).toBeVisible();
});
