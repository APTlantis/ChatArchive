import { expect, test } from '@playwright/test';
import { fixtureArchiveIndex, fixtureArtifactIndex, fixtureConversation } from '../fixtures/staticArchive';

test.beforeEach(async ({ page }) => {
  await page.route('**/archive-data/index.json', (route) => route.fulfill({ json: fixtureArchiveIndex }));
  await page.route('**/archive-data/artifacts.json', (route) => route.fulfill({ json: fixtureArtifactIndex }));
  await page.route('**/archive-data/conversations/*.json', (route) => route.fulfill({ json: fixtureConversation }));
  await page.goto('/');
});

test('organizes an artifact into durable knowledge records', async ({ page }) => {
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.getByRole('button', { name: 'Organize' }).click();

  const organizer = page.getByRole('dialog', { name: /Organize/ });
  await organizer.getByRole('button', { name: 'Rust', exact: true }).click();
  await organizer.getByPlaceholder('New collection').fill('Aegis');
  await organizer.getByPlaceholder('New collection').press('Enter');
  await organizer.getByPlaceholder('Attach a note...').fill('This became v0.3.0 implementation.');
  await organizer.getByRole('button', { name: 'Save note' }).click();
  await organizer.getByRole('button', { name: 'Favorite', exact: true }).click();
  await organizer.getByTitle('Close').click();

  await page.reload();
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeVisible();
  await expect(page.getByText('Aegis')).toBeVisible();
  await expect(page.getByText('This became v0.3.0 implementation.')).toBeVisible();
  await page.getByRole('button', { name: 'print("fixture") code' }).first().click();
  await expect(page.getByRole('dialog', { name: /Organize/ }).getByRole('button', { name: 'Rust', exact: true })).toHaveClass(/active/);
});
