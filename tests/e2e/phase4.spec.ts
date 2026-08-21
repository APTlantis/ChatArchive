import { expect, test } from '@playwright/test';
import { fixtureArchiveIndex, fixtureArtifactIndex, fixtureConversation } from '../fixtures/staticArchive';

test.beforeEach(async ({ page }) => {
  await page.route('**/archive-data/index.json', (route) => route.fulfill({ json: fixtureArchiveIndex }));
  await page.route('**/archive-data/artifacts.json', (route) => route.fulfill({ json: fixtureArtifactIndex }));
  await page.route('**/archive-data/conversations/*.json', (route) => route.fulfill({ json: fixtureConversation }));
  await page.goto('/');
});

test('does not expose Project Intelligence in the release surface', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Projects', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Project Intelligence' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible();
  await expect(page.getByText('Projects', { exact: true })).toHaveCount(0);
});
