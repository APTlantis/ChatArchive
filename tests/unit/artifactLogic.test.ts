import { describe, expect, it } from 'vitest';
import {
  countAssetKinds,
  countCodeLanguages,
  countDocumentTypes,
  filterAssetArtifacts,
  filterCodeArtifacts,
  filterDocumentArtifacts,
  selectedExplorerArtifact,
  visibleExplorerRows,
} from '../../src/artifactLogic';
import type { AssetArtifact, CodeArtifact, DocumentArtifact } from '../../src/types';

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
      { ...base, id: 'local', type: 'asset', kind: 'local', label: 'Screenshot', original: 'file-service://one', url: 'local-file://one' },
      { ...base, id: 'external', type: 'asset', kind: 'external', label: 'Reference', original: 'https://example.test/a.png', url: 'https://example.test/a.png' },
      { ...base, id: 'missing', type: 'asset', kind: 'missing', label: 'Lost', original: 'file-service://lost', url: '' },
    ];
    expect(countAssetKinds(assets)).toEqual({ local: 1, external: 1, missing: 1 });
    expect(filterAssetArtifacts(assets, 'missing', 'lost').map((item) => item.id)).toEqual(['missing']);
    expect(filterAssetArtifacts(assets, 'all', 'example.test').map((item) => item.id)).toEqual(['external']);
  });

  it('bounds lists at 500 and repairs selection after filtering', () => {
    const rows = Array.from({ length: 650 }, (_, id) => ({ id: String(id) }));
    expect(visibleExplorerRows(rows)).toHaveLength(500);
    expect(selectedExplorerArtifact(rows, '42')?.id).toBe('42');
    expect(selectedExplorerArtifact(rows, 'missing')?.id).toBe('0');
    expect(selectedExplorerArtifact([], 'missing')).toBeNull();
  });
});
