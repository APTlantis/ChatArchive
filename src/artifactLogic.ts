import type {
  AssetArtifact,
  CodeArtifact,
  CodeArtifactCategory,
  DocumentArtifact,
  DocumentAvailabilityFilter,
  LinkArtifact,
  LinkArtifactCategory,
} from './types';

export const EXPLORER_RESULT_LIMIT = 500;

export function sanitizeCodeLanguageToken(raw: string) {
  const token = (raw || '').trim().split(/\s+/)[0] || '';
  if (/^[a-z0-9][a-z0-9_+#.-]{0,23}$/i.test(token)) {
    return token.toLowerCase();
  }
  return 'text';
}

export function normalizeCodeLanguage(item: CodeArtifact) {
  return sanitizeCodeLanguageToken(item.language || 'text');
}

const DIAGRAM_LANGUAGES = new Set(['mermaid', 'mmd', 'dot', 'graphviz', 'plantuml', 'puml', 'svg']);
const CONFIG_LANGUAGES = new Set([
  'json', 'jsonl', 'toml', 'yaml', 'yml', 'ini', 'xml', 'csv', 'tsv', 'env',
  'dockerfile', 'makefile', 'properties', 'conf', 'cfg',
]);
const SHELL_LANGUAGES = new Set([
  'bash', 'sh', 'zsh', 'shell', 'console', 'powershell', 'ps1', 'pwsh', 'cmd', 'bat', 'batch', 'dos',
]);
const PROSE_LANGUAGES = new Set(['text', 'plaintext', 'txt', 'markdown', 'md', 'rst', 'ascii', 'log']);

export function classifyCodeArtifactKind(item: CodeArtifact): CodeArtifactCategory {
  const lang = normalizeCodeLanguage(item);
  const sample = (item.text || '').trim();
  if (DIAGRAM_LANGUAGES.has(lang) || /^(?:flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|graph\s+(?:TD|LR|TB|BT))\b/m.test(sample)) {
    return 'diagram';
  }
  if (CONFIG_LANGUAGES.has(lang)) {
    return 'config';
  }
  if (SHELL_LANGUAGES.has(lang)) {
    return 'shell';
  }
  if (PROSE_LANGUAGES.has(lang)) {
    if (/^(?:\$\s+|PS\s+[^>]*>\s*|#\s*(?:apt|dnf|cargo|npm|pnpm|git|docker|kubectl|systemctl|curl|sudo)\b|(?:cargo|npm|pnpm|git|docker|python|pytest|pwsh|powershell)\s+[a-z0-9_-]+)/im.test(sample)) {
      return 'shell';
    }
    if ((sample.startsWith('{') && sample.endsWith('}')) || (sample.startsWith('[') && sample.endsWith(']'))) {
      return 'config';
    }
    if (/^(?:fn\s+\w+|pub\s+(?:fn|struct|enum)|def\s+\w+|async\s+def\s+\w+|export\s+(?:function|const|interface|type|class)|import\s+.+\s+from\s+|#include\s+<|SELECT\s+.+\s+FROM\s+)/im.test(sample)) {
      return 'code';
    }
    return 'prose';
  }
  return 'code';
}

export function countCodeCategories(artifacts: CodeArtifact[]) {
  const counts = new Map<CodeArtifactCategory, number>();
  for (const item of artifacts) {
    const kind = classifyCodeArtifactKind(item);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const order: CodeArtifactCategory[] = ['code', 'shell', 'config', 'diagram', 'prose'];
  return order
    .map((name) => ({ name, count: counts.get(name) || 0 }))
    .filter((entry) => entry.count > 0);
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

export function deriveCodeArtifactTitle(item: CodeArtifact) {
  const lang = normalizeCodeLanguage(item);
  const lines = (item.text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 6)) {
    const fileComment = line.match(
      /^(?:\/\/|#|\/\*+|\*|--|<!--)\s*([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,8})\b/,
    );
    if (fileComment?.[1]) {
      return fileComment[1].replace(/\\/g, '/');
    }

    const namedField = line.match(
      /^(?:["']?(?:name|canonical_name|title|package|id|service)["']?\s*[:=]\s*["']([^"'\r\n]{2,64})["'])/i,
    );
    if (namedField?.[1]) {
      return `${namedField[1]} (${lang})`;
    }

    const tomlSection = line.match(/^\[([A-Za-z0-9_.-]{2,48})\]$/);
    if (tomlSection?.[1] && lines.length > 1) {
      const secondNamed = lines
        .slice(1, 6)
        .map((candidate) =>
          candidate.match(/^(?:name|canonical_name|title|id)\s*=\s*["']([^"'\r\n]{2,64})["']/i),
        )
        .find(Boolean);
      if (secondNamed?.[1]) {
        return `${secondNamed[1]} · [${tomlSection[1]}]`;
      }
    }

    const declaration = line.match(
      /^(?:export\s+)?(?:default\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|function|def|class|struct|enum|interface|type|trait|mod|impl)\s+([A-Za-z_][A-Za-z0-9_:<>.]{1,56})/,
    );
    if (declaration?.[1]) {
      return `${declaration[1]} (${lang})`;
    }

    const constDecl = line.match(
      /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]{2,48})\s*=/,
    );
    if (constDecl?.[1]) {
      return `${constDecl[1]} (${lang})`;
    }

    const sqlStmt = line.match(
      /^(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|INDEX|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+|SELECT\s+.+\s+FROM\s+)([A-Za-z0-9_`".-]{2,48})/i,
    );
    if (sqlStmt?.[1]) {
      return `SQL · ${sqlStmt[1].replace(/[`"]/g, '')}`;
    }

    const markdownHeading = line.match(/^#{1,4}\s+(.{2,68})$/);
    if (markdownHeading?.[1]) {
      return markdownHeading[1].trim();
    }
  }

  const firstMeaningful = lines.find(
    (line) =>
      !/^(?:\/\/|#|\/\*|\*|--|<!--|\{|\[|\}|\]|---|\$|>)$/.test(line)
      && !/^#!\s*\//.test(line),
  );
  if (firstMeaningful) {
    const cleaned = firstMeaningful
      .replace(/^(?:\$\s+|PS\s+[^>]*>\s*)/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 3) {
      return cleaned.length > 64 ? `${cleaned.slice(0, 61)}...` : cleaned;
    }
  }

  return `${lang} snippet · ${item.conversationTitle || 'Untitled'}`;
}

export function filterCodeArtifacts(
  artifacts: CodeArtifact[],
  language = 'all',
  query = '',
  category: CodeArtifactCategory | 'all' = 'all',
) {
  const needle = query.trim().toLowerCase();
  return artifacts
    .filter((item) => category === 'all' || classifyCodeArtifactKind(item) === category)
    .filter((item) => language === 'all' || normalizeCodeLanguage(item) === language)
    .filter((item) => {
      if (!needle) return true;
      const derivedTitle = deriveCodeArtifactTitle(item);
      return `${derivedTitle}\n${item.text}\n${item.language}\n${item.conversationTitle}\n${item.role}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
}

export function isRecoveredDocumentArtifact(item: DocumentArtifact) {
  return Boolean(item.url && item.url.trim().length > 0);
}

export function countDocumentAvailability(artifacts: DocumentArtifact[]) {
  let recovered = 0;
  let pointer = 0;
  for (const item of artifacts) {
    if (isRecoveredDocumentArtifact(item)) {
      recovered += 1;
    } else {
      pointer += 1;
    }
  }
  return {
    all: artifacts.length,
    recovered,
    pointer,
  };
}

const GENERIC_DOCUMENT_TITLES = new Set([
  'readme',
  'readme.md',
  'document',
  'specification',
  'roadmap.md',
  'plan.md',
  'notes.txt',
  'changelog.md',
  'index.html',
  'index.md',
  'config.json',
  'package.json',
  'cargo.toml',
  'pyproject.toml',
  'summary.md',
  'todo.md',
  'license',
]);

export function deriveDocumentDisplayTitle(item: DocumentArtifact) {
  const rawTitle = (item.title || '').trim() || 'Document';
  const normalized = rawTitle.toLowerCase();
  const convTitle = (item.conversationTitle || '').trim();
  if (
    convTitle
    && convTitle.toLowerCase() !== normalized
    && (GENERIC_DOCUMENT_TITLES.has(normalized) || rawTitle.length <= 12)
  ) {
    return `${rawTitle} — ${convTitle}`;
  }
  return rawTitle;
}

export function countDocumentTypes(
  artifacts: DocumentArtifact[],
  availability: DocumentAvailabilityFilter = 'all',
) {
  const counts = new Map<string, number>();
  for (const item of artifacts) {
    if (availability === 'recovered' && !isRecoveredDocumentArtifact(item)) continue;
    if (availability === 'pointer' && isRecoveredDocumentArtifact(item)) continue;
    counts.set(item.documentType, (counts.get(item.documentType) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterDocumentArtifacts(
  artifacts: DocumentArtifact[],
  documentType = 'all',
  query = '',
  availability: DocumentAvailabilityFilter = 'all',
) {
  const needle = query.trim().toLowerCase();
  return artifacts
    .filter((item) => {
      if (availability === 'recovered') return isRecoveredDocumentArtifact(item);
      if (availability === 'pointer') return !isRecoveredDocumentArtifact(item);
      return true;
    })
    .filter((item) => documentType === 'all' || item.documentType === documentType)
    .filter((item) => {
      if (!needle) return true;
      const displayTitle = deriveDocumentDisplayTitle(item);
      return `${displayTitle}\n${item.title}\n${item.documentType}\n${item.preview}\n${item.conversationTitle}\n${item.role}`
        .toLowerCase()
        .includes(needle);
    })
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

export function sanitizeLinkUrl(raw: string) {
  return (raw || '')
    .trim()
    .replace(/^[`*'"]+/, '')
    .replace(/[.,;:!?`*'")\]}]+$/, '');
}

export function normalizeLinkDomain(item: LinkArtifact) {
  const cleanedDomain = (item.domain || '')
    .trim()
    .replace(/^www\./i, '')
    .replace(/^[`*'"]+/, '')
    .replace(/[.,;:!?`*'")\]}]+$/, '')
    .toLowerCase();
  if (cleanedDomain && !cleanedDomain.includes('/') && !cleanedDomain.includes(' ')) {
    return cleanedDomain;
  }
  const cleanUrl = sanitizeLinkUrl(item.url);
  try {
    const parsed = new URL(cleanUrl);
    return parsed.hostname
      .replace(/^www\./i, '')
      .replace(/^[`*'"]+/, '')
      .replace(/[.,;:!?`*'")\]}]+$/, '')
      .toLowerCase() || 'unknown';
  } catch {
    const match = cleanUrl.match(/^https?:\/\/([^/:?#`*'"]+)/i);
    if (match?.[1]) {
      return match[1].replace(/^www\./i, '').toLowerCase();
    }
    return 'unknown';
  }
}

export function linkDisplayLabel(item: LinkArtifact) {
  const cleanUrl = sanitizeLinkUrl(item.url);
  const cleanLabel = (item.label || '')
    .trim()
    .replace(/^[`*'"]+/, '')
    .replace(/[.,;:!?`*'")\]}]+$/, '');
  if (cleanLabel && cleanLabel !== cleanUrl && cleanLabel !== item.url) {
    return cleanLabel;
  }
  try {
    const parsed = new URL(cleanUrl);
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    return `${host}${path}`;
  } catch {
    return cleanUrl || cleanLabel || 'External link';
  }
}

const REPO_DOMAINS = new Set([
  'github.com',
  'gist.github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'huggingface.co',
  'crates.io',
  'docs.rs',
  'pypi.org',
  'npmjs.com',
  'www.npmjs.com',
  'pkg.go.dev',
  'hub.docker.com',
  'jsr.io',
]);

const DOCS_DOMAINS = new Set([
  'rust-lang.org',
  'doc.rust-lang.org',
  'learn.microsoft.com',
  'developer.mozilla.org',
  'go.dev',
  'electronjs.org',
  'platform.openai.com',
  'en.wikipedia.org',
  'archive.org',
  'web.archive.org',
  'ubuntu.com',
  'wiki.archlinux.org',
  'kubernetes.io',
  'tauri.app',
  'v2.tauri.app',
  'react.dev',
  'vite.dev',
  'vitejs.dev',
  'typescriptlang.org',
  'nodejs.org',
  'python.org',
  'docs.python.org',
]);

const LOCAL_OR_TEMPLATE_DOMAINS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'example.com',
  'example.org',
  'example.net',
  'your-server-ip',
  'your-ec2-ip',
  'your-domain.com',
  'yourdomain.com',
  'img.shields.io',
  'unknown',
]);

export function classifyLinkArtifactKind(item: LinkArtifact): LinkArtifactCategory {
  const domain = normalizeLinkDomain(item);
  if (
    LOCAL_OR_TEMPLATE_DOMAINS.has(domain)
    || /^192\.168\./.test(domain)
    || /^10\./.test(domain)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(domain)
    || domain.includes('your-')
    || domain.endsWith('.local')
    || domain.endsWith('.internal')
  ) {
    return 'local';
  }
  if (REPO_DOMAINS.has(domain) || domain.endsWith('.github.io')) {
    return 'repo';
  }
  if (
    DOCS_DOMAINS.has(domain)
    || domain.startsWith('docs.')
    || domain.startsWith('doc.')
    || domain.startsWith('wiki.')
    || domain.startsWith('developer.')
    || domain.startsWith('learn.')
    || domain.endsWith('.readthedocs.io')
  ) {
    return 'docs';
  }
  return 'web';
}

export function countLinkCategories(artifacts: LinkArtifact[]) {
  const counts = new Map<LinkArtifactCategory, number>();
  for (const item of artifacts) {
    const kind = classifyLinkArtifactKind(item);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const order: LinkArtifactCategory[] = ['web', 'repo', 'docs', 'local'];
  return order
    .map((name) => ({ name, count: counts.get(name) || 0 }))
    .filter((entry) => entry.count > 0);
}

export function countLinkDomains(artifacts: LinkArtifact[], category: LinkArtifactCategory | 'all' = 'all') {
  const counts = new Map<string, number>();
  for (const item of artifacts) {
    if (category !== 'all' && classifyLinkArtifactKind(item) !== category) continue;
    const domain = normalizeLinkDomain(item);
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterLinkArtifacts(
  artifacts: LinkArtifact[],
  domain = 'all',
  query = '',
  category: LinkArtifactCategory | 'all' = 'all',
) {
  const needle = query.trim().toLowerCase();
  return artifacts
    .filter((item) => category === 'all' || classifyLinkArtifactKind(item) === category)
    .filter((item) => domain === 'all' || normalizeLinkDomain(item) === domain)
    .filter((item) => {
      if (!needle) return true;
      const cleanUrl = sanitizeLinkUrl(item.url);
      const cleanDomain = normalizeLinkDomain(item);
      const display = linkDisplayLabel(item);
      return `${display}\n${cleanUrl}\n${cleanDomain}\n${item.label}\n${item.conversationTitle}\n${item.role}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
}

export function visibleExplorerRows<T>(items: T[]) {
  return items.slice(0, EXPLORER_RESULT_LIMIT);
}

export function selectedExplorerArtifact<T extends { id: string }>(items: T[], selectedId: string) {
  return items.find((item) => item.id === selectedId) || items[0] || null;
}

export function normalizeSnippetFingerprint(text: string) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function findCodeRevisionsAndDuplicates(target: CodeArtifact, all: CodeArtifact[]) {
  const targetFingerprint = normalizeSnippetFingerprint(target.text);
  const targetTitle = deriveCodeArtifactTitle(target);
  const targetLang = normalizeCodeLanguage(target);
  const isGenericFallback = targetTitle.startsWith(`${targetLang} snippet · `);

  const exactDuplicates: CodeArtifact[] = [];
  const revisions: CodeArtifact[] = [];
  const seenRevisionFingerprints = new Set<string>([targetFingerprint]);

  const sorted = [...all].sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  for (const candidate of sorted) {
    if (candidate.id === target.id) continue;
    const fp = normalizeSnippetFingerprint(candidate.text);
    if (fp && fp === targetFingerprint) {
      exactDuplicates.push(candidate);
      continue;
    }
    if (isGenericFallback) continue;
    if (normalizeCodeLanguage(candidate) !== targetLang) continue;
    const candidateTitle = deriveCodeArtifactTitle(candidate);
    if (candidateTitle === targetTitle && !seenRevisionFingerprints.has(fp)) {
      seenRevisionFingerprints.add(fp);
      revisions.push(candidate);
    }
  }

  return {
    exactDuplicates: exactDuplicates.slice(0, 10),
    revisions: revisions.slice(0, 12),
  };
}

export function findDocumentRevisions(target: DocumentArtifact, all: DocumentArtifact[]) {
  const rawTitle = (target.title || '').trim().toLowerCase();
  if (!rawTitle || rawTitle === 'document') return [];
  const isGeneric = GENERIC_DOCUMENT_TITLES.has(rawTitle);

  return all
    .filter((candidate) => {
      if (candidate.id === target.id) return false;
      if ((candidate.title || '').trim().toLowerCase() !== rawTitle) return false;
      if (isGeneric) {
        return candidate.conversationId === target.conversationId;
      }
      return true;
    })
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
    .slice(0, 12);
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export function computeLineDiff(oldText: string, newText: string) {
  const oldLines = (oldText || '').replace(/\r\n/g, '\n').split('\n').slice(0, 260);
  const newLines = (newText || '').replace(/\r\n/g, '\n').split('\n').slice(0, 260);
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      lines.push({ type: 'same', text: oldLines[i], oldLine: i + 1, newLine: j + 1 });
      unchanged += 1;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'remove', text: oldLines[i], oldLine: i + 1 });
      removed += 1;
      i += 1;
    } else {
      lines.push({ type: 'add', text: newLines[j], newLine: j + 1 });
      added += 1;
      j += 1;
    }
  }
  while (i < m) {
    lines.push({ type: 'remove', text: oldLines[i], oldLine: i + 1 });
    removed += 1;
    i += 1;
  }
  while (j < n) {
    lines.push({ type: 'add', text: newLines[j], newLine: j + 1 });
    added += 1;
    j += 1;
  }

  return { lines, added, removed, unchanged };
}

export type UnresolvedAssetCause = 'dalle_webp' | 'upload_omitted' | 'external_url' | 'local_resolved';

export function classifyUnresolvedAssetCause(item: AssetArtifact): UnresolvedAssetCause {
  if (item.kind === 'local') return 'local_resolved';
  if (item.kind === 'external') return 'external_url';
  const haystack = `${item.label}\n${item.original}\n${item.url}`.toLowerCase();
  if (haystack.includes('.webp') || haystack.includes('dalle')) {
    return 'dalle_webp';
  }
  return 'upload_omitted';
}

export function summarizeUnresolvedAssets(
  artifacts: AssetArtifact[],
  triage?: Record<string, string>,
) {
  let dalleWebp = 0;
  let uploadOmitted = 0;
  let externalUrl = 0;
  let unreviewedMissing = 0;
  let acknowledgedMissing = 0;

  for (const item of artifacts) {
    const cause = classifyUnresolvedAssetCause(item);
    if (cause === 'dalle_webp') dalleWebp += 1;
    else if (cause === 'upload_omitted') uploadOmitted += 1;
    else if (cause === 'external_url') externalUrl += 1;

    if (item.kind === 'missing') {
      const status = triage?.[item.id] || 'unreviewed';
      if (status === 'unreviewed') unreviewedMissing += 1;
      else acknowledgedMissing += 1;
    }
  }

  return {
    dalleWebp,
    uploadOmitted,
    externalUrl,
    unreviewedMissing,
    acknowledgedMissing,
  };
}
