import { expect, test } from '@playwright/test';

test('create an API key, use it as yourself, revoke it', async ({ page, playwright }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Anahtar oluştur' }).click();
  const setup = page.getByRole('status').filter({ hasText: 'Anahtar oluşturuldu' });
  await expect(setup).toContainText('SYSARCH_API_KEY=sysarch_');
  // From the <pre> only: the button text that follows would run into the key.
  const key = /SYSARCH_API_KEY=(\S+)/.exec((await setup.locator('pre').textContent())!)![1]!;

  // A client without the browser's session: only the key identifies it.
  const client = await playwright.request.newContext({ baseURL: page.url() });
  const me = await client.get('/api/me', { headers: { 'x-api-key': key } });
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ email: 'e2e@example.test' });

  await page.getByRole('button', { name: 'İptal et' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'İptal et' }).click();
  await expect(page.getByText('Henüz anahtar yok.')).toBeVisible();
  const revoked = await client.get('/api/me', { headers: { 'x-api-key': key } });
  expect(revoked.status()).toBe(401);
  await client.dispose();
});
