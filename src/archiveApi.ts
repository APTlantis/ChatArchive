import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  ArchiveIndex,
  ArtifactIndex,
  CodeArtifact,
  DocumentArtifact,
  AssetArtifact,
  ConversationFile,
  SearchFilters,
  ViewerState,
  MessageBookmark,
  KnowledgeState,
  ProjectState,
} from './types';

const INDEX_URL = '/archive-data/index.json';
const ARTIFACTS_URL = '/archive-data/artifacts.json';

export interface LibraryStatus {
  configured: boolean;
  libraryPath: string | null;
  hasArchive: boolean;
  stateMigrated: boolean;
  index: ArchiveIndex | null;
  artifacts: ArtifactIndex | null;
  viewerState: ViewerState;
  knowledgeState: KnowledgeState;
  projectState: ProjectState;
}

export interface ImportSummary {
  libraryPath: string;
  archiveId: string;
  manifestPath: string;
  index: ArchiveIndex;
  artifacts: ArtifactIndex;
}

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

export async function getLibraryStatus(): Promise<LibraryStatus | null> {
  if (!isTauriRuntime()) return null;
  return invoke<LibraryStatus>('get_library_status');
}

export async function selectLibraryFolder() {
  if (!isTauriRuntime()) return null;
  const selected = await open({ directory: true, multiple: false, title: 'Choose ChatArchive library folder' });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<LibraryStatus>('select_library_folder', { libraryPath: selected });
}

export async function importOpenAiExport(libraryPath?: string | null) {
  if (!isTauriRuntime()) throw new Error('Import is only available in the Tauri desktop app.');
  const selected = await open({ directory: true, multiple: false, title: 'Choose OpenAI export folder' });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<ImportSummary>('import_openai_export', { sourcePath: selected, libraryPath: libraryPath || null });
}

export async function loadArchiveIndex(): Promise<ArchiveIndex> {
  if (isTauriRuntime()) return invoke<ArchiveIndex>('list_conversations');
  return fetchJson<ArchiveIndex>(INDEX_URL);
}

export async function loadArtifactIndex(): Promise<ArtifactIndex | null> {
  if (isTauriRuntime()) return invoke<ArtifactIndex | null>('get_artifact_index');
  try {
    return await fetchJson<ArtifactIndex>(ARTIFACTS_URL);
  } catch {
    return null;
  }
}

export async function loadCodeArtifacts(): Promise<CodeArtifact[]> {
  if (isTauriRuntime()) return invoke<CodeArtifact[]>('list_code_artifacts');
  const artifacts = await loadArtifactIndex();
  return artifacts?.code || [];
}

export async function loadDocumentArtifacts(): Promise<DocumentArtifact[]> {
  if (isTauriRuntime()) return invoke<DocumentArtifact[]>('list_document_artifacts');
  const artifacts = await loadArtifactIndex();
  return artifacts?.documents || [];
}

export async function loadAssetArtifacts(): Promise<AssetArtifact[]> {
  if (isTauriRuntime()) return invoke<AssetArtifact[]>('list_asset_artifacts');
  const artifacts = await loadArtifactIndex();
  return artifacts?.assets || [];
}

export async function loadDocumentArtifactContent(artifact: DocumentArtifact): Promise<string> {
  if (isTauriRuntime()) return invoke<string>('get_document_artifact_content', { artifactId: artifact.id });
  if (artifact.url) {
    return `# ${artifact.title}\n\nThis is an attached document. Open it in the desktop archive to preview or export the original file.\n\nPointer: \`${artifact.original || artifact.url}\``;
  }
  const conversation = await loadConversation(artifact.conversationId);
  const message = conversation.messages.find((item) => item.id === artifact.messageId);
  const normalizedPreview = artifact.preview.replace(/\s+/g, ' ').trim();
  const match = message?.blocks.find(
    (block) => block.type === 'markdown' && block.text.replace(/\s+/g, ' ').trim().startsWith(normalizedPreview),
  );
  if (!match || match.type !== 'markdown') throw new Error('Document source block was not found.');
  return match.text;
}

export async function exportDocumentMarkdown(artifact: DocumentArtifact, markdown: string) {
  if (!isTauriRuntime()) return null;
  return invoke<string>('export_document_markdown', { artifactId: artifact.id, markdown });
}

export async function loadConversation(conversationId: string): Promise<ConversationFile> {
  if (isTauriRuntime()) return invoke<ConversationFile>('get_conversation', { conversationId });
  return fetchJson<ConversationFile>(`/archive-data/conversations/${conversationId}.json`);
}

export async function searchConversations(filters: SearchFilters) {
  if (!isTauriRuntime()) return null;
  return invoke('search_conversations', { filters });
}

export async function saveViewerState(viewerState: ViewerState) {
  if (!isTauriRuntime()) return viewerState;
  return invoke<ViewerState>('update_viewer_state', { viewerState });
}

export async function saveKnowledgeState(knowledgeState: KnowledgeState) {
  if (!isTauriRuntime()) return knowledgeState;
  return invoke<KnowledgeState>('update_knowledge_state', { knowledgeState });
}

export async function scanProjects() {
  if (!isTauriRuntime()) return null;
  return invoke<ProjectState>('scan_projects');
}

export async function saveProjectState(projectState: ProjectState) {
  if (!isTauriRuntime()) return projectState;
  return invoke<ProjectState>('update_project_state', { projectState });
}

export async function toggleFavorite(conversationId: string) {
  if (!isTauriRuntime()) return null;
  return invoke<ViewerState>('toggle_favorite', { conversationId });
}

export async function togglePin(conversationId: string) {
  if (!isTauriRuntime()) return null;
  return invoke<ViewerState>('toggle_pin', { conversationId });
}

export async function markRead(conversationId: string, read: boolean) {
  if (!isTauriRuntime()) return null;
  return invoke<ViewerState>('mark_read', { conversationId, read });
}

export async function saveMessageBookmark(bookmark: MessageBookmark, bookmarked: boolean) {
  if (!isTauriRuntime()) return null;
  return invoke<ViewerState>('save_message_bookmark', { bookmark, bookmarked });
}

export async function saveScrollPosition(conversationId: string, position: number) {
  if (!isTauriRuntime()) return null;
  return invoke<ViewerState>('save_scroll_position', { conversationId, position });
}

export async function exportConversationMarkdown(conversationId: string, markdown: string) {
  if (!isTauriRuntime()) return null;
  return invoke<string>('export_conversation_markdown', { conversationId, markdown });
}

export function resolveArchiveAssetUrl(url: string) {
  if (url.startsWith('local-file://')) {
    return convertFileSrc(url.slice('local-file://'.length));
  }
  return url;
}
