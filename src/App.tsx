import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import zenuml from '@mermaid-js/mermaid-zenuml';
import '../prism/prism.js';
import '../prism/prism.css';
import chatArchiveLogo from './assets/chat_archive_logo_128.png';
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Bookmark,
  Braces,
  CalendarDays,
  Check,
  Clipboard,
  Code2,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileArchive,
  FileText,
  FileImage,
  Globe,
  Home,
  Image as ImageIcon,
  Images,
  Link2,
  ListFilter,
  FolderKanban,
  NotebookPen,
  PanelLeft,
  Pin,
  Regex,
  RotateCcw,
  Search,
  Star,
  Tags,
  Type,
  X,
} from 'lucide-react';
import DualListRelationMatrix, {
  TYPOGRAPHY_OPTIONS,
  type TypographyOption,
} from './DualListRelationMatrix';
import type {
  ArchiveAsset,
  AssetArtifact,
  AssetTriageStatus,
  ArtifactIndex,
  ArchiveIndex,
  ArchiveMessage,
  CodeArtifact,
  CodeArtifactCategory,
  DocumentArtifact,
  DocumentAvailabilityFilter,
  LinkArtifact,
  LinkArtifactCategory,
  ConversationFile,
  ConversationSummary,
  MessageBlock,
  MessageBookmark,
  SavedSearch,
  SearchFieldScope,
  SearchFilters,
  ViewerState,
  KnowledgeState,
  KnowledgeTarget,
  ProjectState,
  ProjectCandidate,
} from './types';
import {
  exportConversationMarkdown as exportConversationMarkdownDesktop,
  getLibraryStatus,
  importOpenAiExport,
  importOpenAiExportFolder,
  isTauriRuntime,
  loadArchiveIndex,
  loadArtifactIndex,
  loadCodeArtifacts,
  loadDocumentArtifacts,
  loadAssetArtifacts,
  loadLinkArtifacts,
  loadDocumentArtifactContent,
  loadConversation,
  markRead,
  resolveArchiveAssetUrl,
  exportCodeSnippet as exportCodeSnippetDesktop,
  exportDocumentMarkdown as exportDocumentMarkdownDesktop,
  exportRecoveryBundle,
  saveMessageBookmark,
  saveScrollPosition,
  saveViewerState,
  saveKnowledgeState,
  selectLibraryFolder,
  restorePreviousImport,
  scanProjects,
  confirmProjectCandidate,
  dismissProjectCandidate,
  addProjectConversation,
  removeProjectConversation,
  toggleFavorite,
  togglePin,
  type LibraryStatus,
} from './archiveApi';
import {
  assetDisplayName,
  assetFileExtension,
  classifyCodeArtifactKind,
  classifyLinkArtifactKind,
  classifyUnresolvedAssetCause,
  computeLineDiff,
  countAssetExtensions,
  countAssetKinds,
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
  isRecoveredDocumentArtifact,
  linkDisplayLabel,
  normalizeCodeLanguage,
  normalizeLinkDomain,
  sanitizeCodeLanguageToken,
  sanitizeLinkUrl,
  selectedExplorerArtifact,
  summarizeUnresolvedAssets,
  visibleExplorerRows,
} from './artifactLogic';

const VIEWER_STATE_KEY = 'chatArchive.viewerState.v1';
const KNOWLEDGE_STATE_KEY = 'chatArchive.knowledgeState.v1';
const FIELD_SCOPES: SearchFieldScope[] = ['all', 'title', 'content', 'code', 'raw', 'assets', 'documents', 'links'];
const Prism = globalThis.Prism;
let mermaidReady: Promise<void> | null = null;
const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  fieldScope: 'all',
  regex: false,
  startDate: '',
  endDate: '',
  minMessages: '',
  maxMessages: '',
};
type AppView = 'dashboard' | 'conversation' | 'code' | 'documents' | 'assets' | 'links' | 'knowledge' | 'projects' | 'library';

const DEFAULT_TAGS = ['WSL', 'Rust', 'Security', 'Docker', 'AI'];

function createEmptyKnowledgeState(): KnowledgeState {
  return {
    tags: DEFAULT_TAGS.map((name, index) => ({ id: index + 1, name, color: null })),
    collections: [],
    tagLinks: [],
    collectionItems: [],
    notes: [],
    favorites: [],
    customTitles: {},
    savedSearches: [],
    assetTriage: {},
  };
}

function readKnowledgeState(): KnowledgeState {
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_STATE_KEY);
    if (!raw) return createEmptyKnowledgeState();
    const parsed = JSON.parse(raw) as Partial<KnowledgeState>;
    return {
      tags: parsed.tags?.length ? parsed.tags : createEmptyKnowledgeState().tags,
      collections: parsed.collections || [],
      tagLinks: parsed.tagLinks || [],
      collectionItems: parsed.collectionItems || [],
      notes: parsed.notes || [],
      favorites: parsed.favorites || [],
      customTitles: parsed.customTitles || {},
      savedSearches: parsed.savedSearches || [],
      assetTriage: parsed.assetTriage || {},
    };
  } catch {
    return createEmptyKnowledgeState();
  }
}

function targetKey(target: KnowledgeTarget) {
  return `${target.targetType}:${target.targetId}`;
}

function resolveTargetTitle(
  customTitles: Record<string, string> | undefined,
  targetType: KnowledgeTarget['targetType'],
  targetId: string,
  fallbackTitle: string,
) {
  const custom = customTitles?.[`${targetType}:${targetId}`]?.trim();
  return custom || fallbackTitle;
}

function createEmptyViewerState(): ViewerState {
  return {
    version: 1,
    favorites: {},
    pinned: {},
    read: {},
    recentlyViewed: [],
    messageBookmarks: {},
    scrollPositions: {},
  };
}

function readViewerState(): ViewerState {
  try {
    const raw = window.localStorage.getItem(VIEWER_STATE_KEY);
    if (!raw) return createEmptyViewerState();
    const parsed = JSON.parse(raw) as Partial<ViewerState>;
    if (parsed.version !== 1) return createEmptyViewerState();
    return {
      version: 1,
      favorites: parsed.favorites || {},
      pinned: parsed.pinned || {},
      read: parsed.read || {},
      recentlyViewed: Array.isArray(parsed.recentlyViewed) ? parsed.recentlyViewed : [],
      messageBookmarks: parsed.messageBookmarks || {},
      scrollPositions: parsed.scrollPositions || {},
    };
  } catch {
    return createEmptyViewerState();
  }
}

function pruneViewerState(state: ViewerState, conversations: ConversationSummary[]): ViewerState {
  const valid = new Set(conversations.map((conversation) => conversation.id));
  const keepRecord = <T,>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => valid.has(id))) as Record<string, T>;

  return {
    version: 1,
    favorites: keepRecord(state.favorites),
    pinned: keepRecord(state.pinned),
    read: keepRecord(state.read),
    recentlyViewed: state.recentlyViewed.filter((item) => valid.has(item.conversationId)).slice(0, 12),
    messageBookmarks: keepRecord(state.messageBookmarks),
    scrollPositions: keepRecord(state.scrollPositions),
  };
}

function formatDate(seconds: number | null, options?: Intl.DateTimeFormatOptions) {
  if (!seconds) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, options || { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(seconds * 1000),
  );
}

function formatMonth(seconds: number | null) {
  if (!seconds) return 'Undated';
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(seconds * 1000));
}

function roleLabel(role: string) {
  if (role === 'assistant') return 'Assistant';
  if (role === 'user') return 'You';
  if (role === 'tool') return 'Tool';
  if (role === 'system') return 'System';
  return 'Message';
}

function getConversationTime(conversation: ConversationSummary) {
  return conversation.updateTime || conversation.createTime || 0;
}

function getVisibleMessages(conversation: ConversationFile | null, showHidden: boolean) {
  if (!conversation) return [];
  return showHidden ? conversation.messages : conversation.messages.filter((message) => !message.hidden);
}

function getMessageLabel(message: ArchiveMessage) {
  return message.text.replace(/\s+/g, ' ').trim().slice(0, 96) || `${roleLabel(message.role)} message`;
}

function normalizePrismLanguage(language: string) {
  const normalized = String(language || 'text').trim().toLowerCase();
  const aliases: Record<string, string> = {
    'c#': 'csharp',
    'c++': 'cpp',
    cmd: 'batch',
    console: 'shell-session',
    cs: 'csharp',
    dockerfile: 'docker',
    golang: 'go',
    html: 'markup',
    js: 'javascript',
    md: 'markdown',
    none: 'text',
    plaintext: 'text',
    ps1: 'powershell',
    py: 'python',
    rb: 'ruby',
    shell: 'bash',
    shellscript: 'bash',
    ts: 'typescript',
    yml: 'yaml',
  };
  return aliases[normalized] || normalized || 'text';
}

function highlightCode(code: string, language: string) {
  const prismLanguage = normalizePrismLanguage(language);
  const grammar = Prism.languages[prismLanguage] || Prism.languages.text;
  if (!grammar || prismLanguage === 'text' || prismLanguage === 'unknown') {
    return { html: Prism.util.encode(code), language: 'text' };
  }
  try {
    return { html: Prism.highlight(code, grammar, prismLanguage), language: prismLanguage };
  } catch {
    return { html: Prism.util.encode(code), language: 'text' };
  }
}

function getMermaidReady() {
  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      htmlLabels: false,
      deterministicIds: false,
      logLevel: 'error',
    });
    mermaidReady = mermaid.registerExternalDiagrams([zenuml]);
  }
  return mermaidReady;
}

function isMermaidLanguage(language: string) {
  const normalized = String(language || '').trim().toLowerCase();
  return normalized === 'mermaid' || normalized === 'mmd' || normalized === 'zenuml';
}

function prepareMermaidSource(text: string, language: string) {
  if (String(language || '').trim().toLowerCase() !== 'zenuml') return text;
  return /^\s*zenuml\b/.test(text) ? text : `zenuml\n${text}`;
}

function getConversationById(index: ArchiveIndex, id: string) {
  return index.conversations.find((conversation) => conversation.id === id) || null;
}

function useArchiveIndex() {
  const [index, setIndex] = useState<ArchiveIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isTauriRuntime()) return;
    loadArchiveIndex()
      .then(setIndex)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return { index, error, setIndex, setError };
}

function useArtifactIndex() {
  const [artifacts, setArtifacts] = useState<ArtifactIndex | null>(null);

  useEffect(() => {
    if (isTauriRuntime()) return;
    loadArtifactIndex()
      .then(setArtifacts)
      .catch(() => setArtifacts(null));
  }, []);

  return { artifacts, setArtifacts };
}

interface ArtifactSearchData {
  codeText: Map<string, string>;
  assetText: Map<string, string>;
  documentText: Map<string, string>;
  linkText: Map<string, string>;
  allText: Map<string, string>;
  types: Record<'code' | 'assets' | 'documents' | 'links', Set<string>>;
  languages: Map<string, Set<string>>;
  assetKinds: Map<string, Set<string>>;
}

function appendMapText(map: Map<string, string>, id: string, text: string) {
  map.set(id, `${map.get(id) || ''}\n${text}`);
}

function buildArtifactSearchData(artifacts: ArtifactIndex | null): ArtifactSearchData | null {
  if (!artifacts) return null;
  const data: ArtifactSearchData = {
    codeText: new Map(),
    assetText: new Map(),
    documentText: new Map(),
    linkText: new Map(),
    allText: new Map(),
    types: {
      code: new Set(),
      assets: new Set(),
      documents: new Set(),
      links: new Set(),
    },
    languages: new Map(),
    assetKinds: new Map(),
  };

  for (const item of artifacts.code) {
    data.types.code.add(item.conversationId);
    appendMapText(data.codeText, item.conversationId, item.searchText);
    appendMapText(data.allText, item.conversationId, item.searchText);
    if (!data.languages.has(item.language)) data.languages.set(item.language, new Set());
    data.languages.get(item.language)!.add(item.conversationId);
  }
  for (const item of artifacts.assets) {
    data.types.assets.add(item.conversationId);
    appendMapText(data.assetText, item.conversationId, item.searchText);
    appendMapText(data.allText, item.conversationId, item.searchText);
    if (!data.assetKinds.has(item.kind)) data.assetKinds.set(item.kind, new Set());
    data.assetKinds.get(item.kind)!.add(item.conversationId);
  }
  for (const item of artifacts.documents) {
    data.types.documents.add(item.conversationId);
    appendMapText(data.documentText, item.conversationId, item.searchText);
    appendMapText(data.allText, item.conversationId, item.searchText);
  }
  for (const item of artifacts.links) {
    data.types.links.add(item.conversationId);
    appendMapText(data.linkText, item.conversationId, item.searchText);
    appendMapText(data.allText, item.conversationId, item.searchText);
  }

  return data;
}

function groupConversations(conversations: ConversationSummary[]) {
  const groups = new Map<string, ConversationSummary[]>();
  for (const conversation of conversations) {
    const key = formatMonth(getConversationTime(conversation));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(conversation);
  }
  return [...groups.entries()];
}

function tokenizeQuery(query: string) {
  const tokens: { value: string; phrase: boolean }[] = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    tokens.push({ value: match[1] || match[2], phrase: Boolean(match[1]) });
  }
  return tokens;
}

