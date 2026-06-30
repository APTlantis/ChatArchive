import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fixtureArchiveIndex, fixtureArtifactIndex, fixtureConversation } from '../fixtures/staticArchive';

test.beforeEach(async ({ page }) => {
  await page.route('**/archive-data/index.json', (route) => route.fulfill({ json: fixtureArchiveIndex }));
  await page.route('**/archive-data/artifacts.json', (route) => route.fulfill({ json: fixtureArtifactIndex }));
  await page.route('**/archive-data/conversations/*.json', (route) => route.fulfill({ json: fixtureConversation }));
  await page.route('**/fixture-image.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#12343b"/><text x="24" y="96" fill="white">Fixture</text></svg>' }));
  await page.route('https://example.invalid/**', (route) => route.abort());
  await page.goto('/');
});

test('dashboard and all Phase 2 explorers render and respond', async ({ page }) => {
  await expect(page.getByRole('main').getByRole('heading', { name: 'Chat Archive' })).toBeVisible();
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Code Explorer' })).toBeVisible();
  await page.getByPlaceholder('Search code, language, title, or role').fill('python');
  await expect(page.getByText('1 of 2 snippets')).toBeVisible();

  await page.getByRole('button', { name: 'Docs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Document Explorer' })).toBeVisible();
  await page.getByPlaceholder('Search title, type, preview, conversation, or role').fill('manifest.toml');
  await expect(page.getByText('1 of 3 documents')).toBeVisible();

  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Asset Explorer' })).toBeVisible();
  await expect(page.locator('.asset-artifact-row')).toHaveCount(500);
  await expect(page.getByText('Showing first 500 matches. Narrow the search or choose an asset type.')).toBeVisible();
  await page.getByRole('button', { name: 'Missing 1' }).click();
  await expect(page.getByText('Local asset not found')).toBeVisible();
});

test('source navigation, empty states, keyboard focus, and accessibility remain healthy', async ({ page }) => {
  await page.getByRole('button', { name: 'Docs', exact: true }).click();
  await page.getByPlaceholder('Search title, type, preview, conversation, or role').fill('does-not-exist');
  await expect(page.getByText('No documents match those filters.')).toBeVisible();
  await page.getByPlaceholder('Search title, type, preview, conversation, or role').fill('README.md');
  await page.getByRole('button', { name: 'Source' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic Phase 2 Archive' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
});

test('asset cards do not collapse at supported viewports', async ({ page }) => {
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  const boxes = await page.locator('.asset-artifact-row').evaluateAll((items) => items.slice(0, 8).map((item) => item.getBoundingClientRect().height));
  expect(boxes.every((height) => height >= 160)).toBe(true);
  await expect(page.locator('.asset-explorer')).toHaveScreenshot(`asset-explorer-${test.info().project.name}.png`, { animations: 'disabled' });
});
