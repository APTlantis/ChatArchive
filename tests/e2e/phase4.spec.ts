import { expect, test } from '@playwright/test';
import { fixtureArchiveIndex, fixtureArtifactIndex, fixtureConversation } from '../fixtures/staticArchive';

const conversations = [
  { ...fixtureArchiveIndex.conversations[0], id: 'aegis-1', title: 'Aegis initial concept', createTime: 1_754_000_000, updateTime: 1_754_000_000 },
  { ...fixtureArchiveIndex.conversations[0], id: 'aegis-2', title: 'Aegis UI design', createTime: 1_759_276_800, updateTime: 1_759_276_800 },
  { ...fixtureArchiveIndex.conversations[0], id: 'aegis-3', title: 'Aegis v0.3.0', createTime: 1_767_225_600, updateTime: 1_767_225_600 },
];

const index = { ...fixtureArchiveIndex, totals: { ...fixtureArchiveIndex.totals, conversations: 3 }, conversations };
const artifacts = {
  ...fixtureArtifactIndex,
  code: [{ ...fixtureArtifactIndex.code[1], id: 'aegis-code', conversationId: 'aegis-3', conversationTitle: 'Aegis v0.3.0', preview: 'const version = "v0.3.0"', searchText: 'Aegis v0.3.0 release' }],
  assets: [], documents: [], links: [],
  totals: { code: 1, assets: 0, documents: 0, links: 0 },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('chatArchive.knowledgeState.v1', JSON.stringify({
      tags: [], notes: [], favorites: [], tagLinks: [],
      collections: [{ id: 1, name: 'Aegis', createdAt: Date.now() }],
      collectionItems: [
        { collectionId: 1, targetType: 'conversation', targetId: 'aegis-1', conversationId: 'aegis-1', title: 'Aegis initial concept', createdAt: Date.now() },
        { collectionId: 1, targetType: 'conversation', targetId: 'aegis-2', conversationId: 'aegis-2', title: 'Aegis UI design', createdAt: Date.now() },
        { collectionId: 1, targetType: 'conversation', targetId: 'aegis-3', conversationId: 'aegis-3', title: 'Aegis v0.3.0', createdAt: Date.now() },
      ],
    }));
  });
  await page.route('**/archive-data/index.json', (route) => route.fulfill({ json: index }));
  await page.route('**/archive-data/artifacts.json', (route) => route.fulfill({ json: artifacts }));
  await page.route('**/archive-data/conversations/*.json', (route) => route.fulfill({ json: fixtureConversation }));
  await page.goto('/');
});

test('reviews a candidate and builds a curated project dashboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project Intelligence' })).toBeVisible();
  await page.getByRole('button', { name: 'Scan projects' }).click();
  await expect(page.locator('.candidate-row').getByText('Aegis', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.project-dashboard').getByRole('heading', { name: 'Aegis' })).toBeVisible();
  await expect(page.getByText('Release milestone').first()).toBeVisible();
  await expect(page.getByText('Aegis v0.3.0', { exact: true }).first()).toBeVisible();

  await page.getByPlaceholder('Rename project').fill('Aegis Platform');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.locator('.project-dashboard').getByRole('heading', { name: 'Aegis Platform' })).toBeVisible();

  await page.getByPlaceholder('Filter project activity').fill('v0.3.0');
  await expect(page.locator('.timeline-item')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByText('Aegis Platform', { exact: true }).first()).toBeVisible();
});
