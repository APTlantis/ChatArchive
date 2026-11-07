import { describe, expect, it } from 'vitest';
import {
  countAssetKinds,
  countAssetExtensions,
  assetDisplayName,
  assetFileExtension,
  classifyCodeArtifactKind,
  classifyLinkArtifactKind,
  classifyUnresolvedAssetCause,
  computeLineDiff,
  countCodeCategories,
  countCodeLanguages,
  countDocumentAvailability,
  countDocumentTypes,
  countLinkCategories,
  countLinkDomains,
  deriveCodeArtifactTitle,
  deriveDocumentDisplayTitle,
  filterAssetArtifacts,
  filterCodeArtifacts,
  filterDocumentArtifacts,
  filterLinkArtifacts,
  findCodeRevisionsAndDuplicates,
  findDocumentRevisions,
  findRelatedArchiveItems,
  formatExternalFileBadge,
  buildCollectionTimeline,
  isRecoveredDocumentArtifact,
  linkDisplayLabel,
  normalizeLinkDomain,
  sanitizeCodeLanguageToken,
  sanitizeLinkUrl,
  selectedExplorerArtifact,
  summarizeUnresolvedAssets,
  visibleExplorerRows,
} from '../../src/artifactLogic';
import type { AssetArtifact, CodeArtifact, DocumentArtifact, LinkArtifact } from '../../src/types';

const base = { conversationId: 'c1', conversationTitle: 'Archive', messageId: 'm1', role: 'assistant', searchText: '' };

