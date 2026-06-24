import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import '../prism/prism.js';
import '../prism/prism.css';
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
  Eye,
  EyeOff,
  FileImage,
  Home,
  Image as ImageIcon,
  ListFilter,
  PanelLeft,
  Pin,
  Regex,
  RotateCcw,
  Search,
  Star,
  X,
} from 'lucide-react';
import type {
  ArchiveAsset,
  ArtifactIndex,
  ArchiveIndex,
  ArchiveMessage,
  ConversationFile,
  ConversationSummary,
  MessageBlock,
  MessageBookmark,
  SearchFieldScope,
  SearchFilters,
  ViewerState,
} from './types';

const INDEX_URL = '/archive-data/index.json';
const ARTIFACTS_URL = '/archive-data/artifacts.json';
const VIEWER_STATE_KEY = 'chatArchive.viewerState.v1';
const FIELD_SCOPES: SearchFieldScope[] = ['all', 'title', 'content', 'code', 'raw', 'assets', 'documents', 'links'];
const Prism = globalThis.Prism;
const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  fieldScope: 'all',
  regex: false,
  startDate: '',
  endDate: '',
  minMessages: '',
  maxMessages: '',
};

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

function getConversationById(index: ArchiveIndex, id: string) {
  return index.conversations.find((conversation) => conversation.id === id) || null;
}

