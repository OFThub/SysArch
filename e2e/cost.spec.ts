import { expect, test } from '@playwright/test';

test('see what a design costs, then correct a price for the project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'RAG uygulaması şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  await page.getByRole('tab', { name: 'Maliyet' }).click();
  const answer = page.getByRole('row', { name: /Yanıt modeli/ });
  // 5000 a day × 30 × (6000 tokens × $2 + 500 × $10) per million
  await expect(answer).toContainText('$2.550,00');

  const input = page.getByLabel('llm-in:claude-sonnet-5-5 için proje fiyatı');
  await input.fill('1');
  await input.press('Enter');
  await expect(answer).toContainText('$1.650,00');
});
