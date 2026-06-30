const conversation = {
  id: 'fixture-conversation',
  title: 'Synthetic Phase 2 Archive',
  slug: 'synthetic-phase-2-archive',
  createTime: 1_700_000_000,
  updateTime: 1_700_000_100,
  createIso: '2023-11-14T22:13:20.000Z',
  updateIso: '2023-11-14T22:15:00.000Z',
  archived: false,
  starred: false,
  messageCount: 2,
  hiddenMessageCount: 0,
  codeBlockCount: 1,
  assetCount: 3,
  externalAssetCount: 1,
  snippet: 'Synthetic fixture conversation',
  searchText: 'Synthetic fixture conversation README Python missing asset',
};

const base = {
  conversationId: conversation.id,
  conversationTitle: conversation.title,
  messageId: 'assistant-message',
  createTime: 1_700_000_100,
  role: 'assistant',
  searchText: 'synthetic fixture',
};

export const fixtureArchiveIndex = {
  generatedAt: '2026-06-30T00:00:00Z',
  sourcePath: 'tests/fixtures/openai-export',
  totals: { conversations: 1, visibleMessages: 2, hiddenMessages: 0, assets: 3, copiedAssets: 1, missingAssets: 1, externalAssets: 1 },
  conversations: [conversation],
};

const manyAssets = Array.from({ length: 510 }, (_, index) => ({
  ...base,
  id: `local-${index}`,
  type: 'asset',
  kind: 'local',
  label: `Synthetic image ${index}`,
  original: `file-service://image-${index}`,
  url: '/fixture-image.svg',
}));

export const fixtureArtifactIndex = {
  generatedAt: '2026-06-30T00:00:00Z',
  sourcePath: 'tests/fixtures/openai-export',
  totals: { code: 2, assets: 512, documents: 3, links: 1 },
  languageCounts: { python: 1, rust: 1 },
  code: [
    { ...base, id: 'python', type: 'code', language: 'python', preview: 'print("fixture")', text: 'print("fixture")' },
    { ...base, id: 'rust', type: 'code', language: 'rust', preview: 'fn main()', text: 'fn main() {}' },
  ],
  documents: [
    { ...base, id: 'readme', type: 'document', documentType: 'README', title: 'README.md', preview: 'Uploaded document · README.md', original: 'file-service://fixture-readme', url: '/fixture-readme.md' },
    { ...base, id: 'manifest', type: 'document', documentType: 'Document', title: 'manifest.toml', preview: 'Uploaded document · manifest.toml', original: 'file-service://fixture-toml', url: '/fixture.toml' },
    { ...base, id: 'missing-doc', type: 'document', documentType: 'Roadmap', title: 'Roadmap.pdf', preview: 'Uploaded document · Roadmap.pdf', original: 'file-service://missing-doc', url: '' },
  ],
  assets: [
    ...manyAssets,
    { ...base, id: 'external', type: 'asset', kind: 'external', label: 'External fixture', original: 'https://example.invalid/fixture.png', url: 'https://example.invalid/fixture.png' },
    { ...base, id: 'missing', type: 'asset', kind: 'missing', label: 'Missing fixture', original: 'file-service://missing', url: '' },
  ],
  links: [{ ...base, id: 'link', type: 'link', label: 'Fixture docs', url: 'https://example.test/docs', domain: 'example.test' }],
};

export const fixtureConversation = {
  ...conversation,
  messages: [
    { id: 'user-message', role: 'user', authorName: null, createTime: 1_700_000_000, status: null, contentType: 'text', text: 'Build the fixture.', blocks: [{ type: 'markdown', text: 'Build the fixture.' }], assets: [], documents: [], references: [], hidden: false, rawType: 'text' },
    { id: 'assistant-message', role: 'assistant', authorName: null, createTime: 1_700_000_100, status: null, contentType: 'text', text: 'Fixture response', blocks: [{ type: 'markdown', text: '# Fixture response' }, { type: 'code', language: 'python', text: 'print("fixture")' }], assets: [], documents: [], references: [], hidden: false, rawType: 'text' },
  ],
};