describe('artifact explorer logic', () => {
  it('counts, normalizes, searches, and sorts code artifacts', () => {
    const code: CodeArtifact[] = [
      { ...base, id: 'old', type: 'code', language: ' Python ', preview: 'print', text: 'print(1)', createTime: 1 },
      { ...base, id: 'new', type: 'code', language: 'python', preview: 'async', text: 'async def run(): pass', createTime: 2 },
      { ...base, id: 'rust', type: 'code', language: 'rust', preview: 'fn', text: 'fn main() {}', createTime: 3 },
    ];
    expect(countCodeLanguages(code)).toEqual([{ name: 'python', count: 2 }, { name: 'rust', count: 1 }]);
    expect(filterCodeArtifacts(code, 'python', 'assistant').map((item) => item.id)).toEqual(['new', 'old']);
    expect(filterCodeArtifacts(code, 'all', 'no-match')).toEqual([]);
  });

  it('counts all document types and searches title, preview, conversation, and role', () => {
    const documents: DocumentArtifact[] = [
      { ...base, id: 'readme', type: 'document', documentType: 'README', title: 'README.md', preview: 'Uploaded document', createTime: 2 },
      { ...base, id: 'roadmap', type: 'document', documentType: 'Roadmap', title: 'Plan.md', preview: 'Milestones', createTime: 1, role: 'user' },
    ];
    expect(countDocumentTypes(documents)).toEqual([{ name: 'README', count: 1 }, { name: 'Roadmap', count: 1 }]);
    expect(filterDocumentArtifacts(documents, 'Roadmap', 'user').map((item) => item.id)).toEqual(['roadmap']);
    expect(filterDocumentArtifacts(documents, 'all', 'README.md').map((item) => item.id)).toEqual(['readme']);
  });

  it('counts asset facets and searches pointer, URL, label, and conversation', () => {
    const assets: AssetArtifact[] = [
      { ...base, id: 'local', type: 'asset', kind: 'local', label: 'image_asset_pointer', original: 'file-service://one', url: 'local-file://archive/assets/screenshot.png', width: 320, height: 180 },
      { ...base, id: 'external', type: 'asset', kind: 'external', label: 'Reference', original: 'https://example.test/a.png', url: 'https://example.test/a.png' },
      { ...base, id: 'missing', type: 'asset', kind: 'missing', label: 'Lost', original: 'file-service://lost', url: '' },
    ];
    expect(countAssetKinds(assets)).toEqual({ local: 1, external: 1, missing: 1 });
    expect(countAssetExtensions(assets)).toEqual([{ name: 'png', count: 2 }, { name: 'no extension', count: 1 }]);
    expect(assetDisplayName(assets[0])).toBe('screenshot.png');
    expect(assetFileExtension(assets[0])).toBe('png');
    expect(filterAssetArtifacts(assets, 'missing', 'all', 'lost').map((item) => item.id)).toEqual(['missing']);
    expect(filterAssetArtifacts(assets, 'all', 'png', 'example.test').map((item) => item.id)).toEqual(['external']);
    expect(filterAssetArtifacts(assets, 'all', 'png', '320x180').map((item) => item.id)).toEqual(['local']);
  });

  it('bounds lists at 500 and repairs selection after filtering', () => {
    const rows = Array.from({ length: 650 }, (_, id) => ({ id: String(id) }));
    expect(visibleExplorerRows(rows)).toHaveLength(500);
    expect(selectedExplorerArtifact(rows, '42')?.id).toBe('42');
    expect(selectedExplorerArtifact(rows, 'missing')?.id).toBe('0');
    expect(selectedExplorerArtifact([], 'missing')).toBeNull();
  });

  it('sanitizes malformed code fence language labels and classifies block kinds', () => {
    expect(sanitizeCodeLanguageToken(' Rust ')).toBe('rust');
    expect(sanitizeCodeLanguageToken('python title="x.py"')).toBe('python');
    expect(sanitizeCodeLanguageToken('"},{"role":"tool"')).toBe('text');
    expect(sanitizeCodeLanguageToken('"')).toBe('text');

    const blocks: CodeArtifact[] = [
      { ...base, id: '1', type: 'code', language: 'rust', preview: '', text: 'pub fn main() {}', createTime: 5 },
      { ...base, id: '2', type: 'code', language: 'bash', preview: '', text: 'cargo test', createTime: 4 },
      { ...base, id: '3', type: 'code', language: 'toml', preview: '', text: '[package]\nname = "app"', createTime: 3 },
      { ...base, id: '4', type: 'code', language: 'mermaid', preview: '', text: 'flowchart TD\nA-->B', createTime: 2 },
      { ...base, id: '5', type: 'code', language: '"},{"role":', preview: '', text: 'Plain notes from conversation', createTime: 1 },
    ];

    expect(classifyCodeArtifactKind(blocks[0])).toBe('code');
    expect(classifyCodeArtifactKind(blocks[1])).toBe('shell');
    expect(classifyCodeArtifactKind(blocks[2])).toBe('config');
    expect(classifyCodeArtifactKind(blocks[3])).toBe('diagram');
    expect(classifyCodeArtifactKind(blocks[4])).toBe('prose');
    expect(countCodeCategories(blocks)).toEqual([
      { name: 'code', count: 1 },
      { name: 'shell', count: 1 },
      { name: 'config', count: 1 },
      { name: 'diagram', count: 1 },
      { name: 'prose', count: 1 },
    ]);
    expect(filterCodeArtifacts(blocks, 'all', '', 'code').map((b) => b.id)).toEqual(['1']);
  });

  it('sanitizes malformed link URLs/domains and classifies link kinds', () => {
    expect(sanitizeLinkUrl('http://127.0.0.1:8000`**')).toBe('http://127.0.0.1:8000');
    expect(sanitizeLinkUrl('`https://aptlantis.net/docs`.')).toBe('https://aptlantis.net/docs');

    const links: LinkArtifact[] = [
      { ...base, id: 'l1', type: 'link', domain: 'aptlantis.net`', label: 'https://aptlantis.net/docs`', url: 'https://aptlantis.net/docs`', createTime: 4 },
      { ...base, id: 'l2', type: 'link', domain: 'github.com', label: 'ChatArchive Repo', url: 'https://github.com/herb/chatarchive', createTime: 3 },
      { ...base, id: 'l3', type: 'link', domain: 'doc.rust-lang.org', label: 'std::fs', url: 'https://doc.rust-lang.org/std/fs/', createTime: 2 },
      { ...base, id: 'l4', type: 'link', domain: '', label: 'http://127.0.0.1:8000`**', url: 'http://127.0.0.1:8000`**', createTime: 1 },
    ];

    expect(normalizeLinkDomain(links[0])).toBe('aptlantis.net');
    expect(normalizeLinkDomain(links[3])).toBe('127.0.0.1');
    expect(linkDisplayLabel(links[0])).toBe('aptlantis.net/docs');
    expect(linkDisplayLabel(links[1])).toBe('ChatArchive Repo');

    expect(classifyLinkArtifactKind(links[0])).toBe('web');
    expect(classifyLinkArtifactKind(links[1])).toBe('repo');
    expect(classifyLinkArtifactKind(links[2])).toBe('docs');
    expect(classifyLinkArtifactKind(links[3])).toBe('local');

    expect(countLinkCategories(links)).toEqual([
      { name: 'web', count: 1 },
      { name: 'repo', count: 1 },
      { name: 'docs', count: 1 },
      { name: 'local', count: 1 },
    ]);
    expect(countLinkDomains(links, 'web')).toEqual([{ name: 'aptlantis.net', count: 1 }]);
    expect(filterLinkArtifacts(links, 'aptlantis.net', '', 'all').map((l) => l.id)).toEqual(['l1']);
    expect(filterLinkArtifacts(links, 'all', 'chatarchive', 'repo').map((l) => l.id)).toEqual(['l2']);
  });

  it('derives meaningful titles for code blocks and disambiguates generic document titles', () => {
    const codeSamples: CodeArtifact[] = [
      { ...base, id: 'c1', type: 'code', language: 'typescript', preview: '', text: '// src/artifactLogic.ts\nexport function run() {}', createTime: 5 },
      { ...base, id: 'c2', type: 'code', language: 'rust', preview: '', text: 'pub fn build_recovery_bundle(root: &Path) {}', createTime: 4 },
      { ...base, id: 'c3', type: 'code', language: 'toml', preview: '', text: '[identity]\ncanonical_name = "aptlantis-server"', createTime: 3 },
      { ...base, id: 'c4', type: 'code', language: 'sql', preview: '', text: 'CREATE TABLE IF NOT EXISTS knowledge_custom_titles (id TEXT);', createTime: 2 },
    ];

    expect(deriveCodeArtifactTitle(codeSamples[0])).toBe('src/artifactLogic.ts');
    expect(deriveCodeArtifactTitle(codeSamples[1])).toBe('build_recovery_bundle (rust)');
    expect(deriveCodeArtifactTitle(codeSamples[2])).toBe('aptlantis-server · [identity]');
    expect(deriveCodeArtifactTitle(codeSamples[3])).toBe('SQL · knowledge_custom_titles');

    const docs: DocumentArtifact[] = [
      { ...base, id: 'd1', type: 'document', documentType: 'README', title: 'README.md', conversationTitle: 'Aptlantis Mirror Setup', preview: 'Setup guide', url: 'local-file://archive/documents/readme.md', createTime: 2 },
      { ...base, id: 'd2', type: 'document', documentType: 'README', title: 'README.md', conversationTitle: 'DRS Telemetry Node', preview: 'Uploaded pointer', url: '', createTime: 1 },
      { ...base, id: 'd3', type: 'document', documentType: 'Architecture', title: 'Zero-Tier Routing Spec.md', conversationTitle: 'Networking', preview: 'Full spec', url: 'local-file://archive/documents/spec.md', createTime: 3 },
    ];

    expect(deriveDocumentDisplayTitle(docs[0])).toBe('README.md — Aptlantis Mirror Setup');
    expect(deriveDocumentDisplayTitle(docs[1])).toBe('README.md — DRS Telemetry Node');
    expect(deriveDocumentDisplayTitle(docs[2])).toBe('Zero-Tier Routing Spec.md');

    expect(isRecoveredDocumentArtifact(docs[0])).toBe(true);
    expect(isRecoveredDocumentArtifact(docs[1])).toBe(false);
    expect(countDocumentAvailability(docs)).toEqual({ all: 3, recovered: 2, pointer: 1 });
    expect(filterDocumentArtifacts(docs, 'all', '', 'recovered').map((d) => d.id)).toEqual(['d3', 'd1']);
    expect(filterDocumentArtifacts(docs, 'all', '', 'pointer').map((d) => d.id)).toEqual(['d2']);
    expect(filterDocumentArtifacts(docs, 'README', 'Aptlantis', 'all').map((d) => d.id)).toEqual(['d1']);
  });

  it('finds code duplicates, revisions, document revisions, and computes line diffs', () => {
    const codeBlocks: CodeArtifact[] = [
      { ...base, id: 'v1', type: 'code', language: 'rust', preview: '', text: 'pub fn connect_server(port: u16) {\n  println!("connecting {}", port);\n}', createTime: 10 },
      { ...base, id: 'dup', type: 'code', language: 'rust', preview: '', text: 'pub fn connect_server(port: u16) {\n  println!("connecting {}", port);\n}', createTime: 20 },
      { ...base, id: 'v2', type: 'code', language: 'rust', preview: '', text: 'pub fn connect_server(port: u16) {\n  println!("connected {}", port);\n  Ok(())\n}', createTime: 30 },
      { ...base, id: 'unrelated', type: 'code', language: 'python', preview: '', text: 'def other():\n  return 42', createTime: 40 },
    ];

    const { exactDuplicates, revisions } = findCodeRevisionsAndDuplicates(codeBlocks[0], codeBlocks);
    expect(exactDuplicates.map((item) => item.id)).toEqual(['dup']);
    expect(revisions.map((item) => item.id)).toEqual(['v2']);

    const diff = computeLineDiff(codeBlocks[0].text, codeBlocks[2].text);
    expect(diff.lines.some((line) => line.type === 'remove' && line.text.includes('connecting'))).toBe(true);
    expect(diff.lines.some((line) => line.type === 'add' && line.text.includes('connected'))).toBe(true);

    const docs: DocumentArtifact[] = [
      { ...base, id: 'doc-v1', type: 'document', documentType: 'Spec', title: 'Zero-Tier Routing Spec.md', conversationTitle: 'Phase 1', preview: 'Draft 1', createTime: 10 },
      { ...base, id: 'doc-v2', type: 'document', documentType: 'Spec', title: 'Zero-Tier Routing Spec.md', conversationTitle: 'Phase 2', preview: 'Draft 2', createTime: 20 },
    ];
    expect(findDocumentRevisions(docs[0], docs).map((d) => d.id)).toEqual(['doc-v2']);
  });

  it('classifies and summarizes unresolved assets for triage', () => {
    const assets: AssetArtifact[] = [
      { ...base, id: 'dalle-1', type: 'asset', kind: 'missing', label: 'DALL-E generation', original: 'sediment://file_001.webp', url: '', width: 1024, height: 1024 },
      { ...base, id: 'upload-1', type: 'asset', kind: 'missing', label: 'diagram.png', original: 'file-service://file-abc', url: '' },
      { ...base, id: 'local-1', type: 'asset', kind: 'local', label: 'found.png', original: 'file-service://file-xyz', url: 'local-file://archive/assets/found.png' },
    ];

    expect(classifyUnresolvedAssetCause(assets[0])).toBe('dalle_webp');
    expect(classifyUnresolvedAssetCause(assets[1])).toBe('upload_omitted');

    const summary = summarizeUnresolvedAssets(assets, { 'dalle-1': 'unrecoverable' });
    expect(summary).toEqual({
      dalleWebp: 1,
      uploadOmitted: 1,
      externalUrl: 0,
      unreviewedMissing: 1,
      acknowledgedMissing: 1,
    });
  });

  it('builds chronological timeline events, surfaces related items with reasons, and formats external file statuses', () => {
    expect(
      formatExternalFileBadge({
        path: 'D:/DRS/config.toml',
        exists: true,
        isDir: false,
        sizeBytes: 2048,
        extension: 'toml',
        drivePresent: true,
      }),
    ).toEqual({
      label: 'Available · 2.0 KB · .toml',
      available: true,
    });

    expect(
      formatExternalFileBadge({
        path: 'B:/Archive/logo.png',
        exists: false,
        isDir: false,
        extension: 'png',
        drivePresent: false,
      }),
    ).toEqual({
      label: 'Drive unplugged / offline',
      available: false,
    });

    const code1: CodeArtifact = {
      ...base,
      id: 'code-1',
      type: 'code',
      language: 'rust',
      preview: '',
      text: 'pub fn sync_archive() {\n  println!("v1");\n}',
      createTime: 100,
    };
    const code2: CodeArtifact = {
      ...base,
      id: 'code-2',
      conversationId: 'c2',
      conversationTitle: 'Archive v2',
      type: 'code',
      language: 'rust',
      preview: '',
      text: 'pub fn sync_archive() {\n  println!("v2");\n}',
      createTime: 200,
    };

    const mockIndex = {
      generatedAt: '',
      sourcePath: '',
      totals: { conversations: 2, visibleMessages: 10, hiddenMessages: 0, codeBlocks: 2, copiedAssets: 0, missingAssets: 0, externalAssets: 0 },
      conversations: [
        { id: 'c1', title: 'Archive', slug: 'archive', createTime: 90, updateTime: 100, archived: false, starred: false, messageCount: 5, hiddenMessageCount: 0, codeBlockCount: 1, assetCount: 0, externalAssetCount: 0, snippet: '', searchText: '' },
        { id: 'c2', title: 'Archive v2', slug: 'archive-v2', createTime: 190, updateTime: 200, archived: false, starred: false, messageCount: 5, hiddenMessageCount: 0, codeBlockCount: 1, assetCount: 0, externalAssetCount: 0, snippet: '', searchText: '' },
      ],
    };
    const mockArtifacts = {
      generatedAt: '',
      sourcePath: '',
      totals: { code: 2, assets: 0, documents: 0, links: 0 },
      languageCounts: { rust: 2 },
      code: [code1, code2],
      assets: [],
      documents: [],
      links: [],
    };

    const collectionItems = [
      {
        collectionId: 1,
        targetType: 'code' as const,
        targetId: 'code-1',
        conversationId: 'c1',
        title: 'sync_archive (rust)',
        createdAt: 1000,
      },
    ];

    const timeline = buildCollectionTimeline(collectionItems, mockIndex, mockArtifacts);
    expect(timeline.map((e) => e.eventKind)).toEqual(['revision_detected', 'artifact_created']);

    const state = {
      tags: [{ id: 1, name: 'sync' }],
      collections: [{ id: 1, name: 'Core', createdAt: 1 }],
      tagLinks: [],
      collectionItems,
      notes: [],
      favorites: [],
      dismissedRelations: [],
    };

    const related = findRelatedArchiveItems(collectionItems, 'coll:1', state, mockIndex, mockArtifacts);
    expect(related).toHaveLength(1);
    expect(related[0].target.targetId).toBe('code-2');
    expect(related[0].reasons[0]).toContain('Candidate revision of "sync_archive (rust)"');

    const dismissedState = {
      ...state,
      dismissedRelations: [related[0].relationKey],
    };
    expect(findRelatedArchiveItems(collectionItems, 'coll:1', dismissedState, mockIndex, mockArtifacts)).toHaveLength(0);
  });
});