function buildRegex(query: string) {
  if (!query.trim()) return null;
  try {
    return { regex: new RegExp(query.trim(), 'i'), error: '' };
  } catch (err) {
    return { regex: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function textMatches(text: string, term: string, phrase: boolean) {
  const source = text.toLowerCase();
  const needle = term.toLowerCase();
  if (phrase) return source.includes(needle);
  return needle.split(/\s+/).every((part) => source.includes(part));
}

function getArtifactFieldText(conversationId: string, field: SearchFieldScope, artifacts: ArtifactSearchData | null) {
  if (!artifacts) return '';
  if (field === 'code') return artifacts.codeText.get(conversationId) || '';
  if (field === 'assets') return artifacts.assetText.get(conversationId) || '';
  if (field === 'documents') return artifacts.documentText.get(conversationId) || '';
  if (field === 'links') return artifacts.linkText.get(conversationId) || '';
  return artifacts.allText.get(conversationId) || '';
}

function matchesField(
  conversation: ConversationSummary,
  field: SearchFieldScope,
  term: string,
  phrase: boolean,
  artifacts: ArtifactSearchData | null,
) {
  const title = conversation.title || '';
  const content = conversation.searchText || '';
  const assetText = `${conversation.assetCount} assets ${conversation.externalAssetCount} external`;

  if (field === 'title') return textMatches(title, term, phrase);
  if (field === 'content') return textMatches(content, term, phrase);
  if (field === 'code') return conversation.codeBlockCount > 0 && textMatches(getArtifactFieldText(conversation.id, field, artifacts) || content, term, phrase);
  if (field === 'raw') return conversation.hiddenMessageCount > 0 && textMatches(content, term, phrase);
  if (field === 'assets') return conversation.assetCount > 0 && textMatches(getArtifactFieldText(conversation.id, field, artifacts) || assetText, term, phrase);
  if (field === 'documents') return textMatches(getArtifactFieldText(conversation.id, field, artifacts), term, phrase);
  if (field === 'links') return textMatches(getArtifactFieldText(conversation.id, field, artifacts), term, phrase);
  return textMatches(`${title}\n${content}\n${getArtifactFieldText(conversation.id, 'all', artifacts)}`, term, phrase);
}

function matchesOperator(conversation: ConversationSummary, token: string, artifacts: ArtifactSearchData | null) {
  const [rawKey, ...rest] = token.split(':');
  const key = rawKey.toLowerCase();
  const value = rest.join(':').trim();
  const normalizedValue = value.toLowerCase();
  if (!value) return matchesField(conversation, 'all', token, false, artifacts);

  if (key === 'title') return matchesField(conversation, 'title', value, false, artifacts);
  if (key === 'content') return matchesField(conversation, 'content', value, false, artifacts);
  if (key === 'type') {
    if (normalizedValue === 'code') return artifacts?.types.code.has(conversation.id) ?? conversation.codeBlockCount > 0;
    if (normalizedValue === 'raw') return conversation.hiddenMessageCount > 0;
    if (normalizedValue === 'asset' || normalizedValue === 'assets') return artifacts?.types.assets.has(conversation.id) ?? conversation.assetCount > 0;
    if (normalizedValue === 'document' || normalizedValue === 'documents') return artifacts?.types.documents.has(conversation.id) ?? false;
    if (normalizedValue === 'link' || normalizedValue === 'links') return artifacts?.types.links.has(conversation.id) ?? false;
  }
  if (key === 'language') {
    return artifacts?.languages.get(normalizedValue)?.has(conversation.id) ?? false;
  }
  if (key === 'raw') return normalizedValue === 'true' ? conversation.hiddenMessageCount > 0 : true;
  if (key === 'asset') return normalizedValue === 'true' ? artifacts?.types.assets.has(conversation.id) ?? conversation.assetCount > 0 : true;
  if (key === 'external') return normalizedValue === 'true' ? artifacts?.assetKinds.get('external')?.has(conversation.id) ?? conversation.externalAssetCount > 0 : true;
  if (key === 'missing') {
    return normalizedValue === 'true' ? artifacts?.assetKinds.get('missing')?.has(conversation.id) ?? false : true;
  }
  if (key === 'domain') return textMatches(getArtifactFieldText(conversation.id, 'links', artifacts), value, false);
  if (key === 'doc' || key === 'document') return textMatches(getArtifactFieldText(conversation.id, 'documents', artifacts), value, false);
  if (key === 'link') return textMatches(getArtifactFieldText(conversation.id, 'links', artifacts), value, false);
  return matchesField(conversation, 'all', token, false, artifacts);
}

function filterConversations(
  conversations: ConversationSummary[],
  filters: SearchFilters,
  pinned: Record<string, unknown>,
  artifacts: ArtifactSearchData | null,
) {
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() / 1000 : null;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59`).getTime() / 1000 : null;
  const minMessages = filters.minMessages ? Number(filters.minMessages) : null;
  const maxMessages = filters.maxMessages ? Number(filters.maxMessages) : null;
  const regexResult = filters.regex ? buildRegex(filters.query) : null;
  const tokens = filters.regex ? [] : tokenizeQuery(filters.query.trim());

  const filtered = conversations.filter((conversation) => {
    const time = getConversationTime(conversation);
    if (start && time < start) return false;
    if (end && time > end) return false;
    if (minMessages !== null && Number.isFinite(minMessages) && conversation.messageCount < minMessages) return false;
    if (maxMessages !== null && Number.isFinite(maxMessages) && conversation.messageCount > maxMessages) return false;

    if (regexResult?.error) return true;
    if (regexResult?.regex) {
      return regexResult.regex.test(`${conversation.title}\n${conversation.searchText}\n${getArtifactFieldText(conversation.id, filters.fieldScope, artifacts)}`);
    }

    return tokens.every((token) => {
      if (!token.phrase && token.value.includes(':')) return matchesOperator(conversation, token.value, artifacts);
      return matchesField(conversation, filters.fieldScope, token.value, token.phrase, artifacts);
    });
  });

  return {
    conversations: filtered.slice().sort((a, b) => {
      const pinnedDelta = Number(Boolean(pinned[b.id])) - Number(Boolean(pinned[a.id]));
      return pinnedDelta || getConversationTime(b) - getConversationTime(a);
    }),
    regexError: regexResult?.error || '',
  };
}

function hasActiveSearchFilters(filters: SearchFilters) {
  return Boolean(
    filters.query.trim()
      || filters.fieldScope !== 'all'
      || filters.regex
      || filters.startDate
      || filters.endDate
      || filters.minMessages
      || filters.maxMessages,
  );
}

function extractSnippetAround(haystack: string, needle: string, radius = 36) {
  const lower = haystack.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx === -1) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + needle.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < haystack.length ? '…' : '';
  return `${prefix}${haystack.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function explainConversationMatch(
  conversation: ConversationSummary,
  filters: SearchFilters,
  artifacts: ArtifactSearchData | null,
) {
  const rawQuery = filters.query.trim();
  if (!rawQuery) return '';
  const plainTokens = tokenizeQuery(rawQuery)
    .filter((token) => !token.value.includes(':'))
    .map((token) => token.value.trim())
    .filter(Boolean);
  const needle = plainTokens[0] || rawQuery.split(':').pop()?.trim() || '';
  if (!needle) return '';

  if (conversation.title.toLowerCase().includes(needle.toLowerCase())) {
    return 'Matched in title';
  }
  const codeText = getArtifactFieldText(conversation.id, 'code', artifacts);
  if (codeText && codeText.toLowerCase().includes(needle.toLowerCase())) {
    return `Code: ${extractSnippetAround(codeText, needle, 28)}`;
  }
  const docText = getArtifactFieldText(conversation.id, 'documents', artifacts);
  if (docText && docText.toLowerCase().includes(needle.toLowerCase())) {
    return `Doc: ${extractSnippetAround(docText, needle, 28)}`;
  }
  const linkText = getArtifactFieldText(conversation.id, 'links', artifacts);
  if (linkText && linkText.toLowerCase().includes(needle.toLowerCase())) {
    return `Link: ${extractSnippetAround(linkText, needle, 28)}`;
  }
  if (conversation.searchText && conversation.searchText.toLowerCase().includes(needle.toLowerCase())) {
    return `Message: ${extractSnippetAround(conversation.searchText, needle, 28)}`;
  }
  return '';
}

function filterMessagesForAssetSearch(messages: ArchiveMessage[], filters: SearchFilters) {
  if (filters.fieldScope !== 'assets' || !filters.query.trim() || filters.regex) return messages;
  const terms = tokenizeQuery(filters.query).filter((token) => !token.value.includes(':'));
  if (!terms.length) return messages;
  return messages.filter((message) => {
    const assetText = message.assets.map((asset) => `${asset.label} ${asset.original} ${asset.kind}`).join('\n');
    return terms.every((token) => textMatches(assetText, token.value, token.phrase));
  });
}

function codeArtifactLanguage(item: CodeArtifact) {
  return normalizeCodeLanguage(item);
}

const CODE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  batch: 'bat',
  csharp: 'cs',
  docker: 'dockerfile',
  javascript: 'js',
  json: 'json',
  markdown: 'md',
  powershell: 'ps1',
  python: 'py',
  rust: 'rs',
  shell: 'sh',
  typescript: 'ts',
  yaml: 'yml',
};

function formatApproxSize(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  return `${(bytes / 1024).toFixed(bytes > 10240 ? 0 : 1)} KB`;
}

function slugFilePart(value: string, fallback: string) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 72) || fallback;
}

async function exportCodeSnippet(item: CodeArtifact) {
  const language = codeArtifactLanguage(item);
  const extension = CODE_EXTENSIONS[language] || (language === 'text' || language === 'unknown' ? 'txt' : language.replace(/[^a-z0-9]+/gi, '').slice(0, 8) || 'txt');
  const filename = `${slugFilePart(item.conversationTitle, 'snippet')}-${item.id}.${extension}`;
  const desktopPath = await exportCodeSnippetDesktop(item.text, filename);
  if (desktopPath) return;
  const blob = new Blob([item.text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportDocumentMarkdown(item: DocumentArtifact, markdown: string) {
  const desktopPath = await exportDocumentMarkdownDesktop(item, markdown);
  if (desktopPath) return;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${item.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 72) || 'document'}-${item.id}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function plainInline(text: string) {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        return (
          <a key={index} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        );
      }
      return part;
    });
}

function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const elements: ReactNode[] = [];
  let list: string[] = [];

  function flushList() {
    if (!list.length) return;
    elements.push(
      <ul key={`list-${elements.length}`}>
        {list.map((item, index) => (
          <li key={index}>{plainInline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList();
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 5);
      if (level === 3) elements.push(<h3 key={index}>{plainInline(heading[2])}</h3>);
      else if (level === 4) elements.push(<h4 key={index}>{plainInline(heading[2])}</h4>);
      else elements.push(<h5 key={index}>{plainInline(heading[2])}</h5>);
      return;
    }
    elements.push(<p key={index}>{plainInline(trimmed)}</p>);
  });
  flushList();

  return <div className="markdown-block">{elements}</div>;
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1100);
  }

  return (
    <button className="icon-button copy-button" type="button" onClick={copy} title={label}>
      {copied ? <Check size={16} /> : <Clipboard size={16} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

function CodeBlock({ block }: { block: Extract<MessageBlock, { type: 'code' }> }) {
  if (isMermaidLanguage(block.language)) return <MermaidBlock block={block} />;
  return <PrismCodeBlock block={block} />;
}

function PrismCodeBlock({ block }: { block: Extract<MessageBlock, { type: 'code' }> }) {
  const highlighted = useMemo(() => highlightCode(block.text, block.language), [block.language, block.text]);

  return (
    <section className="code-card">
      <div className="code-header">
        <span>
          <Code2 size={15} />
          {block.language || highlighted.language}
        </span>
        <CopyButton value={block.text} />
      </div>
      <pre className={`language-${highlighted.language}`}>
        <code
          className={`language-${highlighted.language}`}
          dangerouslySetInnerHTML={{ __html: highlighted.html }}
        />
      </pre>
    </section>
  );
}

function MermaidBlock({ block }: { block: Extract<MessageBlock, { type: 'code' }> }) {
  const reactId = useId();
  const diagramId = useMemo(() => `archive-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId]);
  const source = useMemo(() => prepareMermaidSource(block.text, block.language), [block.language, block.text]);
  const fallback = useMemo(() => highlightCode(block.text, 'text'), [block.text]);
  const [rendered, setRendered] = useState<{ svg: string; error: string; loading: boolean }>({
    svg: '',
    error: '',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setRendered({ svg: '', error: '', loading: true });

    getMermaidReady()
      .then(() => mermaid.render(diagramId, source))
      .then((result) => {
        if (!cancelled) setRendered({ svg: result.svg, error: '', loading: false });
      })
      .catch((err) => {
        if (!cancelled) {
          const error = err instanceof Error ? err.message : String(err);
          setRendered({ svg: '', error, loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [diagramId, source]);

  return (
    <section className="code-card mermaid-card">
      <div className="code-header">
        <span>
          <BarChart3 size={15} />
          {block.language || 'mermaid'}
        </span>
        <CopyButton value={block.text} />
      </div>
      {rendered.loading ? <div className="mermaid-status">Rendering diagram...</div> : null}
      {rendered.svg ? (
        <div className="mermaid-output" dangerouslySetInnerHTML={{ __html: rendered.svg }} />
      ) : null}
      {!rendered.loading && rendered.error ? (
        <div className="mermaid-fallback">
          <div className="notice">Diagram could not be rendered. Showing source instead.</div>
          <pre className={`language-${fallback.language}`}>
            <code
              className={`language-${fallback.language}`}
              dangerouslySetInnerHTML={{ __html: fallback.html }}
            />
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function AssetGrid({ assets, onOpen }: { assets: ArchiveAsset[]; onOpen: (asset: ArchiveAsset) => void }) {
  if (!assets.length) return null;
  return (
    <div className="asset-grid">
      {assets.map((asset) => {
        if (asset.kind === 'missing') {
          return (
            <div className="asset missing" key={asset.id}>
              <FileImage size={20} />
              <span>Missing local asset</span>
              <small>{asset.original}</small>
            </div>
          );
        }

        return (
          <button className="asset" key={asset.id} type="button" onClick={() => onOpen(asset)}>
            <img src={resolveArchiveAssetUrl(asset.url)} alt={asset.label} loading="lazy" />
            <span>{asset.kind === 'external' ? 'External image' : asset.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MessageView({
  message,
  bookmarked,
  highlighted,
  onBookmark,
  onCopyAnchor,
  onOpenAsset,
}: {
  message: ArchiveMessage;
  bookmarked: boolean;
  highlighted?: boolean;
  onBookmark: (message: ArchiveMessage) => void;
  onCopyAnchor: (message: ArchiveMessage) => void;
  onOpenAsset: (asset: ArchiveAsset) => void;
}) {
  return (
    <article
      className={`message message-${message.role}${message.hidden ? ' hidden-message' : ''}${highlighted ? ' message-highlighted' : ''}`}
      id={`message-${message.id}`}
    >
      <div className="message-meta">
        <span className="role-dot" />
        <strong>{roleLabel(message.role)}</strong>
        <span>{formatDate(message.createTime, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        {message.hidden ? <span className="raw-pill">Raw</span> : null}
        <span className="content-type">{message.contentType}</span>
      </div>
      <div className="message-body">
        <div className="message-actions">
          <button className={bookmarked ? 'mini-action active' : 'mini-action'} type="button" onClick={() => onBookmark(message)}>
            <Bookmark size={14} />
            {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          <button className="mini-action" type="button" onClick={() => onCopyAnchor(message)}>
            <Clipboard size={14} />
            Copy anchor
          </button>
        </div>
        {message.blocks.map((block, index) => {
          if (block.type === 'code') return <CodeBlock block={block} key={index} />;
          if (block.type === 'execution') {
            return (
              <section className="execution-card" key={index}>
                <div className="code-header">
                  <span>
                    <Braces size={15} />
                    {block.label}
                  </span>
                  <CopyButton value={block.text} />
                </div>
                <pre>{block.text}</pre>
              </section>
            );
          }
          if (block.type === 'notice') return <div className="notice" key={index}>{block.text}</div>;
          return <MarkdownBlock text={block.text} key={index} />;
        })}
        <AssetGrid assets={message.assets} onOpen={onOpenAsset} />
        {!!message.references.length && (
          <div className="references">
            {message.references.slice(0, 6).map((reference, index) =>
              reference.url ? (
                <a href={reference.url} target="_blank" rel="noreferrer" key={index}>
                  {reference.label}
                </a>
              ) : (
                <span key={index}>{reference.label}</span>
              ),
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function buildConversationMarkdown(conversation: ConversationFile, messages: ArchiveMessage[]) {
  const lines = [
    `# ${conversation.title}`,
    '',
    `- Created: ${formatDate(conversation.createTime)}`,
    `- Updated: ${formatDate(conversation.updateTime)}`,
    `- Messages: ${messages.length}`,
    '',
  ];

  for (const message of messages) {
    lines.push(`## ${roleLabel(message.role)} - ${formatDate(message.createTime)}`, '');
    for (const block of message.blocks) {
      if (block.type === 'code') {
        lines.push(`\`\`\`${block.language || ''}`, block.text, '```', '');
      } else if (block.type === 'execution') {
        lines.push('```text', block.text, '```', '');
      } else {
        lines.push(block.text, '');
      }
    }
    for (const asset of message.assets) {
      if (asset.kind !== 'missing') lines.push(`![${asset.label}](${asset.url})`, '');
      else lines.push(`[Missing asset: ${asset.original}]`, '');
    }
  }

  return lines.join('\n');
}

async function exportConversationMarkdown(conversation: ConversationFile, messages: ArchiveMessage[]) {
  const markdown = buildConversationMarkdown(conversation, messages);
  const desktopPath = await exportConversationMarkdownDesktop(conversation.id, markdown);
  if (desktopPath) return;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${conversation.slug}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Sidebar({
  index,
  conversations,
  selectedId,
  activeView,
  filters,
  regexError,
  viewerState,
  savedSearches,
  artifactSearchData,
  collapsed,
  onFilters,
  onSaveSearch,
  onDeleteSavedSearch,
  onQueueConversations,
  onSelect,
  onToggleCollapsed,
  onHome,
  onCodeExplorer,
  onDocumentExplorer,
  onAssetExplorer,
  onLinkExplorer,
  onKnowledge,
  onProjects,
  onLibrary,
}: {
  index: ArchiveIndex;
  conversations: ConversationSummary[];
  selectedId: string | null;
  activeView: AppView;
  filters: SearchFilters;
  regexError: string;
  viewerState: ViewerState;
  savedSearches?: SavedSearch[];
  artifactSearchData?: ArtifactSearchData | null;
  collapsed: boolean;
  onFilters: (filters: SearchFilters) => void;
  onSaveSearch?: (filters: SearchFilters) => void;
  onDeleteSavedSearch?: (id: string) => void;
  onQueueConversations?: (conversations: ConversationSummary[]) => void;
  onSelect: (conversation: ConversationSummary) => void;
  onToggleCollapsed: () => void;
  onHome: () => void;
  onCodeExplorer: () => void;
  onDocumentExplorer: () => void;
  onAssetExplorer: () => void;
  onLinkExplorer: () => void;
  onKnowledge: () => void;
  onProjects: () => void;
  onLibrary: () => void;
}) {
  function updateFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    onFilters({ ...filters, [key]: value });
  }
  const activeFilters = hasActiveSearchFilters(filters);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark">
          <img src={chatArchiveLogo} alt="" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div>
            <h1>Chat Archive</h1>
            <span>{index.totals.conversations.toLocaleString()} conversations</span>
          </div>
        )}
        <button className="icon-only" type="button" onClick={onToggleCollapsed} title="Toggle sidebar">
          <PanelLeft size={17} />
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="sidebar-tools">
            <button className={activeView === 'dashboard' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onHome}>
              <Home size={16} />
              Home
            </button>
            <button className={activeView === 'code' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onCodeExplorer}>
              <Code2 size={16} />
              Code
            </button>
            <button className={activeView === 'documents' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onDocumentExplorer}>
              <FileText size={16} />
              Docs
            </button>
            <button className={activeView === 'assets' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onAssetExplorer}>
              <Images size={16} />
              Assets
            </button>
            <button className={activeView === 'links' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onLinkExplorer}>
              <Link2 size={16} />
              Links
            </button>
            <button className={activeView === 'knowledge' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onKnowledge}>
              <FolderKanban size={16} />
              Knowledge
            </button>
            <button className={activeView === 'projects' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onProjects}>
              <BarChart3 size={16} />
              Projects
            </button>
            <button className={activeView === 'library' ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onLibrary}>
              <FileArchive size={16} />
              Library
            </button>
            <button className="toolbar-button" type="button" onClick={() => onFilters(DEFAULT_FILTERS)}>
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              value={filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
              placeholder='Search, "exact phrase", type:code'
            />
          </label>
          <div className="filter-row">
            {FIELD_SCOPES.map((scope) => (
              <button
                className={filters.fieldScope === scope ? 'filter-chip active' : 'filter-chip'}
                type="button"
                key={scope}
                onClick={() => updateFilter('fieldScope', scope)}
              >
                {scope}
              </button>
            ))}
          </div>
          <div className="filter-row split">
            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className={filters.regex ? 'filter-chip active' : 'filter-chip'}
                type="button"
                onClick={() => updateFilter('regex', !filters.regex)}
              >
                <Regex size={13} />
                Regex
              </button>
              {activeFilters && onSaveSearch ? (
                <button
                  className="filter-chip"
                  type="button"
                  onClick={() => onSaveSearch(filters)}
                  title="Save current search and filter criteria as a reusable view"
                >
                  <Bookmark size={12} />
                  Save view
                </button>
              ) : null}
              {activeFilters && conversations.length > 0 && onQueueConversations ? (
                <button
                  className="filter-chip"
                  type="button"
                  onClick={() => onQueueConversations(conversations.slice(0, 100))}
                  title="Queue filtered conversations into Batch Ingestion below"
                >
                  + Queue ({Math.min(conversations.length, 100)})
                </button>
              ) : null}
            </div>
            <span>{regexError ? 'Invalid regex' : `${conversations.length.toLocaleString()} shown`}</span>
          </div>
          {savedSearches && savedSearches.length > 0 ? (
            <div className="filter-row" style={{ gap: 4 }}>
              {savedSearches.map((saved) => (
                <span
                  key={saved.id}
                  className="filter-chip"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 4 }}
                >
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'inherit',
                      padding: 0,
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      onFilters({
                        query: saved.query,
                        fieldScope: saved.fieldScope,
                        regex: saved.regex,
                        startDate: saved.startDate,
                        endDate: saved.endDate,
                        minMessages: saved.minMessages,
                        maxMessages: saved.maxMessages,
                      })
                    }
                    title={`Saved view: ${saved.query || saved.fieldScope}`}
                  >
                    {saved.name}
                  </button>
                  {onDeleteSavedSearch ? (
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: 'inherit',
                        padding: '0 2px',
                        cursor: 'pointer',
                        opacity: 0.7,
                      }}
                      onClick={() => onDeleteSavedSearch(saved.id)}
                      title="Remove saved view"
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
          {regexError ? <div className="filter-error">{regexError}</div> : null}
          <div className="range-grid">
            <label>
              <span>From</span>
              <input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} />
            </label>
            <label>
              <span>Min msgs</span>
              <input
                type="number"
                min="0"
                value={filters.minMessages}
                onChange={(event) => updateFilter('minMessages', event.target.value)}
              />
            </label>
            <label>
              <span>Max msgs</span>
              <input
                type="number"
                min="0"
                value={filters.maxMessages}
                onChange={(event) => updateFilter('maxMessages', event.target.value)}
              />
            </label>
          </div>
          <div className="side-stats">
            <span>{index.totals.copiedAssets.toLocaleString()} copied assets</span>
            <span>{Object.keys(viewerState.pinned).length.toLocaleString()} pinned</span>
          </div>
          <nav className="conversation-list">
            {groupConversations(conversations).map(([month, grouped]) => (
              <section className="month-group" key={month}>
                <h2>{month}</h2>
                {grouped.map((conversation) => {
                  const matchReason = filters.query.trim()
                    ? explainConversationMatch(conversation, filters, artifactSearchData || null)
                    : '';
                  return (
                    <button
                      className={conversation.id === selectedId ? 'conversation-row selected' : 'conversation-row'}
                      type="button"
                      key={conversation.id}
                      onClick={() => onSelect(conversation)}
                    >
                      <span>
                        {viewerState.pinned[conversation.id] ? <Pin size={12} /> : null}
                        {viewerState.favorites[conversation.id] ? <Star size={12} /> : null}
                        {conversation.title}
                      </span>
                      <small>
                        {formatDate(getConversationTime(conversation), { month: 'short', day: 'numeric' })}
                        {conversation.codeBlockCount ? ` - ${conversation.codeBlockCount} code` : ''}
                        {conversation.assetCount ? ` - ${conversation.assetCount} media` : ''}
                      </small>
                      {matchReason ? (
                        <small style={{ color: 'var(--accent)', display: 'block', marginTop: 2 }}>
                          {matchReason}
                        </small>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            ))}
          </nav>
        </>
      )}
    </aside>
  );
}

function Dashboard({
  index,
  artifacts,
  viewerState,
  onSelect,
}: {
  index: ArchiveIndex;
  artifacts: ArtifactIndex | null;
  viewerState: ViewerState;
  onSelect: (conversation: ConversationSummary) => void;
}) {
  const stats = useMemo(() => {
    let first = Number.POSITIVE_INFINITY;
    let latest = 0;
    let codeBlocks = 0;
    for (const conversation of index.conversations) {
      const created = conversation.createTime || 0;
      const updated = conversation.updateTime || created;
      if (created) first = Math.min(first, created);
      if (updated) latest = Math.max(latest, updated);
      codeBlocks += conversation.codeBlockCount || 0;
    }
    return { first: Number.isFinite(first) ? first : null, latest: latest || null, codeBlocks };
  }, [index.conversations]);
  const recentlyViewed = viewerState.recentlyViewed
    .map((item) => getConversationById(index, item.conversationId))
    .filter((item): item is ConversationSummary => Boolean(item));
  const favorites = Object.keys(viewerState.favorites)
    .map((id) => getConversationById(index, id))
    .filter((item): item is ConversationSummary => Boolean(item))
    .slice(0, 8);
  const pinned = Object.keys(viewerState.pinned)
    .map((id) => getConversationById(index, id))
    .filter((item): item is ConversationSummary => Boolean(item))
    .slice(0, 8);
  const readCount = Object.keys(viewerState.read).length;

  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div className="brand-mark large">
          <img src={chatArchiveLogo} alt="" aria-hidden="true" />
        </div>
        <div>
          <p>Local archive dashboard</p>
          <h2>Archive Viewer Maturity</h2>
        </div>
      </div>
      <div className="stat-grid">
        <Stat label="Conversations" value={index.totals.conversations.toLocaleString()} />
        <Stat label="Messages" value={index.totals.visibleMessages.toLocaleString()} />
        <Stat label="Copied assets" value={index.totals.copiedAssets.toLocaleString()} />
        <Stat label="Code blocks" value={stats.codeBlocks.toLocaleString()} />
        <Stat label="First chat" value={formatDate(stats.first)} />
        <Stat label="Latest chat" value={formatDate(stats.latest)} />
        <Stat label="Unresolved assets" value={index.totals.missingAssets.toLocaleString()} tone="warn" />
        <Stat label="Unread" value={(index.totals.conversations - readCount).toLocaleString()} />
      </div>
      <DashboardList title="Recently viewed" icon={<CalendarDays size={16} />} conversations={recentlyViewed} onSelect={onSelect} />
      <DashboardList title="Pinned" icon={<Pin size={16} />} conversations={pinned} onSelect={onSelect} />
      <DashboardList title="Favorites" icon={<Star size={16} />} conversations={favorites} onSelect={onSelect} />
      <ArtifactDashboard artifacts={artifacts} />
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className={tone === 'warn' ? 'stat warn' : 'stat'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardList({
  title,
  icon,
  conversations,
  onSelect,
}: {
  title: string;
  icon: ReactNode;
  conversations: ConversationSummary[];
  onSelect: (conversation: ConversationSummary) => void;
}) {
  return (
    <section className="dashboard-section">
      <h3>
        {icon}
        {title}
      </h3>
      {conversations.length ? (
        <div className="dashboard-list">
          {conversations.map((conversation) => (
            <button type="button" key={conversation.id} onClick={() => onSelect(conversation)}>
              <span>{conversation.title}</span>
              <small>{formatDate(getConversationTime(conversation))}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-note">Nothing here yet.</p>
      )}
    </section>
  );
}

function ArtifactDashboard({ artifacts }: { artifacts: ArtifactIndex | null }) {
  const topLanguages = useMemo(() => {
    if (!artifacts) return [];
    if (artifacts.code && artifacts.code.length > 0) {
      return countCodeLanguages(artifacts.code)
        .slice(0, 10)
        .map((item) => ({ language: item.name, count: item.count }));
    }
    const aggregated = new Map<string, number>();
    for (const [rawLang, count] of Object.entries(artifacts.languageCounts)) {
      const lang = sanitizeCodeLanguageToken(rawLang);
      aggregated.set(lang, (aggregated.get(lang) || 0) + count);
    }
    return [...aggregated.entries()]
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language))
      .slice(0, 10);
  }, [artifacts]);

  return (
    <section className="dashboard-section">
      <h3>
        <Archive size={16} />
        Artifact indexes
      </h3>
      {artifacts ? (
        <>
          <div className="artifact-stat-grid">
            <Stat label="Code" value={artifacts.totals.code.toLocaleString()} />
            <Stat label="Assets" value={artifacts.totals.assets.toLocaleString()} />
            <Stat label="Documents" value={artifacts.totals.documents.toLocaleString()} />
            <Stat label="Links" value={artifacts.totals.links.toLocaleString()} />
          </div>
          <div className="language-row">
            {topLanguages.map((item) => (
              <span key={item.language}>
                <Code2 size={12} />
                {item.language} {item.count.toLocaleString()}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-note">Run `npm run ingest` to generate the dedicated artifact index.</p>
      )}
    </section>
  );
}

const CODE_CATEGORY_LABELS: Record<CodeArtifactCategory, string> = {
  code: 'Source code',
  shell: 'Shell / command',
  config: 'Config / data',
  diagram: 'Diagram',
  prose: 'Prose / text',
};

function CodeExplorer({
  artifacts,
  initialSelectedId,
  customTitles,
  onOpenSource,
  onOrganize,
  selectedTargets,
  onToggleSelectTarget,
  onSelectAllVisible,
  onClearSelection,
}: {
  artifacts: CodeArtifact[];
  initialSelectedId?: string;
  customTitles?: Record<string, string>;
  onOpenSource: (artifact: CodeArtifact) => void;
  onOrganize: (target: KnowledgeTarget) => void;
  selectedTargets?: KnowledgeTarget[];
  onToggleSelectTarget?: (target: KnowledgeTarget) => void;
  onSelectAllVisible?: (targets: KnowledgeTarget[]) => void;
  onClearSelection?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CodeArtifactCategory | 'all'>('all');
  const [language, setLanguage] = useState('all');
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      setCategory('all');
      setLanguage('all');
      setQuery('');
    }
  }, [initialSelectedId]);

  const categories = useMemo(() => {
    return countCodeCategories(artifacts);
  }, [artifacts]);

  const languages = useMemo(() => {
    return countCodeLanguages(artifacts);
  }, [artifacts]);

  const filtered = useMemo(() => {
    return filterCodeArtifacts(artifacts, language, query, category);
  }, [artifacts, category, language, query]);

  const selected = selectedExplorerArtifact(filtered, selectedId);
  const visibleRows = visibleExplorerRows(filtered);
  const highlighted = useMemo(() => (selected ? highlightCode(selected.text, selected.language) : null), [selected]);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);

  useEffect(() => {
    setCompareTargetId(null);
  }, [selected?.id]);

  const codeDisplayTitle = (item: CodeArtifact) =>
    resolveTargetTitle(customTitles, 'code', item.id, deriveCodeArtifactTitle(item));

  const { exactDuplicates, revisions } = useMemo(() => {
    if (!selected) return { exactDuplicates: [], revisions: [] };
    return findCodeRevisionsAndDuplicates(selected, artifacts);
  }, [artifacts, selected]);

  const compareTarget = useMemo(() => {
    if (!compareTargetId) return null;
    return artifacts.find((item) => item.id === compareTargetId) || null;
  }, [artifacts, compareTargetId]);

  const lineDiff = useMemo(() => {
    if (!selected || !compareTarget) return null;
    return computeLineDiff(compareTarget.text, selected.text);
  }, [compareTarget, selected]);

  const sameConversationCode = useMemo(() => {
    if (!selected) return [];
    return artifacts
      .filter((item) => item.conversationId === selected.conversationId && item.id !== selected.id)
      .slice(0, 14);
  }, [artifacts, selected]);

  const selectedKeys = useMemo(() => {
    return new Set((selectedTargets || []).map(targetKey));
  }, [selectedTargets]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filtered.some((item) => item.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  return (
    <section className="explorer code-explorer">
      <div className="explorer-heading">
        <div className="brand-mark large">
          <Code2 size={24} />
        </div>
        <div>
          <p>Artifact explorer</p>
          <h2>Code Explorer</h2>
        </div>
      </div>
      <div className="explorer-toolbar">
        <label className="explorer-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search identifier, filename, code, language, conversation, or role" />
        </label>
        <span>
          {filtered.length.toLocaleString()} of {artifacts.length.toLocaleString()} snippets
        </span>
      </div>
      {onToggleSelectTarget ? (
        <div className="explorer-selection-banner">
          <span>
            <strong>{selectedTargets?.length || 0}</strong> items queued for Batch Ingestion below
          </span>
          <div className="explorer-selection-actions">
            <button
              type="button"
              className="toolbar-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => {
                const targets: KnowledgeTarget[] = visibleRows.map((r) => ({
                  targetType: 'code',
                  targetId: r.id,
                  conversationId: r.conversationId,
                  title: codeDisplayTitle(r),
                }));
                onSelectAllVisible?.(targets);
              }}
            >
              Select visible ({visibleRows.length})
            </button>
            {selectedTargets && selectedTargets.length > 0 ? (
              <button
                type="button"
                className="toolbar-button"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={onClearSelection}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="explorer-grid">
        <aside className="explorer-facets">
          <h3>Block kind</h3>
          <button className={category === 'all' ? 'facet-row active' : 'facet-row'} type="button" onClick={() => setCategory('all')}>
            <span>All kinds</span>
            <strong>{artifacts.length.toLocaleString()}</strong>
          </button>
          {categories.map((item) => (
            <button
              className={category === item.name ? 'facet-row active' : 'facet-row'}
              type="button"
              key={item.name}
              onClick={() => setCategory(item.name)}
            >
              <span>{CODE_CATEGORY_LABELS[item.name]}</span>
              <strong>{item.count.toLocaleString()}</strong>
            </button>
          ))}
          <h3>Language</h3>
          <button className={language === 'all' ? 'facet-row active' : 'facet-row'} type="button" onClick={() => setLanguage('all')}>
            <span>All languages</span>
            <strong>{artifacts.length.toLocaleString()}</strong>
          </button>
          {languages.map((item) => (
            <button
              className={language === item.name ? 'facet-row active' : 'facet-row'}
              type="button"
              key={item.name}
              onClick={() => setLanguage(item.name)}
            >
              <span>{item.name}</span>
              <strong>{item.count.toLocaleString()}</strong>
            </button>
          ))}
        </aside>
        <div className="artifact-list">
          {visibleRows.map((item) => {
            const displayTitle = codeDisplayTitle(item);
            const target: KnowledgeTarget = {
              targetType: 'code',
              targetId: item.id,
              conversationId: item.conversationId,
              title: displayTitle,
            };
            const isChecked = selectedKeys.has(targetKey(target));
            return (
              <div
                key={item.id}
                className={selected?.id === item.id ? 'artifact-row selected' : 'artifact-row'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onClick={() => setSelectedId(item.id)}
              >
                {onToggleSelectTarget ? (
                  <div
                    className="matrix-checkbox-cell"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelectTarget(target);
                    }}
                    title="Queue code for batch ingestion"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                    />
                  </div>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Code2 size={14} />
                    {displayTitle}
                  </span>
                  <small>
                    {codeArtifactLanguage(item)} · {item.conversationTitle} · {formatDate(item.createTime)}
                  </small>
                  <p>{item.preview}</p>
                </div>
              </div>
            );
          })}
          {filtered.length > visibleRows.length ? (
            <p className="list-limit-note">Showing first {visibleRows.length.toLocaleString()} matches. Narrow search or choose a language to reduce the list.</p>
          ) : null}
          {!filtered.length ? <p className="empty-note">No code snippets match those filters.</p> : null}
        </div>
        <section className="artifact-detail">
          {selected && highlighted ? (
            <>
              <div className="artifact-detail-head">
                <div>
                  <span>{codeArtifactLanguage(selected)} · {CODE_CATEGORY_LABELS[classifyCodeArtifactKind(selected)]}</span>
                  <h3>{codeDisplayTitle(selected)}</h3>
                  <p>
                    {selected.conversationTitle} · {roleLabel(selected.role)} · {formatDate(selected.createTime)} · {formatApproxSize(selected.text)}
                  </p>
                </div>
                <div className="artifact-actions">
                  <button className="toolbar-button" type="button" onClick={() => onOrganize({ targetType: 'code', targetId: selected.id, conversationId: selected.conversationId, title: codeDisplayTitle(selected) })}>
                    <Tags size={16} />
                    Organize / Rename
                  </button>
                  <CopyButton value={selected.text} label="Copy snippet" />
                  <button className="toolbar-button" type="button" onClick={() => void exportCodeSnippet(selected)}>
                    <Download size={16} />
                    Export
                  </button>
                  <button className="toolbar-button active" type="button" onClick={() => onOpenSource(selected)}>
                    <ArrowLeft size={16} />
                    Source
                  </button>
                </div>
              </div>
              <section className="code-card explorer-code-preview">
                <div className="code-header">
                  <span>
                    <Code2 size={15} />
                    {selected.language || highlighted.language}
                  </span>
                  {revisions.length > 0 ? (
                    <button
                      type="button"
                      className={compareTarget ? 'filter-chip active' : 'filter-chip'}
                      onClick={() => setCompareTargetId(compareTarget ? null : revisions[0].id)}
                      title="Compare this snippet against its closest candidate revision"
                    >
                      {compareTarget ? 'Close diff' : `Compare (${revisions.length} rev${revisions.length === 1 ? '' : 's'})`}
                    </button>
                  ) : null}
                </div>
                <pre className={`language-${highlighted.language}`}>
                  <code
                    className={`language-${highlighted.language}`}
                    dangerouslySetInnerHTML={{ __html: highlighted.html }}
                  />
                </pre>
              </section>

              {compareTarget && lineDiff ? (
                <div className="dashboard-section" style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>
                      Diff vs. {codeDisplayTitle(compareTarget)} ({formatDate(compareTarget.createTime)})
                    </h3>
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: '#4ade80' }}>+{lineDiff.added} added</span>
                      <span style={{ color: '#f87171' }}>-{lineDiff.removed} removed</span>
                      <span>{lineDiff.unchanged} unchanged</span>
                      <button
                        type="button"
                        className="toolbar-button"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => onOpenSource(compareTarget)}
                      >
                        Compared source
                      </button>
                      <button
                        type="button"
                        className="toolbar-button"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => setCompareTargetId(null)}
                      >
                        Close diff
                      </button>
                    </div>
                  </div>
                  <pre
                    style={{
                      marginTop: 8,
                      maxHeight: 320,
                      overflow: 'auto',
                      padding: 10,
                      borderRadius: 6,
                      background: 'rgba(10, 14, 23, 0.75)',
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    {lineDiff.lines.map((line, idx) => (
                      <div
                        key={idx}
                        style={{
                          background:
                            line.type === 'add'
                              ? 'rgba(34, 197, 94, 0.14)'
                              : line.type === 'remove'
                                ? 'rgba(239, 68, 68, 0.14)'
                                : 'transparent',
                          color:
                            line.type === 'add'
                              ? '#86efac'
                              : line.type === 'remove'
                                ? '#fca5a5'
                                : 'inherit',
                          padding: '0 6px',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}
                        {line.text}
                      </div>
                    ))}
                  </pre>
                </div>
              ) : null}

              {revisions.length > 0 || exactDuplicates.length > 0 ? (
                <div className="dashboard-section" style={{ marginTop: 14 }}>
                  <h3>
                    <Code2 size={15} />
                    Versions & Duplicates ({revisions.length} revision{revisions.length === 1 ? '' : 's'}, {exactDuplicates.length} exact duplicate{exactDuplicates.length === 1 ? '' : 's'})
                  </h3>
                  <div className="dashboard-list">
                    {revisions.map((rev) => (
                      <div
                        key={rev.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: compareTargetId === rev.id ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(rev.id)}
                          style={{ flex: 1, textAlign: 'left' }}
                        >
                          <span>Revision in "{rev.conversationTitle}"</span>
                          <small>{formatDate(rev.createTime)} · {formatApproxSize(rev.text)}</small>
                        </button>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <button
                            type="button"
                            className={compareTargetId === rev.id ? 'filter-chip active' : 'filter-chip'}
                            onClick={() => setCompareTargetId(compareTargetId === rev.id ? null : rev.id)}
                          >
                            {compareTargetId === rev.id ? 'Comparing' : 'Diff'}
                          </button>
                          <button
                            type="button"
                            className="filter-chip"
                            onClick={() => onOpenSource(rev)}
                          >
                            Source
                          </button>
                        </div>
                      </div>
                    ))}
                    {exactDuplicates.map((dup) => (
                      <button
                        type="button"
                        key={dup.id}
                        onClick={() => onOpenSource(dup)}
                        title="Byte-identical code block in another message"
                      >
                        <span>Exact copy in "{dup.conversationTitle}"</span>
                        <small>{roleLabel(dup.role)} · {formatDate(dup.createTime)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {sameConversationCode.length > 0 ? (
                <div className="dashboard-section" style={{ marginTop: 14 }}>
                  <h3>
                    <Code2 size={15} />
                    Other code blocks in "{selected.conversationTitle}" ({sameConversationCode.length})
                  </h3>
                  <div className="dashboard-list">
                    {sameConversationCode.map((sibling) => (
                      <button
                        type="button"
                        key={sibling.id}
                        onClick={() => setSelectedId(sibling.id)}
                        title={sibling.preview}
                      >
                        <span>{codeDisplayTitle(sibling)}</span>
                        <small>{codeArtifactLanguage(sibling)} · {formatApproxSize(sibling.text)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty-note">Select a code snippet to inspect it.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function DocumentExplorer({
  artifacts,
  initialSelectedId,
  customTitles,
  onOpenSource,
  onOrganize,
  selectedTargets,
  onToggleSelectTarget,
  onSelectAllVisible,
  onClearSelection,
}: {
  artifacts: DocumentArtifact[];
  initialSelectedId?: string;
  customTitles?: Record<string, string>;
  onOpenSource: (artifact: DocumentArtifact) => void;
  onOrganize: (target: KnowledgeTarget) => void;
  selectedTargets?: KnowledgeTarget[];
  onToggleSelectTarget?: (target: KnowledgeTarget) => void;
  onSelectAllVisible?: (targets: KnowledgeTarget[]) => void;
  onClearSelection?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState<DocumentAvailabilityFilter>('all');
  const [documentType, setDocumentType] = useState('all');
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');
  const [content, setContent] = useState('');
  const [contentError, setContentError] = useState('');
  const contentCache = useRef(new Map<string, string>());

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      setAvailability('all');
      setDocumentType('all');
      setQuery('');
    }
  }, [initialSelectedId]);

  const availabilityCounts = useMemo(() => {
    return countDocumentAvailability(artifacts);
  }, [artifacts]);

  const types = useMemo(() => {
    return countDocumentTypes(artifacts, availability);
  }, [artifacts, availability]);

  const filtered = useMemo(() => {
    return filterDocumentArtifacts(artifacts, documentType, query, availability);
  }, [artifacts, availability, documentType, query]);

  const selected = selectedExplorerArtifact(filtered, selectedId);
  const visibleRows = visibleExplorerRows(filtered);

  const docDisplayTitle = (item: DocumentArtifact) =>
    resolveTargetTitle(customTitles, 'document', item.id, deriveDocumentDisplayTitle(item));

  const documentRevisions = useMemo(() => {
    if (!selected) return [];
    return findDocumentRevisions(selected, artifacts);
  }, [artifacts, selected]);

  const sameConversationDocs = useMemo(() => {
    if (!selected) return [];
    return artifacts
      .filter((item) => item.conversationId === selected.conversationId && item.id !== selected.id)
      .slice(0, 12);
  }, [artifacts, selected]);

  const selectedKeys = useMemo(() => {
    return new Set((selectedTargets || []).map(targetKey));
  }, [selectedTargets]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filtered.some((item) => item.id === selectedId)) {
      const firstRecovered = filtered.find((item) => isRecoveredDocumentArtifact(item));
      setSelectedId((firstRecovered || filtered[0]).id);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setContent('');
      setContentError('');
      return () => {
        cancelled = true;
      };
    }
    const cached = contentCache.current.get(selected.id);
    if (cached !== undefined) {
      setContent(cached);
      setContentError('');
      return () => {
        cancelled = true;
      };
    }
    setContent('');
    setContentError('');
    loadDocumentArtifactContent(selected)
      .then((value) => {
        if (cancelled) return;
        contentCache.current.set(selected.id, value);
        setContent(value);
      })
      .catch((error) => {
        if (!cancelled) setContentError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <section className="explorer document-explorer">
      <div className="explorer-heading">
        <div className="brand-mark large"><FileText size={24} /></div>
        <div><p>Artifact explorer</p><h2>Document Explorer</h2></div>
      </div>
      <div className="explorer-toolbar">
        <label className="explorer-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, type, preview, conversation, or role" />
        </label>
        <span>{filtered.length.toLocaleString()} of {artifacts.length.toLocaleString()} documents</span>
      </div>
      {onToggleSelectTarget ? (
        <div className="explorer-selection-banner">
          <span>
            <strong>{selectedTargets?.length || 0}</strong> items queued for Batch Ingestion below
          </span>
          <div className="explorer-selection-actions">
            <button
              type="button"
              className="toolbar-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => {
                const targets: KnowledgeTarget[] = visibleRows.map((r) => ({
                  targetType: 'document',
                  targetId: r.id,
                  conversationId: r.conversationId,
                  title: docDisplayTitle(r),
                }));
                onSelectAllVisible?.(targets);
              }}
            >
              Select visible ({visibleRows.length})
            </button>
            {selectedTargets && selectedTargets.length > 0 ? (
              <button
                type="button"
                className="toolbar-button"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={onClearSelection}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="explorer-grid">
        <aside className="explorer-facets">
          <h3>Availability</h3>
          <button
            className={availability === 'all' ? 'facet-row active' : 'facet-row'}
            type="button"
            onClick={() => setAvailability('all')}
          >
            <span>All documents</span><strong>{availabilityCounts.all.toLocaleString()}</strong>
          </button>
          <button
            className={availability === 'recovered' ? 'facet-row active' : 'facet-row'}
            type="button"
            onClick={() => setAvailability('recovered')}
          >
            <span>Recovered files</span><strong>{availabilityCounts.recovered.toLocaleString()}</strong>
          </button>
          <button
            className={availability === 'pointer' ? 'facet-row active' : 'facet-row'}
            type="button"
            onClick={() => setAvailability('pointer')}
          >
            <span>Conversation context</span><strong>{availabilityCounts.pointer.toLocaleString()}</strong>
          </button>
          <h3 style={{ marginTop: 12 }}>Document type</h3>
          <button className={documentType === 'all' ? 'facet-row active' : 'facet-row'} type="button" onClick={() => setDocumentType('all')}>
            <span>All types</span><strong>{(availability === 'all' ? availabilityCounts.all : availability === 'recovered' ? availabilityCounts.recovered : availabilityCounts.pointer).toLocaleString()}</strong>
          </button>
          {types.map((item) => (
            <button className={documentType === item.name ? 'facet-row active' : 'facet-row'} type="button" key={item.name} onClick={() => setDocumentType(item.name)}>
              <span>{item.name}</span><strong>{item.count.toLocaleString()}</strong>
            </button>
          ))}
        </aside>
        <div className="artifact-list">
          {visibleRows.map((item) => {
            const displayTitle = docDisplayTitle(item);
            const recovered = isRecoveredDocumentArtifact(item);
            const target: KnowledgeTarget = {
              targetType: 'document',
              targetId: item.id,
              conversationId: item.conversationId,
              title: displayTitle,
            };
            const isChecked = selectedKeys.has(targetKey(target));
            return (
              <div
                key={item.id}
                className={selected?.id === item.id ? 'artifact-row selected' : 'artifact-row'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onClick={() => setSelectedId(item.id)}
              >
                {onToggleSelectTarget ? (
                  <div
                    className="matrix-checkbox-cell"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelectTarget(target);
                    }}
                    title="Queue document for batch ingestion"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                    />
                  </div>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={14} />{displayTitle}
                  </span>
                  <small>
                    {item.documentType} · {recovered ? 'Recovered file' : 'Conversation context'} · {item.conversationTitle} · {formatDate(item.createTime)}
                  </small>
                  <p>{item.preview}</p>
                </div>
              </div>
            );
          })}
          {filtered.length > visibleRows.length ? <p className="list-limit-note">Showing first {visibleRows.length.toLocaleString()} matches. Narrow the search or choose a document type.</p> : null}
          {!filtered.length ? <p className="empty-note">No documents match those filters.</p> : null}
        </div>
        <section className="artifact-detail">
          {selected ? (
            <>
              <div className="artifact-detail-head">
                <div>
                  <span>
                    {selected.documentType} · {isRecoveredDocumentArtifact(selected) ? 'Recovered file' : 'Conversation context'}
                  </span>
                  <h3>{docDisplayTitle(selected)}</h3>
                  <p>{selected.conversationTitle} · {roleLabel(selected.role)} · {formatDate(selected.createTime)}</p>
                </div>
                <div className="artifact-actions">
                  <button className="toolbar-button" type="button" onClick={() => onOrganize({ targetType: 'document', targetId: selected.id, conversationId: selected.conversationId, title: docDisplayTitle(selected) })}><Tags size={16} />Organize / Rename</button>
                  <CopyButton value={content} label="Copy document" />
                  <button className="toolbar-button" type="button" disabled={!content} onClick={() => void exportDocumentMarkdown(selected, content)}><Download size={16} />{selected.url ? 'Export original' : 'Export'}</button>
                  <button className="toolbar-button active" type="button" onClick={() => onOpenSource(selected)}><ArrowLeft size={16} />Source</button>
                </div>
              </div>
              {contentError ? <div className="notice">{contentError}</div> : content ? <div className="document-preview"><MarkdownBlock text={content} /></div> : <p className="empty-note">Loading source document...</p>}
              {documentRevisions.length > 0 ? (
                <div className="dashboard-section" style={{ marginTop: 14 }}>
                  <h3>
                    <FileText size={15} />
                    Candidate revisions of "{selected.title}" ({documentRevisions.length})
                  </h3>
                  <div className="dashboard-list">
                    {documentRevisions.map((rev) => (
                      <button
                        type="button"
                        key={rev.id}
                        onClick={() => setSelectedId(rev.id)}
                        title={rev.preview}
                      >
                        <span>{docDisplayTitle(rev)}</span>
                        <small>
                          {formatDate(rev.createTime)} · {isRecoveredDocumentArtifact(rev) ? 'Recovered file' : 'Conversation context'}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {sameConversationDocs.length > 0 ? (
                <div className="dashboard-section" style={{ marginTop: 14 }}>
                  <h3>
                    <FileText size={15} />
                    Other documents in "{selected.conversationTitle}" ({sameConversationDocs.length})
                  </h3>
                  <div className="dashboard-list">
                    {sameConversationDocs.map((sibling) => (
                      <button
                        type="button"
                        key={sibling.id}
                        onClick={() => setSelectedId(sibling.id)}
                        title={sibling.preview}
                      >
                        <span>{docDisplayTitle(sibling)}</span>
                        <small>
                          {sibling.documentType} · {isRecoveredDocumentArtifact(sibling) ? 'Recovered file' : 'Conversation context'}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : <p className="empty-note">Select a document to inspect it.</p>}
        </section>
      </div>
    </section>
  );
}

function ArtifactImage({ asset, className = '' }: { asset: AssetArtifact; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !asset.url) {
    return <div className={`asset-image-fallback ${className}`}><FileImage size={24} /><span>Preview unavailable</span></div>;
  }
  return <img className={className} src={resolveArchiveAssetUrl(asset.url)} alt={asset.label} loading="lazy" onError={() => setFailed(true)} />;
}

function AssetExplorer({
  artifacts,
  initialSelectedId,
  customTitles,
  assetTriage,
  onUpdateAssetTriage,
  onBulkTriageMissingDalle,
  onOpenSource,
  onOpenAsset,
  onOrganize,
  selectedTargets,
  onToggleSelectTarget,
  onSelectAllVisible,
  onClearSelection,
}: {
  artifacts: AssetArtifact[];
  initialSelectedId?: string;
  customTitles?: Record<string, string>;
  assetTriage?: Record<string, AssetTriageStatus>;
  onUpdateAssetTriage?: (assetId: string, status: AssetTriageStatus) => void;
  onBulkTriageMissingDalle?: () => void;
  onOpenSource: (artifact: AssetArtifact) => void;
  onOpenAsset: (artifact: AssetArtifact) => void;
  onOrganize: (target: KnowledgeTarget) => void;
  selectedTargets?: KnowledgeTarget[];
  onToggleSelectTarget?: (target: KnowledgeTarget) => void;
  onSelectAllVisible?: (targets: KnowledgeTarget[]) => void;
  onClearSelection?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [extension, setExtension] = useState('all');
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      setKind('all');
      setExtension('all');
      setQuery('');
    }
  }, [initialSelectedId]);
  const counts = useMemo(() => {
    return countAssetKinds(artifacts);
  }, [artifacts]);
  const unresolvedSummary = useMemo(() => {
    return summarizeUnresolvedAssets(artifacts, assetTriage);
  }, [artifacts, assetTriage]);
  const extensions = useMemo(() => {
    return countAssetExtensions(artifacts);
  }, [artifacts]);
  const filtered = useMemo(() => {
    return filterAssetArtifacts(artifacts, kind, extension, query);
  }, [artifacts, extension, kind, query]);
  const selected = selectedExplorerArtifact(filtered, selectedId);
  const visibleRows = visibleExplorerRows(filtered);

  const assetTitle = (item: AssetArtifact) =>
    resolveTargetTitle(customTitles, 'asset', item.id, assetDisplayName(item));

  const selectedKeys = useMemo(() => {
    return new Set((selectedTargets || []).map(targetKey));
  }, [selectedTargets]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filtered.some((item) => item.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  return (
    <section className="explorer asset-explorer">
      <div className="explorer-heading">
        <div className="brand-mark large"><Images size={24} /></div>
        <div><p>Artifact explorer</p><h2>Asset Explorer</h2></div>
      </div>
      <div className="explorer-toolbar">
        <label className="explorer-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, pointer, extension, dimensions, URL, or conversation" /></label>
        <span>{filtered.length.toLocaleString()} of {artifacts.length.toLocaleString()} assets</span>
      </div>
      {onToggleSelectTarget ? (
        <div className="explorer-selection-banner">
          <span>
            <strong>{selectedTargets?.length || 0}</strong> items queued for Batch Ingestion below
          </span>
          <div className="explorer-selection-actions">
            <button
              type="button"
              className="toolbar-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => {
                const targets: KnowledgeTarget[] = visibleRows.map((r) => ({
                  targetType: 'asset',
                  targetId: r.id,
                  conversationId: r.conversationId,
                  title: assetTitle(r),
                }));
                onSelectAllVisible?.(targets);
              }}
            >
              Select visible ({visibleRows.length})
            </button>
            {selectedTargets && selectedTargets.length > 0 ? (
              <button
                type="button"
                className="toolbar-button"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={onClearSelection}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="explorer-grid">
        <aside className="explorer-facets">
          <h3>Asset state</h3>
          {([['all', 'All assets', artifacts.length], ['local', 'Local', counts.local], ['external', 'External', counts.external], ['missing', 'Missing', counts.missing]] as const).map(([value, label, count]) => (
            <button className={kind === value ? 'facet-row active' : 'facet-row'} type="button" key={value} onClick={() => setKind(value)}><span>{label}</span><strong>{count.toLocaleString()}</strong></button>
          ))}
          <h3>File type</h3>
          <button className={extension === 'all' ? 'facet-row active' : 'facet-row'} type="button" onClick={() => setExtension('all')}><span>All types</span><strong>{artifacts.length.toLocaleString()}</strong></button>
          {extensions.slice(0, 18).map((item) => (
            <button className={extension === item.name ? 'facet-row active' : 'facet-row'} type="button" key={item.name} onClick={() => setExtension(item.name)}><span>{item.name}</span><strong>{item.count.toLocaleString()}</strong></button>
          ))}
        </aside>
        <div className="artifact-list asset-artifact-list">
          {visibleRows.map((item) => {
            const displayTitle = assetTitle(item);
            const target: KnowledgeTarget = {
              targetType: 'asset',
              targetId: item.id,
              conversationId: item.conversationId,
              title: displayTitle,
            };
            const isChecked = selectedKeys.has(targetKey(target));
            return (
              <div
                key={item.id}
                className={selected?.id === item.id ? `asset-artifact-row selected ${item.kind}` : `asset-artifact-row ${item.kind}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onClick={() => setSelectedId(item.id)}
              >
                {onToggleSelectTarget ? (
                  <div
                    className="matrix-checkbox-cell"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelectTarget(target);
                    }}
                    title="Queue asset for batch ingestion"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                    />
                  </div>
                ) : null}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  {item.kind === 'missing' ? <div className="asset-image-fallback"><FileImage size={22} /><span>Missing</span></div> : <ArtifactImage asset={item} />}
                  <strong>{displayTitle}</strong>
                  <small>{assetFileExtension(item)} - {item.conversationTitle}</small>
                </div>
              </div>
            );
          })}
          {filtered.length > visibleRows.length ? <p className="list-limit-note">Showing first {visibleRows.length.toLocaleString()} matches. Narrow the search, asset state, or file type.</p> : null}
          {!filtered.length ? <p className="empty-note">No assets match those filters.</p> : null}
        </div>
        <section className="artifact-detail">
          {selected ? (
            <>
              <div className="artifact-detail-head">
                <div><span>{selected.kind} - {assetFileExtension(selected)}</span><h3>{assetTitle(selected)}</h3><p>{selected.conversationTitle} - {roleLabel(selected.role)} - {formatDate(selected.createTime)}</p></div>
                <div className="artifact-actions">
                  <button className="toolbar-button" type="button" onClick={() => onOrganize({ targetType: 'asset', targetId: selected.id, conversationId: selected.conversationId, title: assetTitle(selected) })}><Tags size={16} />Organize / Rename</button>
                  <CopyButton value={selected.original} label="Copy pointer" />
                  {selected.kind !== 'missing' ? <button className="toolbar-button" type="button" onClick={() => onOpenAsset(selected)}><Eye size={16} />Full size</button> : null}
                  <button className="toolbar-button active" type="button" onClick={() => onOpenSource(selected)}><ArrowLeft size={16} />Source</button>
                </div>
              </div>
              {selected.kind === 'missing' ? (
                <div className="missing-asset-diagnostic">
                  <FileImage size={34} />
                  <h4>
                    Local asset not found (
                    {classifyUnresolvedAssetCause(selected) === 'dalle_webp'
                      ? 'DALL-E WebP omitted from export'
                      : 'Upload omitted from export'}
                    )
                  </h4>
                  <p>
                    This pointer was present in the conversation export, but OpenAI did not include the binary file in the export zip.
                    Triage status: <strong>{assetTriage?.[selected.id] || 'unreviewed'}</strong>
                  </p>
                  <code>{selected.original}</code>
                  {onUpdateAssetTriage ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      <button
                        type="button"
                        className={assetTriage?.[selected.id] === 'unrecoverable' ? 'filter-chip active' : 'filter-chip'}
                        onClick={() => onUpdateAssetTriage(selected.id, 'unrecoverable')}
                      >
                        Mark unrecoverable (Skip)
                      </button>
                      <button
                        type="button"
                        className={(!assetTriage?.[selected.id] || assetTriage?.[selected.id] === 'unreviewed') ? 'filter-chip active' : 'filter-chip'}
                        onClick={() => onUpdateAssetTriage(selected.id, 'unreviewed')}
                      >
                        Mark unreviewed
                      </button>
                      {unresolvedSummary.dalleWebp > 0 && onBulkTriageMissingDalle ? (
                        <button
                          type="button"
                          className="filter-chip"
                          onClick={onBulkTriageMissingDalle}
                          title="Mark all missing DALL-E .webp pointers as unrecoverable so they don't clutter unreviewed counts"
                        >
                          Skip all missing DALL-E WebPs ({unresolvedSummary.dalleWebp})
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <button className="asset-detail-preview" type="button" onClick={() => onOpenAsset(selected)}><ArtifactImage asset={selected} /></button>
              )}
              <dl className="asset-metadata"><dt>Stored label</dt><dd>{selected.label}</dd><dt>File type</dt><dd>{assetFileExtension(selected)}</dd><dt>Original</dt><dd>{selected.original}</dd><dt>Resolved URL</dt><dd>{selected.url || 'Not resolved'}</dd>{selected.width ? <><dt>Dimensions</dt><dd>{selected.width} x {selected.height || '?'}</dd></> : null}</dl>
            </>
          ) : <p className="empty-note">Select an asset to inspect it.</p>}
        </section>
      </div>
    </section>
  );
}

const LINK_CATEGORY_LABELS: Record<LinkArtifactCategory, string> = {
  web: 'Websites & services',
  repo: 'Repos & packages',
  docs: 'Docs & reference',
  local: 'Local & template',
};

function LinkExplorer({
  artifacts,
  initialSelectedId,
  customTitles,
  onOpenSource,
  onOrganize,
  selectedTargets,
  onToggleSelectTarget,
  onSelectAllVisible,
  onClearSelection,
}: {
  artifacts: LinkArtifact[];
  initialSelectedId?: string;
  customTitles?: Record<string, string>;
  onOpenSource: (artifact: LinkArtifact) => void;
  onOrganize: (target: KnowledgeTarget) => void;
  selectedTargets?: KnowledgeTarget[];
  onToggleSelectTarget?: (target: KnowledgeTarget) => void;
  onSelectAllVisible?: (targets: KnowledgeTarget[]) => void;
  onClearSelection?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LinkArtifactCategory | 'all'>('all');
  const [domain, setDomain] = useState('all');
  const [domainFilter, setDomainFilter] = useState('');
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      setCategory('all');
      setDomain('all');
      setQuery('');
    }
  }, [initialSelectedId]);

  const categories = useMemo(() => countLinkCategories(artifacts), [artifacts]);
  const domains = useMemo(() => {
    const all = countLinkDomains(artifacts, category);
    const needle = domainFilter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((item) => item.name.toLowerCase().includes(needle));
  }, [artifacts, category, domainFilter]);

  const filtered = useMemo(() => {
    return filterLinkArtifacts(artifacts, domain, query, category);
  }, [artifacts, category, domain, query]);

  const selected = selectedExplorerArtifact(filtered, selectedId);
  const visibleRows = visibleExplorerRows(filtered);

  const linkTitle = (item: LinkArtifact) =>
    resolveTargetTitle(customTitles, 'link', item.id, linkDisplayLabel(item));

  const selectedKeys = useMemo(() => {
    return new Set((selectedTargets || []).map(targetKey));
  }, [selectedTargets]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filtered.some((item) => item.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selectedCleanUrl = selected ? sanitizeLinkUrl(selected.url) : '';
  const selectedDomain = selected ? normalizeLinkDomain(selected) : '';
  const selectedLabel = selected ? linkTitle(selected) : '';
  const selectedKind = selected ? classifyLinkArtifactKind(selected) : 'web';

  const sameUrlLinks = useMemo(() => {
    if (!selected || !selectedCleanUrl) return [];
    return artifacts
      .filter((item) => item.id !== selected.id && sanitizeLinkUrl(item.url) === selectedCleanUrl)
      .slice(0, 12);
  }, [artifacts, selected, selectedCleanUrl]);

  const sameDomainLinks = useMemo(() => {
    if (!selected || !selectedDomain) return [];
    const seenUrls = new Set<string>([selectedCleanUrl]);
    const list: LinkArtifact[] = [];
    for (const item of artifacts) {
      if (item.id === selected.id) continue;
      if (normalizeLinkDomain(item) !== selectedDomain) continue;
      const clean = sanitizeLinkUrl(item.url);
      if (seenUrls.has(clean)) continue;
      seenUrls.add(clean);
      list.push(item);
      if (list.length >= 16) break;
    }
    return list;
  }, [artifacts, selected, selectedCleanUrl, selectedDomain]);

  return (
    <section className="explorer link-explorer">
      <div className="explorer-heading">
        <div className="brand-mark large"><Link2 size={24} /></div>
        <div><p>Artifact explorer</p><h2>Link Explorer</h2></div>
      </div>
      <div className="explorer-toolbar">
        <label className="explorer-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search URL, domain, label, conversation title, or role"
          />
        </label>
        <span>{filtered.length.toLocaleString()} of {artifacts.length.toLocaleString()} links</span>
      </div>
      {onToggleSelectTarget ? (
        <div className="explorer-selection-banner">
          <span>
            <strong>{selectedTargets?.length || 0}</strong> items queued for Batch Ingestion below
          </span>
          <div className="explorer-selection-actions">
            <button
              type="button"
              className="toolbar-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => {
                const targets: KnowledgeTarget[] = visibleRows.map((r) => ({
                  targetType: 'link',
                  targetId: r.id,
                  conversationId: r.conversationId,
                  title: linkTitle(r),
                }));
                onSelectAllVisible?.(targets);
              }}
            >
              Select visible ({visibleRows.length})
            </button>
            {selectedTargets && selectedTargets.length > 0 ? (
              <button
                type="button"
                className="toolbar-button"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={onClearSelection}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="explorer-grid">
        <aside className="explorer-facets">
          <h3>Link kind</h3>
          <button
            className={category === 'all' ? 'facet-row active' : 'facet-row'}
            type="button"
            onClick={() => {
              setCategory('all');
              setDomain('all');
            }}
          >
            <span>All links</span><strong>{artifacts.length.toLocaleString()}</strong>
          </button>
          {categories.map((item) => (
            <button
              className={category === item.name ? 'facet-row active' : 'facet-row'}
              type="button"
              key={item.name}
              onClick={() => {
                setCategory(item.name);
                setDomain('all');
              }}
            >
              <span>{LINK_CATEGORY_LABELS[item.name]}</span><strong>{item.count.toLocaleString()}</strong>
            </button>
          ))}
          <h3 style={{ marginTop: 12 }}>Domains</h3>
          <label className="search-box" style={{ marginBottom: 6, padding: '4px 8px' }}>
            <Search size={13} />
            <input
              value={domainFilter}
              onChange={(event) => setDomainFilter(event.target.value)}
              placeholder="Filter domains..."
              style={{ fontSize: 12 }}
            />
          </label>
          <button
            className={domain === 'all' ? 'facet-row active' : 'facet-row'}
            type="button"
            onClick={() => setDomain('all')}
          >
            <span>All domains</span><strong>{countLinkDomains(artifacts, category).length.toLocaleString()}</strong>
          </button>
          {domains.slice(0, 60).map((item) => (
            <button
              className={domain === item.name ? 'facet-row active' : 'facet-row'}
              type="button"
              key={item.name}
              onClick={() => setDomain(item.name)}
            >
              <span>{item.name}</span><strong>{item.count.toLocaleString()}</strong>
            </button>
          ))}
        </aside>
        <div className="artifact-list">
          {visibleRows.map((item) => {
            const cleanDomain = normalizeLinkDomain(item);
            const cleanUrl = sanitizeLinkUrl(item.url);
            const displayLabel = linkTitle(item);
            const itemKind = classifyLinkArtifactKind(item);
            const target: KnowledgeTarget = {
              targetType: 'link',
              targetId: item.id,
              conversationId: item.conversationId,
              title: displayLabel,
            };
            const isChecked = selectedKeys.has(targetKey(target));
            return (
              <div
                key={item.id}
                className={selected?.id === item.id ? 'artifact-row selected' : 'artifact-row'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onClick={() => setSelectedId(item.id)}
              >
                {onToggleSelectTarget ? (
                  <div
                    className="matrix-checkbox-cell"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelectTarget(target);
                    }}
                    title="Queue link for batch ingestion"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                    />
                  </div>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={14} />{displayLabel}
                  </span>
                  <small>
                    {cleanDomain} · {LINK_CATEGORY_LABELS[itemKind]} · {item.conversationTitle} · {formatDate(item.createTime)}
                  </small>
                  <p>{cleanUrl}</p>
                </div>
              </div>
            );
          })}
          {filtered.length > visibleRows.length ? (
            <p className="list-limit-note">
              Showing first {visibleRows.length.toLocaleString()} matches. Narrow the search, link kind, or domain.
            </p>
          ) : null}
          {!filtered.length ? <p className="empty-note">No links match those filters.</p> : null}
        </div>
        <section className="artifact-detail">
          {selected ? (
            <>
              <div className="artifact-detail-head">
                <div>
                  <span>{selectedDomain} · {LINK_CATEGORY_LABELS[selectedKind]}</span>
                  <h3>{selectedLabel}</h3>
                  <p>{selected.conversationTitle} - {roleLabel(selected.role)} - {formatDate(selected.createTime)}</p>
                </div>
                <div className="artifact-actions">
                  <a
                    className="toolbar-button"
                    href={selectedCleanUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open URL in browser"
                  >
                    <ExternalLink size={16} />
                    Open URL
                  </a>
                  <CopyButton value={selectedCleanUrl} label="Copy URL" />
                  <CopyButton value={`[${selectedLabel}](${selectedCleanUrl})`} label="Copy MD" />
                  <button
                    className="toolbar-button"
                    type="button"
                    onClick={() =>
                      onOrganize({
                        targetType: 'link',
                        targetId: selected.id,
                        conversationId: selected.conversationId,
                        title: selectedLabel,
                      })
                    }
                  >
                    <Tags size={16} />
                    Organize / Rename
                  </button>
                  <button
                    className="toolbar-button active"
                    type="button"
                    onClick={() => onOpenSource(selected)}
                  >
                    <ArrowLeft size={16} />
                    Source
                  </button>
                </div>
              </div>
              <dl className="asset-metadata">
                <dt>Clean URL</dt>
                <dd style={{ wordBreak: 'break-all' }}>
                  <a href={selectedCleanUrl} target="_blank" rel="noreferrer">{selectedCleanUrl}</a>
                </dd>
                <dt>Domain</dt>
                <dd>
                  <button
                    type="button"
                    className="filter-chip active"
                    onClick={() => setDomain(selectedDomain)}
                    title="Filter Link Explorer to this domain"
                  >
                    {selectedDomain}
                  </button>
                </dd>
                <dt>Category</dt>
                <dd>{LINK_CATEGORY_LABELS[selectedKind]}</dd>
                <dt>Stored label</dt>
                <dd style={{ wordBreak: 'break-all' }}>{selected.label}</dd>
                <dt>Conversation</dt>
                <dd>{selected.conversationTitle}</dd>
              </dl>

              {sameUrlLinks.length > 0 ? (
                <div className="dashboard-section" style={{ marginTop: 14 }}>
                  <h3>
                    <Link2 size={15} />
                    Also referenced in {sameUrlLinks.length} other message{sameUrlLinks.length === 1 ? '' : 's'}
                  </h3>
                  <div className="dashboard-list">
                    {sameUrlLinks.map((other) => (
                      <button
                        type="button"
                        key={other.id}
                        onClick={() => onOpenSource(other)}
                        title="Jump to this message in its conversation"
                      >
                        <span>{other.conversationTitle}</span>
                        <small>{roleLabel(other.role)} · {formatDate(other.createTime)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sameDomainLinks.length > 0 ? (
                <div className="dashboard-section" style={{ marginTop: 14 }}>
                  <h3>
                    <Globe size={15} />
                    Other URLs on {selectedDomain} ({sameDomainLinks.length})
                  </h3>
                  <div className="dashboard-list">
                    {sameDomainLinks.map((other) => (
                      <button
                        type="button"
                        key={other.id}
                        onClick={() => setSelectedId(other.id)}
                        title={sanitizeLinkUrl(other.url)}
                      >
                        <span>{linkTitle(other)}</span>
                        <small>{other.conversationTitle} · {formatDate(other.createTime)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty-note">Select a link to inspect its URL, domain, and conversations.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function RightRail({
  index,
  messages,
  bookmarks,
  onSelectBookmark,
}: {
  index: ArchiveIndex;
  messages: ArchiveMessage[];
  bookmarks: MessageBookmark[];
  onSelectBookmark: (bookmark: MessageBookmark) => void;
}) {
  const outline = messages
    .filter((message) => message.text.trim())
    .slice(0, 80)
    .map((message) => ({
      id: message.id,
      role: message.role,
      label: getMessageLabel(message),
      code: message.blocks.filter((block) => block.type === 'code').length,
      assets: message.assets.length,
    }));

  return (
    <aside className="right-rail">
      <h2>Outline</h2>
      {outline.length ? (
        <div className="outline-list">
          {outline.map((item) => (
            <a href={`#message-${item.id}`} key={item.id}>
              <span className={`outline-role ${item.role}`} />
              <span>{item.label}</span>
              {!!(item.code || item.assets) && (
                <small>
                  {item.code ? `${item.code} code` : ''}
                  {item.code && item.assets ? ' / ' : ''}
                  {item.assets ? `${item.assets} media` : ''}
                </small>
              )}
            </a>
          ))}
        </div>
      ) : (
        <p className="empty-note rail">Open a conversation to see its outline.</p>
      )}
      <h2>Bookmarks</h2>
      <div className="outline-list">
        {bookmarks.slice(0, 24).map((bookmark) => {
          const conversation = getConversationById(index, bookmark.conversationId);
          return (
            <button className="bookmark-row" type="button" key={`${bookmark.conversationId}-${bookmark.messageId}`} onClick={() => onSelectBookmark(bookmark)}>
              <span>{bookmark.label}</span>
              <small>{conversation?.title || 'Unavailable in current export'}</small>
            </button>
          );
        })}
        {!bookmarks.length ? <p className="empty-note rail">Bookmark useful messages as you read.</p> : null}
      </div>
    </aside>
  );
}

function Header({
  conversation,
  messages,
  showHidden,
  favorite,
  pinned,
  read,
  backLabel = 'Dashboard',
  onShowHidden,
  onBack,
  onFavorite,
  onPin,
  onRead,
  onOrganize,
  activeTypography,
  onChangeTypography,
}: {
  conversation: ConversationFile | null;
  messages: ArchiveMessage[];
  showHidden: boolean;
  favorite: boolean;
  pinned: boolean;
  read: boolean;
  backLabel?: string;
  onShowHidden: (value: boolean) => void;
  onBack: () => void;
  onFavorite: () => void;
  onPin: () => void;
  onRead: () => void;
  onOrganize: () => void;
  activeTypography?: TypographyOption;
  onChangeTypography?: (option: TypographyOption) => void;
}) {
  const [exported, setExported] = useState(false);
  const allCode = messages
    .flatMap((message) => message.blocks)
    .filter((block): block is Extract<MessageBlock, { type: 'code' }> => block.type === 'code')
    .map((block) => `\`\`\`${block.language}\n${block.text}\n\`\`\``)
    .join('\n\n');

  return (
    <header className="topbar">
      <div>
        <div className="title-line">
          {conversation ? (
            <button className="text-action" type="button" onClick={onBack}>
              <ArrowLeft size={15} />
              {backLabel}
            </button>
          ) : (
            <CalendarDays size={17} />
          )}
          <span>{conversation ? formatDate(getConversationTime(conversation)) : 'Archive dashboard'}</span>
        </div>
        <h2>{conversation?.title || 'Chat Archive'}</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {activeTypography && onChangeTypography ? (
          <div className="typography-switcher-pills" title="Test typography font pairings">
            <span className="typography-switcher-label">
              <Type size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
              Typography:
            </span>
            {TYPOGRAPHY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`typography-btn ${activeTypography === opt.id ? 'active' : ''}`}
                onClick={() => onChangeTypography(opt.id)}
                title={`Sans: ${opt.sans} | Mono: ${opt.mono}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
        {conversation ? (
          <div className="topbar-actions">
          <button className="toolbar-button" type="button" onClick={onOrganize}>
            <Tags size={16} />
            Organize
          </button>
          <button className={favorite ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onFavorite}>
            <Star size={16} />
            Favorite
          </button>
          <button className={pinned ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onPin}>
            <Pin size={16} />
            Pin
          </button>
          <button className={read ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onRead}>
            <Check size={16} />
            {read ? 'Read' : 'Unread'}
          </button>
          <button className="toolbar-button" type="button" onClick={() => onShowHidden(!showHidden)}>
            {showHidden ? <EyeOff size={16} /> : <Eye size={16} />}
            {showHidden ? 'Hide raw' : 'Show raw'}
          </button>
          <CopyButton value={allCode || ''} label="Copy code" />
          <button
            className="toolbar-button"
            type="button"
            onClick={async () => {
              await exportConversationMarkdown(conversation, messages);
              setExported(true);
              window.setTimeout(() => setExported(false), 1600);
            }}
          >
            <Download size={16} />
            {exported ? 'Exported' : 'Export MD'}
          </button>
        </div>
      ) : null}
      </div>
    </header>
  );
}

function KnowledgeOrganizer({
  target,
  state,
  onChange,
  onRenameTarget,
  onClose,
}: {
  target: KnowledgeTarget;
  state: KnowledgeState;
  onChange: (state: KnowledgeState) => void;
  onRenameTarget?: (nextTitle: string) => void;
  onClose: () => void;
}) {
  const key = targetKey(target);
  const currentTitle = resolveTargetTitle(state.customTitles, target.targetType, target.targetId, target.title);
  const [customTitle, setCustomTitle] = useState(currentTitle);
  const [tagName, setTagName] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const linkedTags = new Set(state.tagLinks.filter((item) => targetKey(item) === key).map((item) => item.tagId));
  const linkedCollections = new Set(state.collectionItems.filter((item) => targetKey(item) === key).map((item) => item.collectionId));
  const favorite = state.favorites.some((item) => targetKey(item) === key);
  const notes = state.notes.filter((item) => targetKey(item) === key);
  const hasCustomTitle = Boolean(state.customTitles?.[key]?.trim());

  useEffect(() => {
    setCustomTitle(resolveTargetTitle(state.customTitles, target.targetType, target.targetId, target.title));
  }, [key, state.customTitles, target.targetId, target.targetType, target.title]);

  const effectiveTarget: KnowledgeTarget = {
    ...target,
    title: currentTitle,
  };

  function applyRename(nextRawTitle: string) {
    const trimmed = nextRawTitle.trim();
    const nextCustomTitles = { ...(state.customTitles || {}) };
    if (trimmed) {
      nextCustomTitles[key] = trimmed;
    } else {
      delete nextCustomTitles[key];
    }
    const resolvedTitle = trimmed || target.title;
    onChange({
      ...state,
      customTitles: nextCustomTitles,
      favorites: state.favorites.map((item) =>
        targetKey(item) === key ? { ...item, title: resolvedTitle } : item,
      ),
      tagLinks: state.tagLinks.map((item) =>
        targetKey(item) === key ? { ...item, title: resolvedTitle } : item,
      ),
      collectionItems: state.collectionItems.map((item) =>
        targetKey(item) === key ? { ...item, title: resolvedTitle } : item,
      ),
      notes: state.notes.map((item) =>
        targetKey(item) === key ? { ...item, title: resolvedTitle } : item,
      ),
    });
    onRenameTarget?.(resolvedTitle);
  }

  function toggleTag(tagId: number) {
    const exists = linkedTags.has(tagId);
    onChange({
      ...state,
      tagLinks: exists
        ? state.tagLinks.filter((item) => !(targetKey(item) === key && item.tagId === tagId))
        : [...state.tagLinks, { ...effectiveTarget, tagId }],
    });
  }

  function toggleCollection(collectionId: number) {
    const exists = linkedCollections.has(collectionId);
    onChange({
      ...state,
      collectionItems: exists
        ? state.collectionItems.filter((item) => !(targetKey(item) === key && item.collectionId === collectionId))
        : [...state.collectionItems, { ...effectiveTarget, collectionId, createdAt: Date.now() }],
    });
  }

  return (
    <div className="knowledge-overlay" role="dialog" aria-modal="true" aria-label={`Organize ${currentTitle}`}>
      <section className="knowledge-organizer">
        <div className="knowledge-head">
          <div><span>{target.targetType}</span><h2>{currentTitle}</h2></div>
          <button className="icon-only" type="button" onClick={onClose} title="Close"><X size={18} /></button>
        </div>
        <div className="knowledge-section">
          <h3><Type size={15} />Display name</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyRename(customTitle);
            }}
          >
            <input
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="Give this item a clear custom name..."
              aria-label="Custom display name"
            />
            <button className="toolbar-button active" type="submit">Save name</button>
            {hasCustomTitle ? (
              <button
                className="toolbar-button"
                type="button"
                onClick={() => {
                  setCustomTitle('');
                  applyRename('');
                }}
                title="Reset to default title"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            ) : null}
          </form>
        </div>
        <button
          className={favorite ? 'toolbar-button active' : 'toolbar-button'}
          type="button"
          onClick={() => onChange({
            ...state,
            favorites: favorite
              ? state.favorites.filter((item) => targetKey(item) !== key)
              : [{ ...effectiveTarget, createdAt: Date.now() }, ...state.favorites],
          })}
        ><Star size={16} />{favorite ? 'Favorited' : 'Favorite'}</button>
        <div className="knowledge-section">
          <h3><Tags size={15} />Tags</h3>
          <div className="knowledge-options">
            {state.tags.map((tag) => <button className={linkedTags.has(tag.id) ? 'filter-chip active' : 'filter-chip'} type="button" key={tag.id} onClick={() => toggleTag(tag.id)}>{tag.name}</button>)}
          </div>
          <form onSubmit={(event) => {
            event.preventDefault();
            const name = tagName.trim();
            if (!name || state.tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) return;
            const id = Math.max(0, ...state.tags.map((tag) => tag.id)) + 1;
            onChange({ ...state, tags: [...state.tags, { id, name, color: null }], tagLinks: [...state.tagLinks, { ...effectiveTarget, tagId: id }] });
            setTagName('');
          }}><input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="New tag" /><button className="toolbar-button" type="submit">Add</button></form>
        </div>
        <div className="knowledge-section">
          <h3><FolderKanban size={15} />Collections</h3>
          <div className="knowledge-options">
            {state.collections.map((collection) => <button className={linkedCollections.has(collection.id) ? 'filter-chip active' : 'filter-chip'} type="button" key={collection.id} onClick={() => toggleCollection(collection.id)}>{collection.name}</button>)}
          </div>
          <form onSubmit={(event) => {
            event.preventDefault();
            const name = collectionName.trim();
            if (!name || state.collections.some((collection) => collection.name.toLowerCase() === name.toLowerCase())) return;
            const id = Math.max(0, ...state.collections.map((collection) => collection.id)) + 1;
            onChange({ ...state, collections: [...state.collections, { id, name, createdAt: Date.now() }], collectionItems: [...state.collectionItems, { ...effectiveTarget, collectionId: id, createdAt: Date.now() }] });
            setCollectionName('');
          }}><input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="New collection" /><button className="toolbar-button" type="submit">Add</button></form>
        </div>
        <div className="knowledge-section">
          <h3><NotebookPen size={15} />Notes</h3>
          {notes.map((note) => <div className="knowledge-note" key={note.id}><p>{note.body}</p><button className="icon-only" type="button" title="Delete note" onClick={() => onChange({ ...state, notes: state.notes.filter((item) => item.id !== note.id) })}><X size={14} /></button></div>)}
          <form onSubmit={(event) => {
            event.preventDefault();
            const body = noteBody.trim();
            if (!body) return;
            const now = Date.now();
            onChange({ ...state, notes: [{ ...effectiveTarget, id: Math.max(0, ...state.notes.map((note) => note.id)) + 1, body, createdAt: now, updatedAt: now }, ...state.notes] });
            setNoteBody('');
          }}><textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Attach a note..." /><button className="toolbar-button active" type="submit">Save note</button></form>
        </div>
      </section>
    </div>
  );
}

function KnowledgeView({
  state,
  onOpen,
  onOpenSource,
  onOrganize,
  onExportBundle,
  index,
  artifacts,
  onApplyKnowledgeState,
  selectedTargets,
  onSelectTargets,
  onClearSelection,
  activeTypography,
  onChangeTypography,
}: {
  state: KnowledgeState;
  onOpen: (target: KnowledgeTarget) => void;
  onOpenSource?: (target: KnowledgeTarget) => void;
  onOrganize?: (target: KnowledgeTarget) => void;
  onExportBundle?: (bundleName: string, targets: KnowledgeTarget[], chooseDirectory?: boolean) => void;
  index: ArchiveIndex;
  artifacts: ArtifactIndex | null;
  onApplyKnowledgeState: (state: KnowledgeState) => void;
  selectedTargets: KnowledgeTarget[];
  onSelectTargets: (targets: KnowledgeTarget[] | ((prev: KnowledgeTarget[]) => KnowledgeTarget[])) => void;
  onClearSelection: () => void;
  activeTypography: TypographyOption;
  onChangeTypography: (opt: TypographyOption) => void;
}) {
  const targets = new Map<string, KnowledgeTarget>();
  [...state.favorites, ...state.notes, ...state.collectionItems, ...state.tagLinks].forEach((item) => targets.set(targetKey(item), item));
  const isAvailable = (item: KnowledgeTarget) => {
    if (item.targetType === 'conversation') return index.conversations.some((conversation) => conversation.id === item.targetId);
    return (artifacts?.[item.targetType === 'code' ? 'code' : item.targetType === 'document' ? 'documents' : item.targetType === 'asset' ? 'assets' : 'links'] || []).some((artifact) => artifact.id === item.targetId);
  };
  const targetLabel = (item: KnowledgeTarget) => `${item.targetType}${isAvailable(item) ? '' : ' · unavailable'}`;

  return (
    <section className="explorer knowledge-view" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="explorer-heading">
        <div className="brand-mark large"><FolderKanban size={24} /></div>
        <div>
          <p>Relational Matrix & Knowledge Organization</p>
          <h2>Workspace & Knowledge Base</h2>
        </div>
      </div>
      <div className="knowledge-summary">
        <Stat label="Organized items" value={targets.size.toLocaleString()} />
        <Stat label="Tags" value={state.tags.length.toLocaleString()} />
        <Stat label="Collections" value={state.collections.length.toLocaleString()} />
        <Stat label="Notes" value={state.notes.length.toLocaleString()} />
      </div>

      {/* Embedded Dual-List Relation Matrix (Command Center) */}
      <DualListRelationMatrix
        knowledgeState={state}
        onApplyKnowledgeState={onApplyKnowledgeState}
        selectedTargets={selectedTargets}
        onSelectTargets={onSelectTargets}
        onClearSelection={onClearSelection}
        onOpenTarget={onOpen}
        onOpenTargetSource={onOpenSource}
        onOrganizeTarget={onOrganize}
        onExportBundle={onExportBundle}
        artifacts={artifacts}
        index={index}
        activeTypography={activeTypography}
        onChangeTypography={onChangeTypography}
        viewMode="expanded"
      />

      {/* Dedicated Metadata Tags, Favorites, and Notes */}
      <div className="knowledge-columns" style={{ marginTop: 8 }}>
        <section>
          <h3><Star size={16} />Favorites ({state.favorites.length})</h3>
          {state.favorites.map((item) => (
            <button className="knowledge-item" type="button" key={targetKey(item)} onClick={() => onOpen(item)}>
              <span>{item.title}</span><small>{targetLabel(item)}</small>
            </button>
          ))}
          {!state.favorites.length ? <p className="empty-note">Star useful conversations and artifacts.</p> : null}
        </section>
        <section>
          <h3><Tags size={16} />Metadata Tags ({state.tags.length})</h3>
          <div className="knowledge-options" style={{ padding: '8px 0' }}>
            {state.tags.map((tag) => (
              <span key={tag.id} className="filter-chip active">
                {tag.name} ({state.tagLinks.filter((l) => l.tagId === tag.id).length})
              </span>
            ))}
          </div>
        </section>
        <section>
          <h3><NotebookPen size={16} />Recent notes ({state.notes.length})</h3>
          {state.notes.map((note) => (
            <button className="knowledge-item note" type="button" key={note.id} onClick={() => onOpen(note)}>
              <span>{note.body}</span><small>{note.title}{isAvailable(note) ? '' : ' · unavailable'}</small>
            </button>
          ))}
          {!state.notes.length ? <p className="empty-note">Attach implementation context where it belongs.</p> : null}
        </section>
      </div>
    </section>
  );
}

function ProjectIntelligenceView({
  state,
  busy,
  onScan,
  onConfirm,
  onDismiss,
  onAdd,
  onRemove,
  onOpenConversation,
  index,
}: {
  state: ProjectState;
  busy: boolean;
  onScan: () => void;
  onConfirm: (candidateId: string) => void;
  onDismiss: (candidateId: string) => void;
  onAdd: (projectId: number, conversationId: string) => void;
  onRemove: (projectId: number, conversationId: string) => void;
  onOpenConversation: (conversationId: string) => void;
  index: ArchiveIndex;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const selectedProject = state.projects.find((project) => project.id === selectedProjectId) || null;
  const members = selectedProject ? state.memberships.filter((membership) => membership.projectId === selectedProject.id).filter((membership) => membership.title.toLowerCase().includes(memberQuery.toLowerCase())).sort((a, b) => (index.conversations.find((item) => item.id === b.conversationId)?.updateTime || 0) - (index.conversations.find((item) => item.id === a.conversationId)?.updateTime || 0)) : [];
  const memberIds = new Set(selectedProject ? state.memberships.filter((membership) => membership.projectId === selectedProject.id).map((membership) => membership.conversationId) : []);
  const addable = selectedProject ? index.conversations.filter((conversation) => !memberIds.has(conversation.id) && conversation.title.toLowerCase().includes(memberQuery.toLowerCase())).slice(0, 30) : [];
  return (
    <section className="explorer knowledge-view">
      <div className="explorer-heading"><div className="brand-mark large"><BarChart3 size={24} /></div><div><p>Deterministic local signals, confirmed by you</p><h2>Project Intelligence</h2></div></div>
      <div className="knowledge-summary">
        <Stat label="Confirmed projects" value={state.projects.length.toLocaleString()} />
        <Stat label="Candidates" value={state.candidates.length.toLocaleString()} />
        <Stat label="Last scan" value={state.scanRuns[0] ? new Date(state.scanRuns[0].scannedAt).toLocaleDateString() : 'Not run'} />
      </div>
      <div className="setup-actions"><button className="toolbar-button active" type="button" disabled={busy} onClick={onScan}><Search size={16} />{busy ? 'Scanning…' : 'Scan archive for projects'}</button></div>
      <p className="setup-message">Candidates use repeated meaningful conversation titles plus your tags and collections. Code, attachments, numeric fragments, and boilerplate are excluded. ChatArchive never creates a project until you confirm it.</p>
      {selectedProject ? <section className="knowledge-columns"><section><h3><ArrowLeft size={16} />{selectedProject.name}</h3><button className="toolbar-button" type="button" onClick={() => { setSelectedProjectId(null); setMemberQuery(''); }}>All projects</button><label className="search-box"><Search size={16} /><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search project or archive" /></label><h3>Project conversations</h3>{members.map((membership) => <div className="knowledge-group" key={`${membership.projectId}-${membership.targetId}`}><button type="button" onClick={() => onOpenConversation(membership.conversationId)}>{membership.title}</button><div className="setup-actions"><button className="toolbar-button" type="button" disabled={busy} onClick={() => onRemove(selectedProject.id, membership.conversationId)}>Remove</button></div></div>)}{!members.length ? <p className="empty-note">No project conversations match this search.</p> : null}</section><section><h3><Search size={16} />Add conversations</h3><p className="empty-note">Search the archive above, then add a conversation to this project.</p>{addable.map((conversation) => <div className="knowledge-group" key={conversation.id}><strong>{conversation.title}</strong><div className="setup-actions"><button className="toolbar-button active" type="button" disabled={busy} onClick={() => onAdd(selectedProject.id, conversation.id)}>Add to project</button></div></div>)}</section></section> : <div className="knowledge-columns"><section><h3><BarChart3 size={16} />Candidates</h3>{state.candidates.map((candidate) => <div className="knowledge-group" key={candidate.id}><strong>{candidate.name}</strong><span>{candidate.conversationIds.length} conversations · {candidate.monthCount} months</span><small>{candidate.evidence.map((evidence) => `${evidence.evidenceType}: ${evidence.label}`).slice(0, 3).join(' · ')}</small><div className="setup-actions"><button className="toolbar-button active" type="button" disabled={busy} onClick={() => onConfirm(candidate.id)}>Confirm project</button><button className="toolbar-button" type="button" disabled={busy} onClick={() => onDismiss(candidate.id)}>Dismiss</button></div></div>)}{!state.candidates.length ? <p className="empty-note">Run a scan to find up to 50 high-signal candidates.</p> : null}</section><section><h3><FolderKanban size={16} />Confirmed projects</h3>{state.projects.map((project) => { const memberships = state.memberships.filter((membership) => membership.projectId === project.id); return <div className="knowledge-group" key={project.id}><button type="button" onClick={() => setSelectedProjectId(project.id)}><strong>{project.name}</strong><small>{memberships.length} conversations · updated {new Date(project.updatedAt).toLocaleDateString()}</small></button></div>; })}{!state.projects.length ? <p className="empty-note">Confirm a candidate to create a project workspace.</p> : null}</section></div>}
    </section>
  );
}

function LibraryView({
  status,
  busy,
  message,
  onImport,
  onRestore,
}: {
  status: LibraryStatus | null;
  busy: boolean;
  message: string;
  onImport: () => void;
  onRestore: () => void;
}) {
  const index = status?.index;
  return (
    <section className="explorer library-view">
      <div className="explorer-heading"><div className="brand-mark large"><FileArchive size={24} /></div><div><p>Local archive storage</p><h2>Library</h2></div></div>
      <div className="library-card">
        <span>Library location</span>
        <strong>{status?.libraryPath || 'No folder selected'}</strong>
        <div className="knowledge-summary">
          <Stat label="Conversations" value={(index?.totals.conversations || 0).toLocaleString()} />
          <Stat label="Visible messages" value={(index?.totals.visibleMessages || 0).toLocaleString()} />
          <Stat label="Copied assets" value={(index?.totals.copiedAssets || 0).toLocaleString()} />
        </div>
        <div className="setup-actions">
          <button className="toolbar-button active" type="button" disabled={busy || !status?.configured} onClick={onImport}>
            <Download size={16} />
            {busy ? 'Importing…' : 'Import newer OpenAI export'}
          </button>
          {status?.hasRollback ? <button className="toolbar-button" type="button" disabled={busy} onClick={onRestore}>Restore previous import</button> : null}
        </div>
        <p className="setup-message">A new export refreshes the archive while retaining saved organization. Items no longer in the export stay saved as unavailable.</p>
        {message ? <p className="setup-message" role="status">{message}</p> : null}
      </div>
    </section>
  );
}

function Lightbox({ asset, onClose }: { asset: ArchiveAsset | null; onClose: () => void }) {
  if (!asset) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <button className="lightbox-close" type="button" onClick={onClose} title="Close">
        <X size={20} />
      </button>
      <figure>
        <img src={resolveArchiveAssetUrl(asset.url)} alt={asset.label} />
        <figcaption>
          <ImageIcon size={16} />
          <span>{asset.label}</span>
          <a href={resolveArchiveAssetUrl(asset.url)} target="_blank" rel="noreferrer">Open full size</a>
        </figcaption>
      </figure>
    </div>
  );
}

function restoreConversationListScroll(position: number) {
  window.requestAnimationFrame(() => {
    const list = document.querySelector<HTMLElement>('.conversation-list');
    if (list) list.scrollTop = position;
  });
}

function LibrarySetup({
  status,
  busy,
  message,
  onChooseLibrary,
  onImport,
  onImportFolder,
}: {
  status: LibraryStatus | null;
  busy: boolean;
  message: string;
  onChooseLibrary: () => void;
  onImport: () => void;
  onImportFolder: () => void;
}) {
  const hasLibrary = Boolean(status?.configured);
  const libraryLabel = status?.libraryPath || 'No folder selected';
  return (
    <main className="boot-screen library-setup">
      <Archive size={34} />
      <h1>Set Up ChatArchive</h1>
      <p>Choose where ChatArchive should keep its local library, then import the OpenAI export zip from your ChatGPT data download.</p>
      <div className="setup-steps" aria-label="Setup steps">
        <div className={hasLibrary ? 'setup-step complete' : 'setup-step active'}>
          <span>{hasLibrary ? <Check size={14} /> : '1'}</span>
          <strong>Library location</strong>
        </div>
        <div className={hasLibrary ? 'setup-step active' : 'setup-step'}>
          <span>2</span>
          <strong>OpenAI export zip</strong>
        </div>
      </div>
      <div className="setup-path">
        <span>ChatArchive library</span>
        <strong>{libraryLabel}</strong>
      </div>
      <div className="setup-actions">
        <button className="toolbar-button" type="button" onClick={onChooseLibrary} disabled={busy}>
          <FileImage size={16} />
          Choose library folder
        </button>
        <button className="toolbar-button active" type="button" onClick={onImport} disabled={busy || !status?.configured}>
          <FileArchive size={16} />
          Choose OpenAI zip
        </button>
        <button className="toolbar-button" type="button" onClick={onImportFolder} disabled={busy || !status?.configured}>
          <Download size={16} />
          Use extracted folder
        </button>
      </div>
      {status?.libraryError ? <p className="setup-message">{status.libraryError}</p> : null}
      {message ? <p className="setup-message">{message}</p> : null}
    </main>
  );
}

export default function App() {
  const { index, error, setIndex, setError } = useArchiveIndex();
  const { artifacts, setArtifacts } = useArtifactIndex();
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [viewerState, setViewerState] = useState<ViewerState>(() => readViewerState());
  const [knowledgeState, setKnowledgeState] = useState<KnowledgeState>(() => readKnowledgeState());
  const [projectState, setProjectState] = useState<ProjectState>(() => ({ scanRuns: [], candidates: [], projects: [], aliases: [], memberships: [], exclusions: [], dismissedCandidates: [] }));
  const [projectBusy, setProjectBusy] = useState(false);
  const [organizerTarget, setOrganizerTarget] = useState<KnowledgeTarget | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [conversation, setConversation] = useState<ConversationFile | null>(null);
  const [codeArtifacts, setCodeArtifacts] = useState<CodeArtifact[]>([]);
  const [documentArtifacts, setDocumentArtifacts] = useState<DocumentArtifact[]>([]);
  const [assetArtifacts, setAssetArtifacts] = useState<AssetArtifact[]>([]);
  const [linkArtifacts, setLinkArtifacts] = useState<LinkArtifact[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<ArchiveAsset | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTypography, setActiveTypography] = useState<TypographyOption>(() => {
    try {
      const stored = window.localStorage.getItem('chatArchive.typography') as TypographyOption | null;
      if (stored === 'ibm-plex' || stored === 'inter' || stored === 'source-sans') return stored;
    } catch {}
    return 'ibm-plex';
  });
  const [selectedTargets, setSelectedTargets] = useState<KnowledgeTarget[]>([]);
  const [matrixViewMode, setMatrixViewMode] = useState<'docked' | 'expanded' | 'fullscreen' | 'minimized'>('docked');
  const [returnView, setReturnView] = useState<AppView | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [focusedArtifactId, setFocusedArtifactId] = useState<{ code?: string; document?: string; asset?: string; link?: string }>({});

  useEffect(() => {
    document.documentElement.setAttribute('data-typography', activeTypography);
    try {
      window.localStorage.setItem('chatArchive.typography', activeTypography);
    } catch {}
  }, [activeTypography]);

  function toggleTargetSelection(target: KnowledgeTarget) {
    const key = targetKey(target);
    setSelectedTargets((prev) => {
      const exists = prev.some((item) => targetKey(item) === key);
      if (exists) return prev.filter((item) => targetKey(item) !== key);
      return [...prev, target];
    });
  }

  function handleBatchSelectVisible(items: KnowledgeTarget[]) {
    setSelectedTargets((prev) => {
      const existingKeys = new Set(prev.map(targetKey));
      const additions = items.filter((item) => !existingKeys.has(targetKey(item)));
      return [...prev, ...additions];
    });
  }
  const mainRef = useRef<HTMLElement>(null);
  const saveScrollTimer = useRef<number | null>(null);
  const pendingMessageId = useRef<string | null>(null);
  const scrollPositions = useRef(viewerState.scrollPositions);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    getLibraryStatus()
      .then((status) => {
        if (!status) return;
        setLibraryStatus(status);
        if (status.index) setIndex(status.index);
        if (status.artifacts) setArtifacts(status.artifacts);
        setViewerState(status.viewerState);
        setKnowledgeState(status.knowledgeState.tags.length ? status.knowledgeState : createEmptyKnowledgeState());
        setProjectState(status.projectState);
      })
      .catch((err) => {
        setLibraryStatus({
          configured: false,
          libraryPath: null,
          libraryError: err instanceof Error ? err.message : String(err),
          hasArchive: false,
          hasRollback: false,
          stateMigrated: false,
          index: null,
          artifacts: null,
          viewerState: createEmptyViewerState(),
          knowledgeState: createEmptyKnowledgeState(),
          projectState: {
            scanRuns: [],
            candidates: [],
            projects: [],
            aliases: [],
            memberships: [],
            exclusions: [],
            dismissedCandidates: [],
          },
        });
        setLibraryMessage(err instanceof Error ? err.message : String(err));
      });
  }, [setArtifacts, setError, setIndex]);

  useEffect(() => {
    if (!artifacts && !isTauriRuntime()) {
      setCodeArtifacts([]);
      setDocumentArtifacts([]);
      setAssetArtifacts([]);
      setLinkArtifacts([]);
      return;
    }
    if (!isTauriRuntime()) {
      setCodeArtifacts(artifacts?.code || []);
      setDocumentArtifacts(artifacts?.documents || []);
      setAssetArtifacts(artifacts?.assets || []);
      setLinkArtifacts(artifacts?.links || []);
      return;
    }
    if (!libraryStatus?.configured || !artifacts) {
      setCodeArtifacts([]);
      setDocumentArtifacts([]);
      setAssetArtifacts([]);
      setLinkArtifacts([]);
      return;
    }
    Promise.all([loadCodeArtifacts(), loadDocumentArtifacts(), loadAssetArtifacts(), loadLinkArtifacts()])
      .then(([code, documents, assets, links]) => {
        setCodeArtifacts(code);
        setDocumentArtifacts(documents);
        setAssetArtifacts(assets);
        setLinkArtifacts(links);
      })
      .catch((err) => {
        console.error('Could not load artifact explorers', err);
        setCodeArtifacts(artifacts?.code || []);
        setDocumentArtifacts(artifacts?.documents || []);
        setAssetArtifacts(artifacts?.assets || []);
        setLinkArtifacts(artifacts?.links || []);
      });
  }, [artifacts, libraryStatus?.configured]);

  useEffect(() => {
    if (!index) return;
    setViewerState((state) => pruneViewerState(state, index.conversations));
  }, [index]);

  useEffect(() => {
    if (!isTauriRuntime()) window.localStorage.setItem(VIEWER_STATE_KEY, JSON.stringify(viewerState));
    scrollPositions.current = viewerState.scrollPositions;
  }, [viewerState]);

  useEffect(() => {
    if (!isTauriRuntime()) window.localStorage.setItem(KNOWLEDGE_STATE_KEY, JSON.stringify(knowledgeState));
  }, [knowledgeState]);

  useEffect(() => {
    if (!isTauriRuntime() || !index || !libraryStatus || libraryStatus.stateMigrated) return;
    const localState = readViewerState();
    saveViewerState(pruneViewerState(localState, index.conversations))
      .then((state) => {
        setViewerState(state);
        setLibraryStatus((current) => (current ? { ...current, stateMigrated: true, viewerState: state } : current));
      })
      .catch((err) => console.error('Could not migrate browser viewer state', err));
  }, [index, libraryStatus]);

  useEffect(() => {
    if (!selected) {
      setConversation(null);
      return;
    }
    setConversation(null);
    loadConversation(selected.id)
      .then((data) => {
        setConversation(data);
        window.setTimeout(() => {
          const messageId = pendingMessageId.current;
          if (messageId) {
            pendingMessageId.current = null;
            document.getElementById(`message-${messageId}`)?.scrollIntoView({ block: 'start' });
          } else {
            mainRef.current?.scrollTo({ top: scrollPositions.current[selected.id] || 0 });
          }
        }, 0);
      })
      .catch((err) => {
        console.error(err);
        setConversation({ ...selected, messages: [] });
      });
  }, [selected]);

  const artifactSearchData = useMemo(() => buildArtifactSearchData(artifacts), [artifacts]);

  const filtered = useMemo(() => {
    if (!index) return { conversations: [], regexError: '' };
    return filterConversations(index.conversations, filters, viewerState.pinned, artifactSearchData);
  }, [artifactSearchData, filters, index, viewerState.pinned]);

  const messages = useMemo(() => getVisibleMessages(conversation, showHidden), [conversation, showHidden]);
  const displayedMessages = useMemo(() => filterMessagesForAssetSearch(messages, filters), [filters, messages]);
  const allBookmarks = useMemo(
    () => Object.values(viewerState.messageBookmarks).flat().sort((a, b) => b.createdAt - a.createdAt),
    [viewerState.messageBookmarks],
  );
  const conversationBookmarks = conversation ? viewerState.messageBookmarks[conversation.id] || [] : [];
  const bookmarkedMessageIds = new Set(conversationBookmarks.map((bookmark) => bookmark.messageId));

  function applyViewerState(updater: (state: ViewerState) => ViewerState) {
    setViewerState((state) => {
      const next = updater(state);
      if (isTauriRuntime()) {
        saveViewerState(next)
          .then(setViewerState)
          .catch((err) => console.error('Could not save viewer state', err));
      }
      return next;
    });
  }

  function applyKnowledgeState(next: KnowledgeState) {
    setKnowledgeState(next);
    if (isTauriRuntime()) {
      saveKnowledgeState(next)
        .then(setKnowledgeState)
        .catch((err) => console.error('Could not save knowledge state', err));
    }
  }

  async function scanProjectCandidates() {
    setProjectBusy(true);
    try {
      const next = await scanProjects();
      if (next) setProjectState(next);
    } catch (err) {
      setLibraryMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setProjectBusy(false);
    }
  }

  async function mutateProject(action: () => Promise<ProjectState | null>) {
    setProjectBusy(true);
    try {
      const next = await action();
      if (next) setProjectState(next);
    } catch (err) {
      setLibraryMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setProjectBusy(false);
    }
  }

  async function finishOpenAiImport(importer: (libraryPath?: string | null) => Promise<Awaited<ReturnType<typeof importOpenAiExport>>>) {
    setLibraryBusy(true);
    setLibraryMessage('Importing OpenAI export...');
    try {
      const result = await importer(libraryStatus?.libraryPath);
      if (result) {
        setIndex(result.index);
        setArtifacts(result.artifacts);
        const status = await getLibraryStatus();
        if (status) {
          setLibraryStatus(status);
          setViewerState(status.viewerState);
          setKnowledgeState(status.knowledgeState.tags.length ? status.knowledgeState : createEmptyKnowledgeState());
          setProjectState(status.projectState);
        }
        setLibraryMessage(`Imported ${result.index.totals.conversations.toLocaleString()} conversations. Preserved ${result.reconciliation.preservedItems.toLocaleString()} saved items; ${result.reconciliation.unavailableItems.toLocaleString()} are unavailable in this export.`);
      } else {
        setLibraryMessage('');
      }
    } catch (err) {
      setLibraryMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLibraryBusy(false);
    }
  }

  async function restoreImport() {
    if (!window.confirm('Restore the previous import? Your current archive and saved library state will become the new rollback copy.')) return;
    setLibraryBusy(true);
    setLibraryMessage('Restoring previous import...');
    try {
      const result = await restorePreviousImport();
      setIndex(result.index);
      setArtifacts(result.artifacts);
      const status = await getLibraryStatus();
      if (status) {
        setLibraryStatus(status);
        setViewerState(status.viewerState);
        setKnowledgeState(status.knowledgeState.tags.length ? status.knowledgeState : createEmptyKnowledgeState());
        setProjectState(status.projectState);
      }
      setSelected(null);
      setConversation(null);
      setActiveView('library');
      setLibraryMessage(`Restored ${result.index.totals.conversations.toLocaleString()} conversations from the previous import.`);
    } catch (err) {
      setLibraryMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLibraryBusy(false);
    }
  }

  function openConversation(next: ConversationSummary) {
    setSelected(next);
    setActiveView('conversation');
    applyViewerState((state) => ({
      ...state,
      recentlyViewed: [
        { conversationId: next.id, viewedAt: Date.now() },
        ...state.recentlyViewed.filter((item) => item.conversationId !== next.id),
      ].slice(0, 12),
    }));
  }

  function mutateConversationRecord(key: 'favorites' | 'pinned') {
    if (!selected) return;
    const listScroll = key === 'pinned' ? document.querySelector<HTMLElement>('.conversation-list')?.scrollTop ?? null : null;
    if (isTauriRuntime()) {
      const action = key === 'favorites' ? toggleFavorite : togglePin;
      action(selected.id).then((state) => {
        if (state) setViewerState(state);
        if (listScroll !== null) restoreConversationListScroll(listScroll);
      }).catch((err) => console.error(err));
      return;
    }
    setViewerState((state) => {
      const record = { ...state[key] };
      if (record[selected.id]) delete record[selected.id];
      else record[selected.id] = { conversationId: selected.id, createdAt: Date.now() };
      return { ...state, [key]: record };
    });
    if (listScroll !== null) restoreConversationListScroll(listScroll);
  }

  function toggleRead() {
    if (!selected) return;
    if (isTauriRuntime()) {
      markRead(selected.id, !viewerState.read[selected.id]).then((state) => state && setViewerState(state)).catch((err) => console.error(err));
      return;
    }
    setViewerState((state) => {
      const read = { ...state.read };
      if (read[selected.id]) delete read[selected.id];
      else read[selected.id] = Date.now();
      return { ...state, read };
    });
  }

  function toggleMessageBookmark(message: ArchiveMessage) {
    if (!selected) return;
    const current = viewerState.messageBookmarks[selected.id] || [];
    const exists = current.some((bookmark) => bookmark.messageId === message.id);
    const bookmark = {
      conversationId: selected.id,
      messageId: message.id,
      label: getMessageLabel(message),
      createdAt: Date.now(),
    };
    if (isTauriRuntime()) {
      saveMessageBookmark(bookmark, !exists).then((state) => state && setViewerState(state)).catch((err) => console.error(err));
      return;
    }
    setViewerState((state) => {
      const current = state.messageBookmarks[selected.id] || [];
      const exists = current.some((bookmark) => bookmark.messageId === message.id);
      return {
        ...state,
        messageBookmarks: {
          ...state.messageBookmarks,
          [selected.id]: exists
            ? current.filter((bookmark) => bookmark.messageId !== message.id)
            : [
                ...current,
                {
                  conversationId: bookmark.conversationId,
                  messageId: bookmark.messageId,
                  label: bookmark.label,
                  createdAt: bookmark.createdAt,
                },
              ],
        },
      };
    });
  }

  async function copyMessageAnchor(message: ArchiveMessage) {
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#message-${message.id}`);
  }

  function selectBookmark(bookmark: MessageBookmark) {
    if (!index) return;
    const next = getConversationById(index, bookmark.conversationId);
    if (!next) return;
    pendingMessageId.current = bookmark.messageId;
    setHighlightedMessageId(bookmark.messageId);
    openConversation(next);
  }

  function openArtifactSource(artifact: CodeArtifact | DocumentArtifact | AssetArtifact | LinkArtifact, originView?: AppView) {
    if (!index) return;
    const next = getConversationById(index, artifact.conversationId);
    if (!next) return;
    const sourceView = originView ?? activeView;
    if (sourceView !== 'conversation') {
      setReturnView(sourceView);
    }
    pendingMessageId.current = artifact.messageId;
    setHighlightedMessageId(artifact.messageId);
    openConversation(next);
  }

  function openTargetFromMatrix(target: KnowledgeTarget) {
    if (!index) return;
    if (target.targetType === 'conversation') {
      const conv = index.conversations.find((c) => c.id === target.targetId || c.id === target.conversationId);
      if (conv) {
        setReturnView(activeView !== 'conversation' ? activeView : null);
        setHighlightedMessageId(null);
        openConversation(conv);
      }
      return;
    }
    if (target.targetType === 'code') {
      setFocusedArtifactId((prev) => ({ ...prev, code: target.targetId }));
      setSelected(null);
      setActiveView('code');
    } else if (target.targetType === 'document') {
      setFocusedArtifactId((prev) => ({ ...prev, document: target.targetId }));
      setSelected(null);
      setActiveView('documents');
    } else if (target.targetType === 'asset') {
      setFocusedArtifactId((prev) => ({ ...prev, asset: target.targetId }));
      setSelected(null);
      setActiveView('assets');
    } else if (target.targetType === 'link') {
      setFocusedArtifactId((prev) => ({ ...prev, link: target.targetId }));
      setSelected(null);
      setActiveView('links');
    } else {
      setOrganizerTarget(target);
    }
  }

  function openTargetSourceFromMatrix(target: KnowledgeTarget) {
    if (!index) return;
    const origin = activeView !== 'conversation' ? activeView : returnView || 'knowledge';
    if (target.targetType === 'code') {
      const found = codeArtifacts.find((item) => item.id === target.targetId) || artifacts?.code.find((item) => item.id === target.targetId);
      if (found) {
        openArtifactSource(found, origin);
        return;
      }
    } else if (target.targetType === 'document') {
      const found = documentArtifacts.find((item) => item.id === target.targetId) || artifacts?.documents.find((item) => item.id === target.targetId);
      if (found) {
        openArtifactSource(found, origin);
        return;
      }
    } else if (target.targetType === 'asset') {
      const found = assetArtifacts.find((item) => item.id === target.targetId) || artifacts?.assets.find((item) => item.id === target.targetId);
      if (found) {
        openArtifactSource(found, origin);
        return;
      }
    } else if (target.targetType === 'link') {
      const found = linkArtifacts.find((item) => item.id === target.targetId) || artifacts?.links.find((item) => item.id === target.targetId);
      if (found) {
        openArtifactSource(found, origin);
        return;
      }
    }
    const conv = getConversationById(index, target.conversationId || target.targetId);
    if (conv) {
      setReturnView(origin);
      setHighlightedMessageId(null);
      openConversation(conv);
    }
  }

  async function handleExportBundle(bundleName: string, targets: KnowledgeTarget[], chooseDirectory = true) {
    if (!targets.length) return;
    try {
      const summary = await exportRecoveryBundle(bundleName, targets, chooseDirectory);
      if (summary) {
        setLibraryMessage(
          `Exported recovery bundle "${summary.bundleName}" (${summary.exportedCount} items exported${summary.skippedCount ? `, ${summary.skippedCount} skipped` : ''}) to ${summary.bundlePath}`,
        );
      }
    } catch (err) {
      setLibraryMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const returnViewLabel =
    returnView === 'code'
      ? 'Back to Code Explorer'
      : returnView === 'documents'
        ? 'Back to Documents'
        : returnView === 'assets'
          ? 'Back to Assets'
          : returnView === 'links'
            ? 'Back to Link Explorer'
            : returnView === 'knowledge'
              ? 'Back to Knowledge'
              : returnView === 'projects'
                ? 'Back to Projects'
                : 'Dashboard';

  function handleReaderScroll() {
    if (!selected || !mainRef.current) return;
    if (saveScrollTimer.current) window.clearTimeout(saveScrollTimer.current);
    const top = mainRef.current.scrollTop;
    saveScrollTimer.current = window.setTimeout(() => {
      if (isTauriRuntime()) {
        saveScrollPosition(selected.id, top).then((state) => state && setViewerState(state)).catch((err) => console.error(err));
        return;
      }
      setViewerState((state) => ({
        ...state,
        scrollPositions: { ...state.scrollPositions, [selected.id]: top },
      }));
    }, 250);
  }

  if (error) {
    return (
      <main className="boot-screen">
        <Archive size={34} />
        <h1>Archive data is not ready</h1>
        <p>{error}</p>
        <code>pnpm ingest</code>
      </main>
    );
  }

  if (isTauriRuntime() && (!libraryStatus?.configured || !index)) {
    return (
      <LibrarySetup
        status={libraryStatus}
        busy={libraryBusy}
        message={libraryMessage}
        onChooseLibrary={async () => {
          setLibraryBusy(true);
          setLibraryMessage('');
          try {
            const next = await selectLibraryFolder();
            if (next) setLibraryStatus(next);
          } catch (err) {
            setLibraryMessage(err instanceof Error ? err.message : String(err));
          } finally {
            setLibraryBusy(false);
          }
        }}
        onImport={() => void finishOpenAiImport(importOpenAiExport)}
        onImportFolder={() => void finishOpenAiImport(importOpenAiExportFolder)}
      />
    );
  }

  if (!index) {
    return (
      <main className="boot-screen">
        <Archive size={34} />
        <h1>Loading archive</h1>
      </main>
    );
  }

  return (
    <div className={activeView === 'code' || activeView === 'documents' || activeView === 'assets' || activeView === 'links' || activeView === 'knowledge' || activeView === 'projects' || activeView === 'library' ? 'app-shell explorer-open' : 'app-shell'}>
      <Sidebar
        index={index}
        conversations={filtered.conversations}
        selectedId={selected?.id || null}
        activeView={activeView}
        filters={filters}
        regexError={filtered.regexError}
        viewerState={viewerState}
        savedSearches={knowledgeState.savedSearches}
        artifactSearchData={artifactSearchData}
        onFilters={setFilters}
        onSaveSearch={(currentFilters) => {
          const parts: string[] = [];
          if (currentFilters.query.trim()) parts.push(`"${currentFilters.query.trim()}"`);
          if (currentFilters.fieldScope !== 'all') parts.push(`Scope: ${currentFilters.fieldScope}`);
          if (currentFilters.regex) parts.push('Regex');
          if (currentFilters.startDate || currentFilters.endDate) {
            parts.push(`${currentFilters.startDate || '…'} → ${currentFilters.endDate || '…'}`);
          }
          if (currentFilters.minMessages || currentFilters.maxMessages) {
            parts.push(`Msgs: ${currentFilters.minMessages || '0'}-${currentFilters.maxMessages || '∞'}`);
          }
          const name = parts.join(' · ') || `Saved filter ${(knowledgeState.savedSearches?.length || 0) + 1}`;
          const nextSaved: SavedSearch[] = [
            ...(knowledgeState.savedSearches || []).filter((item) => item.name !== name),
            {
              id: `saved-${Date.now()}`,
              name,
              ...currentFilters,
              createdAt: Date.now(),
            },
          ];
          applyKnowledgeState({
            ...knowledgeState,
            savedSearches: nextSaved,
          });
        }}
        onDeleteSavedSearch={(id) => {
          applyKnowledgeState({
            ...knowledgeState,
            savedSearches: (knowledgeState.savedSearches || []).filter((item) => item.id !== id),
          });
        }}
        onQueueConversations={(convs) => {
          handleBatchSelectVisible(
            convs.map((c) => ({
              targetType: 'conversation',
              targetId: c.id,
              conversationId: c.id,
              title: resolveTargetTitle(knowledgeState.customTitles, 'conversation', c.id, c.title),
            })),
          );
        }}
        onSelect={openConversation}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onHome={() => {
          setSelected(null);
          setActiveView('dashboard');
        }}
        onCodeExplorer={() => {
          setSelected(null);
          setActiveView('code');
        }}
        onDocumentExplorer={() => {
          setSelected(null);
          setActiveView('documents');
        }}
        onAssetExplorer={() => {
          setSelected(null);
          setActiveView('assets');
        }}
        onLinkExplorer={() => {
          setSelected(null);
          setActiveView('links');
        }}
        onKnowledge={() => {
          setSelected(null);
          setActiveView('knowledge');
        }}
        onProjects={() => {
          setSelected(null);
          setActiveView('projects');
        }}
        onLibrary={() => {
          setSelected(null);
          setActiveView('library');
        }}
      />
      <main className="reader" ref={mainRef} onScroll={handleReaderScroll}>
        <Header
          conversation={conversation}
          messages={messages}
          showHidden={showHidden}
          favorite={Boolean(selected && viewerState.favorites[selected.id])}
          pinned={Boolean(selected && viewerState.pinned[selected.id])}
          read={Boolean(selected && viewerState.read[selected.id])}
          backLabel={returnViewLabel}
          onShowHidden={setShowHidden}
          onBack={() => {
            setSelected(null);
            setHighlightedMessageId(null);
            if (returnView) {
              setActiveView(returnView);
              setReturnView(null);
            }
          }}
          onFavorite={() => mutateConversationRecord('favorites')}
          onPin={() => mutateConversationRecord('pinned')}
          onRead={toggleRead}
          onOrganize={() => selected && setOrganizerTarget({ targetType: 'conversation', targetId: selected.id, conversationId: selected.id, title: selected.title })}
          activeTypography={activeTypography}
          onChangeTypography={setActiveTypography}
        />
        <div className="archive-status">
          <span>{index.sourcePath}</span>
          <span>{index.totals.visibleMessages.toLocaleString()} visible messages</span>
          <span>{index.totals.missingAssets.toLocaleString()} unresolved assets</span>
          <span>
            <ListFilter size={13} />
            {filtered.conversations.length.toLocaleString()} filtered
          </span>
          {libraryMessage ? <span style={{ color: 'var(--accent)', fontWeight: 550 }}>{libraryMessage}</span> : null}
        </div>
        {activeView === 'conversation' && selected ? (
          conversation ? (
            <section className="conversation-flow">
              {displayedMessages.map((message) => (
                <MessageView
                  message={message}
                  key={message.id}
                  bookmarked={bookmarkedMessageIds.has(message.id)}
                  highlighted={highlightedMessageId === message.id}
                  onBookmark={toggleMessageBookmark}
                  onCopyAnchor={copyMessageAnchor}
                  onOpenAsset={setLightboxAsset}
                />
              ))}
              {!displayedMessages.length ? <div className="conversation-loading">No messages match the current asset search.</div> : null}
            </section>
          ) : (
            <div className="conversation-loading">Loading conversation...</div>
          )
        ) : activeView === 'code' ? (
          <CodeExplorer
            artifacts={codeArtifacts}
            customTitles={knowledgeState.customTitles}
            onOpenSource={(artifact) => openArtifactSource(artifact, 'code')}
            onOrganize={setOrganizerTarget}
            selectedTargets={selectedTargets}
            onToggleSelectTarget={toggleTargetSelection}
            onSelectAllVisible={handleBatchSelectVisible}
            onClearSelection={() => setSelectedTargets([])}
            initialSelectedId={focusedArtifactId.code}
          />
        ) : activeView === 'documents' ? (
          <DocumentExplorer
            artifacts={documentArtifacts}
            customTitles={knowledgeState.customTitles}
            onOpenSource={(artifact) => openArtifactSource(artifact, 'documents')}
            onOrganize={setOrganizerTarget}
            selectedTargets={selectedTargets}
            onToggleSelectTarget={toggleTargetSelection}
            onSelectAllVisible={handleBatchSelectVisible}
            onClearSelection={() => setSelectedTargets([])}
            initialSelectedId={focusedArtifactId.document}
          />
        ) : activeView === 'assets' ? (
          <AssetExplorer
            artifacts={assetArtifacts}
            customTitles={knowledgeState.customTitles}
            assetTriage={knowledgeState.assetTriage}
            onUpdateAssetTriage={(assetId, status) => {
              applyKnowledgeState({
                ...knowledgeState,
                assetTriage: {
                  ...(knowledgeState.assetTriage || {}),
                  [assetId]: status,
                },
              });
            }}
            onBulkTriageMissingDalle={() => {
              const nextTriage: Record<string, AssetTriageStatus> = {
                ...(knowledgeState.assetTriage || {}),
              };
              assetArtifacts.forEach((asset) => {
                if (asset.kind === 'missing' && classifyUnresolvedAssetCause(asset) === 'dalle_webp') {
                  nextTriage[asset.id] = 'unrecoverable';
                }
              });
              applyKnowledgeState({
                ...knowledgeState,
                assetTriage: nextTriage,
              });
            }}
            onOpenSource={(artifact) => openArtifactSource(artifact, 'assets')}
            onOpenAsset={setLightboxAsset}
            onOrganize={setOrganizerTarget}
            selectedTargets={selectedTargets}
            onToggleSelectTarget={toggleTargetSelection}
            onSelectAllVisible={handleBatchSelectVisible}
            onClearSelection={() => setSelectedTargets([])}
            initialSelectedId={focusedArtifactId.asset}
          />
        ) : activeView === 'links' ? (
          <LinkExplorer
            artifacts={linkArtifacts}
            customTitles={knowledgeState.customTitles}
            onOpenSource={(artifact) => openArtifactSource(artifact, 'links')}
            onOrganize={setOrganizerTarget}
            selectedTargets={selectedTargets}
            onToggleSelectTarget={toggleTargetSelection}
            onSelectAllVisible={handleBatchSelectVisible}
            onClearSelection={() => setSelectedTargets([])}
            initialSelectedId={focusedArtifactId.link}
          />
        ) : activeView === 'knowledge' ? (
          <KnowledgeView
            state={knowledgeState}
            onOpen={openTargetFromMatrix}
            onOpenSource={openTargetSourceFromMatrix}
            onOrganize={setOrganizerTarget}
            onExportBundle={(bundleName, targets, chooseDirectory) => void handleExportBundle(bundleName, targets, chooseDirectory)}
            index={index}
            artifacts={artifacts}
            onApplyKnowledgeState={applyKnowledgeState}
            selectedTargets={selectedTargets}
            onSelectTargets={setSelectedTargets}
            onClearSelection={() => setSelectedTargets([])}
            activeTypography={activeTypography}
            onChangeTypography={setActiveTypography}
          />
        ) : activeView === 'projects' ? (
          <ProjectIntelligenceView state={projectState} index={index} busy={projectBusy} onScan={() => void scanProjectCandidates()} onConfirm={(candidateId) => void mutateProject(() => confirmProjectCandidate(candidateId))} onDismiss={(candidateId) => void mutateProject(() => dismissProjectCandidate(candidateId))} onAdd={(projectId, conversationId) => void mutateProject(() => addProjectConversation(projectId, conversationId))} onRemove={(projectId, conversationId) => void mutateProject(() => removeProjectConversation(projectId, conversationId))} onOpenConversation={(conversationId) => {
            const target = index.conversations.find((item) => item.id === conversationId);
            if (target) {
              setReturnView('projects');
              setHighlightedMessageId(null);
              openConversation(target);
            }
          }} />
        ) : activeView === 'library' ? (
          <LibraryView
            status={libraryStatus}
            busy={libraryBusy}
            message={libraryMessage}
            onImport={() => void finishOpenAiImport(importOpenAiExport)}
            onRestore={() => void restoreImport()}
          />
        ) : (
          <Dashboard index={index} artifacts={artifacts} viewerState={viewerState} onSelect={(conv) => {
            setReturnView(null);
            setHighlightedMessageId(null);
            openConversation(conv);
          }} />
        )}
        {/* Sweeping Bottom Section: Dual-List Relation Matrix Command Center */}
        {activeView !== 'knowledge' ? (
          <DualListRelationMatrix
            knowledgeState={knowledgeState}
            onApplyKnowledgeState={applyKnowledgeState}
            selectedTargets={selectedTargets}
            onSelectTargets={setSelectedTargets}
            onClearSelection={() => setSelectedTargets([])}
            onOpenTarget={openTargetFromMatrix}
            onOpenTargetSource={openTargetSourceFromMatrix}
            onOrganizeTarget={setOrganizerTarget}
            onExportBundle={(bundleName, targets, chooseDirectory) => void handleExportBundle(bundleName, targets, chooseDirectory)}
            artifacts={artifacts}
            index={index}
            activeTypography={activeTypography}
            onChangeTypography={setActiveTypography}
            viewMode={matrixViewMode}
            onChangeViewMode={setMatrixViewMode}
          />
        ) : null}
      </main>
      <RightRail index={index} messages={displayedMessages} bookmarks={allBookmarks} onSelectBookmark={selectBookmark} />
      <Lightbox asset={lightboxAsset} onClose={() => setLightboxAsset(null)} />
      {organizerTarget ? (
        <KnowledgeOrganizer
          target={organizerTarget}
          state={knowledgeState}
          onChange={applyKnowledgeState}
          onRenameTarget={(nextTitle) => {
            setOrganizerTarget((prev) => (prev ? { ...prev, title: nextTitle } : null));
            setSelectedTargets((prev) =>
              prev.map((item) =>
                targetKey(item) === targetKey(organizerTarget) ? { ...item, title: nextTitle } : item,
              ),
            );
          }}
          onClose={() => setOrganizerTarget(null)}
        />
      ) : null}
    </div>
  );
}
