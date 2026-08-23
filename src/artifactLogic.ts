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

function cleanPathTail(value: string) {
  const withoutQuery = value.split(/[?#]/)[0];
  const tail = withoutQuery.split(/[\\/]/).filter(Boolean).pop() || withoutQuery;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

function sourceTail(item: AssetArtifact) {
  const source = item.url || item.original || item.label || item.id;
  return cleanPathTail(source.replace(/^local-file:\/\//, '').replace(/^file-service:\/\//, ''));
}

function isGenericAssetLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return !normalized
    || normalized === 'asset'
    || normalized === 'attached file'
    || normalized === 'external image'
    || normalized.includes('asset pointer')
    || normalized.includes('asset_pointer')
    || normalized.includes('image pointer')
    || normalized.includes('image_asset_pointer')
    || normalized.includes('preview_asset_pointer');
}

export function assetDisplayName(item: AssetArtifact) {
  const tail = sourceTail(item);
  if (!isGenericAssetLabel(item.label)) return item.label;
  if (tail) return tail;
  return item.kind === 'missing' ? 'Missing asset' : 'Image asset';
}

export function assetFileExtension(item: AssetArtifact) {
  const candidates = [sourceTail(item), item.label, item.original, item.url];
  for (const candidate of candidates) {
    const match = cleanPathTail(candidate).match(/\.([a-z0-9]{2,8})$/i);
    if (match) return match[1].toLowerCase();
  }
  return 'no extension';
}

export function assetSearchText(item: AssetArtifact) {
  return [
    assetDisplayName(item),
    item.label,
    item.original,
    item.url,
    item.id,
    item.kind,
    assetFileExtension(item),
    item.conversationTitle,
    item.role,
    item.width && item.height ? `${item.width}x${item.height}` : '',
  ].join('\n');
}

export function countAssetExtensions(artifacts: AssetArtifact[]) {
  const counts = new Map<string, number>();
  for (const item of artifacts) {
    const extension = assetFileExtension(item);
    counts.set(extension, (counts.get(extension) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterAssetArtifacts(artifacts: AssetArtifact[], kind = 'all', extension = 'all', query = '') {
  const needle = query.trim().toLowerCase();
  return artifacts
    .filter((item) => kind === 'all' || item.kind === kind)
    .filter((item) => extension === 'all' || assetFileExtension(item) === extension)
    .filter((item) => !needle || assetSearchText(item).toLowerCase().includes(needle))
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
}

export function visibleExplorerRows<T>(items: T[]) {
  return items.slice(0, EXPLORER_RESULT_LIMIT);
}

export function selectedExplorerArtifact<T extends { id: string }>(items: T[], selectedId: string) {
  return items.find((item) => item.id === selectedId) || items[0] || null;
}
