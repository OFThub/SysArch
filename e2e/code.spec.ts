import { expect, test, type Page } from '@playwright/test';

const node = (page: Page, text: string) => page.locator('.react-flow__node', { hasText: text });

/**
 * Finds `text` in the code with the editor's search, as a user would (only
 * the lines in view are rendered), and leaves the cursor at the end of its
 * line. Returns the search's match count text.
 */
async function find(page: Page, text: string) {
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('Control+F');
  await page.keyboard.type(text);
  const count = await page.locator('.find-widget .matchesCount').textContent();
  await page.keyboard.press('Escape');
  await page.keyboard.press('End');
  return count;
}

test('edit the design as YAML, see mistakes on their line, undo from the canvas', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sera IoT şablonuyla başla' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  // A selected component must survive keys typed into the code.
  await node(page, 'Panel').click();
  await page.getByRole('tab', { name: 'Kod' }).click();
  // The dev server serves Monaco unbundled, ~1100 modules on first open.
  await expect(page.getByRole('textbox', { name: 'Mimari kodu (YAML)' })).toBeAttached({
    timeout: 30_000,
  });

  await find(page, 'label: Sera API');
  await page.keyboard.type(' v2');
  await expect(node(page, 'Sera API v2')).toBeVisible();

  // A link to a component that does not exist: flagged, canvas unchanged.
  await find(page, 'source: api');
  await page.keyboard.type('x');
  await expect(page.getByText('"apix" kimlikli bir bileşen yok.')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.getByText('1 hata')).toHaveCount(0);
  await expect(node(page, 'Panel')).toBeVisible();

  // Undo on the toolbar steps back over the whole edit, and the code follows.
  await page.getByRole('button', { name: 'Geri al' }).click();
  await expect(node(page, 'Sera API v2')).toHaveCount(0);
  expect(await find(page, 'Sera API v2')).toBe('No results');
});
