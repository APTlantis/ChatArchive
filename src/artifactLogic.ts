import type { AssetArtifact, CodeArtifact, DocumentArtifact } from './types';

export const EXPLORER_RESULT_LIMIT = 500;

export function normalizeCodeLanguage(item: CodeArtifact) {
  return (item.language || 'text').trim().toLowerCase() || 'text';
}

export function countCodeLanguages(artifacts: CodeArtifact[]) {
  const counts = new Map<string, number>();
  for (const item of artifacts) {
    const language = normalizeCodeLanguage(item);
    counts.set(language, (counts.get(language) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterCodeArtifacts(artifacts: CodeArtifact[], language = 'all', query = '') {
  const needle = query.trim().toLowerCase();
  return artifacts
    .filter((item) => language === 'all' || normalizeCodeLanguage(item) === language)
    .filter((item) => !needle || `${item.text}\n${item.language}\n${item.conversationTitle}\n${item.role}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
}

export function countDocumentTypes(artifacts: DocumentArtifact[]) {
  const counts = new Map<string, number>();
  for (const item of artifacts) counts.set(item.documentType, (counts.get(item.documentType) || 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterDocumentArtifacts(artifacts: DocumentArtifact[], documentType = 'all', query = '') {
  const needle = query.trim().toLowerCase();
  return artifacts
    .filter((item) => documentType === 'all' || item.documentType === documentType)
    .filter((item) => !needle || `${item.title}\n${item.documentType}\n${item.preview}\n${item.conversationTitle}\n${item.role}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
}

export function countAssetKinds(artifacts: AssetArtifact[]) {
  const counts = { local: 0, external: 0, missing: 0 };
  for (const item of artifacts) counts[item.kind] += 1;
  return counts;
}

export function filterAssetArtifacts(artifacts: AssetArtifact[], kind = 'all', query = '') {
  const needle = query.trim().toLowerCase();
  return artifacts
    .filter((item) => kind === 'all' || item.kind === kind)
    .filter((item) => !needle || `${item.label}\n${item.original}\n${item.url}\n${item.conversationTitle}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
}

export function visibleExplorerRows<T>(items: T[]) {
  return items.slice(0, EXPLORER_RESULT_LIMIT);
}

export function selectedExplorerArtifact<T extends { id: string }>(items: T[], selectedId: string) {
  return items.find((item) => item.id === selectedId) || items[0] || null;
}
