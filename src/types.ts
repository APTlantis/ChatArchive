export type Role = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';

export interface ArchiveIndex {
  generatedAt: string;
  sourcePath: string;
  totals: {
    conversations: number;
    visibleMessages: number;
    hiddenMessages: number;
    assets: number;
    copiedAssets: number;
    missingAssets: number;
    externalAssets: number;
  };
  conversations: ConversationSummary[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  slug: string;
  createTime: number | null;
  updateTime: number | null;
  archived: boolean;
  starred: boolean;
  messageCount: number;
  hiddenMessageCount: number;
  codeBlockCount: number;
  assetCount: number;
  externalAssetCount: number;
  snippet: string;
  searchText: string;
}

export interface ConversationFile extends ConversationSummary {
  messages: ArchiveMessage[];
}

export interface ArchiveMessage {
  id: string;
  role: Role;
  authorName: string | null;
  createTime: number | null;
  status: string | null;
  contentType: string;
  text: string;
  blocks: MessageBlock[];
  assets: ArchiveAsset[];
  references: ArchiveReference[];
  hidden: boolean;
  rawType: string;
}

export type MessageBlock =
  | { type: 'markdown'; text: string }
  | { type: 'code'; language: string; text: string }
  | { type: 'execution'; label: string; text: string }
  | { type: 'notice'; text: string };

export interface ArchiveAsset {
  id: string;
  kind: 'local' | 'external' | 'missing';
  label: string;
  url: string;
  original: string;
  width?: number;
  height?: number;
}

export interface ArchiveReference {
  type: string;
  label: string;
  url?: string;
}

export type SearchFieldScope = 'all' | 'title' | 'content' | 'code' | 'raw' | 'assets' | 'documents' | 'links';

export interface SearchFilters {
  query: string;
  fieldScope: SearchFieldScope;
  regex: boolean;
  startDate: string;
  endDate: string;
  minMessages: string;
  maxMessages: string;
}

export interface ConversationBookmark {
  conversationId: string;
  createdAt: number;
}

export interface MessageBookmark {
  conversationId: string;
  messageId: string;
  label: string;
  createdAt: number;
}

export interface ViewedConversation {
  conversationId: string;
  viewedAt: number;
}

export interface ViewerState {
  version: 1;
  favorites: Record<string, ConversationBookmark>;
  pinned: Record<string, ConversationBookmark>;
  read: Record<string, number>;
  recentlyViewed: ViewedConversation[];
  messageBookmarks: Record<string, MessageBookmark[]>;
  scrollPositions: Record<string, number>;
}

export interface ArtifactIndex {
  generatedAt: string;
  sourcePath: string;
  totals: {
    code: number;
    assets: number;
    documents: number;
    links: number;
  };
  languageCounts: Record<string, number>;
  code: CodeArtifact[];
  assets: AssetArtifact[];
  documents: DocumentArtifact[];
  links: LinkArtifact[];
}

export interface BaseArtifact {
  id: string;
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  createTime: number | null;
  role: Role;
  searchText: string;
}

export interface CodeArtifact extends BaseArtifact {
  type: 'code';
  language: string;
  preview: string;
  text: string;
}

export interface AssetArtifact extends BaseArtifact {
  type: 'asset';
  kind: 'local' | 'external' | 'missing';
  label: string;
  original: string;
  url: string;
  width?: number;
  height?: number;
}

export interface DocumentArtifact extends BaseArtifact {
  type: 'document';
  documentType: string;
  title: string;
  preview: string;
}

export interface LinkArtifact extends BaseArtifact {
  type: 'link';
  label: string;
  url: string;
  domain: string;
}
