import { expect, test, type Browser } from '@playwright/test';
import { mintSession } from '../apps/server/src/test/session';
import { e2eEnv } from '../playwright.config';

/** A browser for someone other than the owner: another signed-in user, or nobody. */
async function visitor(browser: Browser, who?: { email: string; name: string }) {
  const cookie = who && (await mintSession(e2eEnv, who));
  const cookies = cookie
    ? [
        {
          name: cookie.name,
          value: cookie.value,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
          expires: -1,
        },
      ]
    : [];
  return browser.newContext({ storageState: { cookies, origins: [] } });
}

test('a reviewer comments through the link; the owner sees it live and resolves it', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  const menu = page.locator('#share-menu');
  const allow = menu.getByLabel('Yorumlara izin ver');
  await page.getByRole('button', { name: 'Paylaş' }).click();
  await menu.getByRole('button', { name: 'Bağlantı oluştur' }).click();
  const url = await menu.getByLabel('Paylaşım bağlantısı').inputValue();

  // Off by default: the link shows the design and nothing else.
  const guest = await visitor(browser);
  const anon = await guest.newPage();
  await anon.goto(url);
  await expect(anon.getByRole('heading', { name: 'Sera IoT' })).toBeVisible();
  await expect(anon.getByRole('complementary', { name: 'Yorumlar' })).toHaveCount(0);

  await allow.check();
  await expect(allow).toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Yorumlar' }).click();

  // Signed out: reads, and is asked to sign in before writing.
  await anon.reload();
  await expect(anon.getByText('Yorum yazmak için giriş yap.')).toBeVisible();
  await expect(anon.getByLabel('Yorumunu yaz')).toHaveCount(0);

  // Someone else, signed in: picks a component and comments on it.
  const reviewer = await visitor(browser, {
    email: 'reviewer@example.test',
    name: 'İnceleyen Kişi',
  });
  const other = await reviewer.newPage();
  await other.goto(url);
  await other.locator('.react-flow__node', { hasText: 'Sera API' }).click();
  await expect(other.getByText('Konu: Sera API')).toBeVisible();
  await other
    .getByLabel('Yorumunu yaz')
    .fill('Bu servis MQTT mesajlarını kuyruğa almadan mı işliyor?');
  await other.getByRole('button', { name: 'Yorum ekle' }).click();
  await expect(other.getByText('Yorum eklendi.')).toBeVisible();

  // The owner's open editor hears about it without reloading.
  const panel = page.getByRole('complementary', { name: 'Yan panel' });
  await expect(panel.getByText('Bu servis MQTT mesajlarını', { exact: false })).toBeVisible();
  await expect(panel.getByText('İnceleyen Kişi')).toBeVisible();
  const mark = page.getByRole('img', { name: '1 açık yorum' });
  await expect(mark).toBeVisible();

  await panel.getByRole('button', { name: 'Çözüldü olarak işaretle' }).click();
  await expect(panel.getByText('Çözülen konuşmalar (1)')).toBeVisible();
  await expect(mark).toHaveCount(0);

  // The reviewer sees it resolved and cannot reopen it; only the owner can.
  await other.reload();
  await expect(other.getByText('Çözülen konuşmalar (1)')).toBeVisible();
  await expect(other.getByRole('button', { name: 'Yeniden aç' })).toHaveCount(0);

  // Switching comments off takes them off the link again.
  await page.getByRole('button', { name: 'Paylaş' }).click();
  await allow.uncheck();
  await expect(allow).not.toBeChecked();
  await other.reload();
  await expect(other.getByRole('heading', { name: 'Sera IoT' })).toBeVisible();
  await expect(other.getByRole('complementary', { name: 'Yorumlar' })).toHaveCount(0);

  await guest.close();
  await reviewer.close();
});