function useArchiveIndex() {
  const [index, setIndex] = useState<ArchiveIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${INDEX_URL}`);
        return response.json();
      })
      .then(setIndex)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return { index, error };
}

function useArtifactIndex() {
  const [artifacts, setArtifacts] = useState<ArtifactIndex | null>(null);

  useEffect(() => {
    fetch(ARTIFACTS_URL)
      .then((response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then(setArtifacts)
      .catch(() => setArtifacts(null));
  }, []);

  return artifacts;
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

function filterMessagesForAssetSearch(messages: ArchiveMessage[], filters: SearchFilters) {
  if (filters.fieldScope !== 'assets' || !filters.query.trim() || filters.regex) return messages;
  const terms = tokenizeQuery(filters.query).filter((token) => !token.value.includes(':'));
  if (!terms.length) return messages;
  return messages.filter((message) => {
    const assetText = message.assets.map((asset) => `${asset.label} ${asset.original} ${asset.kind}`).join('\n');
    return terms.every((token) => textMatches(assetText, token.value, token.phrase));
  });
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
            <img src={asset.url} alt={asset.label} loading="lazy" />
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
  onBookmark,
  onCopyAnchor,
  onOpenAsset,
}: {
  message: ArchiveMessage;
  bookmarked: boolean;
  onBookmark: (message: ArchiveMessage) => void;
  onCopyAnchor: (message: ArchiveMessage) => void;
  onOpenAsset: (asset: ArchiveAsset) => void;
}) {
  return (
    <article className={`message message-${message.role}${message.hidden ? ' hidden-message' : ''}`} id={`message-${message.id}`}>
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

function exportConversationMarkdown(conversation: ConversationFile, messages: ArchiveMessage[]) {
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

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
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
  filters,
  regexError,
  viewerState,
  collapsed,
  onFilters,
  onSelect,
  onToggleCollapsed,
  onHome,
}: {
  index: ArchiveIndex;
  conversations: ConversationSummary[];
  selectedId: string | null;
  filters: SearchFilters;
  regexError: string;
  viewerState: ViewerState;
  collapsed: boolean;
  onFilters: (filters: SearchFilters) => void;
  onSelect: (conversation: ConversationSummary) => void;
  onToggleCollapsed: () => void;
  onHome: () => void;
}) {
  function updateFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    onFilters({ ...filters, [key]: value });
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark">
          <Archive size={18} />
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
            <button className="toolbar-button" type="button" onClick={onHome}>
              <Home size={16} />
              Home
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
            <button
              className={filters.regex ? 'filter-chip active' : 'filter-chip'}
              type="button"
              onClick={() => updateFilter('regex', !filters.regex)}
            >
              <Regex size={13} />
              Regex
            </button>
            <span>{regexError ? 'Invalid regex' : `${conversations.length.toLocaleString()} shown`}</span>
          </div>
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
                {grouped.map((conversation) => (
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
                  </button>
                ))}
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
          <BarChart3 size={24} />
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
  const topLanguages = artifacts
    ? Object.entries(artifacts.languageCounts)
        .slice(0, 10)
        .map(([language, count]) => ({ language, count }))
    : [];

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
              <small>{conversation?.title || 'Unknown conversation'}</small>
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
  onShowHidden,
  onBack,
  onFavorite,
  onPin,
  onRead,
}: {
  conversation: ConversationFile | null;
  messages: ArchiveMessage[];
  showHidden: boolean;
  favorite: boolean;
  pinned: boolean;
  read: boolean;
  onShowHidden: (value: boolean) => void;
  onBack: () => void;
  onFavorite: () => void;
  onPin: () => void;
  onRead: () => void;
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
              Dashboard
            </button>
          ) : (
            <CalendarDays size={17} />
          )}
          <span>{conversation ? formatDate(getConversationTime(conversation)) : 'Archive dashboard'}</span>
        </div>
        <h2>{conversation?.title || 'Chat Archive'}</h2>
      </div>
      {conversation ? (
        <div className="topbar-actions">
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
            onClick={() => {
              exportConversationMarkdown(conversation, messages);
              setExported(true);
              window.setTimeout(() => setExported(false), 1600);
            }}
          >
            <Download size={16} />
            {exported ? 'Exported' : 'Export MD'}
          </button>
        </div>
      ) : null}
    </header>
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
        <img src={asset.url} alt={asset.label} />
        <figcaption>
          <ImageIcon size={16} />
          <span>{asset.label}</span>
          <a href={asset.url} target="_blank" rel="noreferrer">Open full size</a>
        </figcaption>
      </figure>
    </div>
  );
}

export default function App() {
  const { index, error } = useArchiveIndex();
  const artifacts = useArtifactIndex();
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [viewerState, setViewerState] = useState<ViewerState>(() => readViewerState());
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [conversation, setConversation] = useState<ConversationFile | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<ArchiveAsset | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const saveScrollTimer = useRef<number | null>(null);
  const pendingMessageId = useRef<string | null>(null);
  const scrollPositions = useRef(viewerState.scrollPositions);

  useEffect(() => {
    if (!index) return;
    setViewerState((state) => pruneViewerState(state, index.conversations));
  }, [index]);

  useEffect(() => {
    window.localStorage.setItem(VIEWER_STATE_KEY, JSON.stringify(viewerState));
    scrollPositions.current = viewerState.scrollPositions;
  }, [viewerState]);

  useEffect(() => {
    if (!selected) {
      setConversation(null);
      return;
    }
    setConversation(null);
    fetch(`/archive-data/conversations/${selected.id}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load conversation ${selected.id}`);
        return response.json();
      })
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

  function openConversation(next: ConversationSummary) {
    setSelected(next);
    setViewerState((state) => ({
      ...state,
      recentlyViewed: [
        { conversationId: next.id, viewedAt: Date.now() },
        ...state.recentlyViewed.filter((item) => item.conversationId !== next.id),
      ].slice(0, 12),
    }));
  }

  function mutateConversationRecord(key: 'favorites' | 'pinned') {
    if (!selected) return;
    setViewerState((state) => {
      const record = { ...state[key] };
      if (record[selected.id]) delete record[selected.id];
      else record[selected.id] = { conversationId: selected.id, createdAt: Date.now() };
      return { ...state, [key]: record };
    });
  }

  function toggleRead() {
    if (!selected) return;
    setViewerState((state) => {
      const read = { ...state.read };
      if (read[selected.id]) delete read[selected.id];
      else read[selected.id] = Date.now();
      return { ...state, read };
    });
  }

  function toggleMessageBookmark(message: ArchiveMessage) {
    if (!selected) return;
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
                  conversationId: selected.id,
                  messageId: message.id,
                  label: getMessageLabel(message),
                  createdAt: Date.now(),
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
    openConversation(next);
  }

  function handleReaderScroll() {
    if (!selected || !mainRef.current) return;
    if (saveScrollTimer.current) window.clearTimeout(saveScrollTimer.current);
    const top = mainRef.current.scrollTop;
    saveScrollTimer.current = window.setTimeout(() => {
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
        <code>npm run ingest</code>
      </main>
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
    <div className="app-shell">
      <Sidebar
        index={index}
        conversations={filtered.conversations}
        selectedId={selected?.id || null}
        filters={filters}
        regexError={filtered.regexError}
        viewerState={viewerState}
        onFilters={setFilters}
        onSelect={openConversation}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onHome={() => setSelected(null)}
      />
      <main className="reader" ref={mainRef} onScroll={handleReaderScroll}>
        <Header
          conversation={conversation}
          messages={messages}
          showHidden={showHidden}
          favorite={Boolean(selected && viewerState.favorites[selected.id])}
          pinned={Boolean(selected && viewerState.pinned[selected.id])}
          read={Boolean(selected && viewerState.read[selected.id])}
          onShowHidden={setShowHidden}
          onBack={() => setSelected(null)}
          onFavorite={() => mutateConversationRecord('favorites')}
          onPin={() => mutateConversationRecord('pinned')}
          onRead={toggleRead}
        />
        <div className="archive-status">
          <span>{index.sourcePath}</span>
          <span>{index.totals.visibleMessages.toLocaleString()} visible messages</span>
          <span>{index.totals.missingAssets.toLocaleString()} unresolved assets</span>
          <span>
            <ListFilter size={13} />
            {filtered.conversations.length.toLocaleString()} filtered
          </span>
        </div>
        {selected ? (
          conversation ? (
            <section className="conversation-flow">
              {displayedMessages.map((message) => (
                <MessageView
                  message={message}
                  key={message.id}
                  bookmarked={bookmarkedMessageIds.has(message.id)}
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
        ) : (
          <Dashboard index={index} artifacts={artifacts} viewerState={viewerState} onSelect={openConversation} />
        )}
      </main>
      <RightRail index={index} messages={displayedMessages} bookmarks={allBookmarks} onSelectBookmark={selectBookmark} />
      <Lightbox asset={lightboxAsset} onClose={() => setLightboxAsset(null)} />
    </div>
  );
}
