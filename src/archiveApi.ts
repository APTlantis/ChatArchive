import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog';
import type {
  ArchiveIndex,
  ArtifactIndex,
  CodeArtifact,
  DocumentArtifact,
  AssetArtifact,
  LinkArtifact,
  ConversationFile,
  SearchFilters,
  ViewerState,
  MessageBookmark,
  KnowledgeState,
  KnowledgeTarget,
  ProjectState,
  RecoveryBundleSummary,
  ExternalFileStatus,
  ExportPreviewSummary,
} from './types';

const INDEX_URL = '/archive-data/index.json';
const ARTIFACTS_URL = '/archive-data/artifacts.json';

export interface LibraryStatus {
  configured: boolean;
  libraryPath: string | null;
  libraryError: string | null;
  hasArchive: boolean;
  hasRollback: boolean;
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
  reconciliation: {
    preservedItems: number;
    unavailableItems: number;
  };
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
  const selected = await open({
    multiple: false,
    title: 'Choose OpenAI export zip',
    filters: [{ name: 'OpenAI export', extensions: ['zip'] }],
  });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<ImportSummary>('import_openai_export', { sourcePath: selected, libraryPath: libraryPath || null });
}

export async function importOpenAiExportFolder(libraryPath?: string | null) {
  if (!isTauriRuntime()) throw new Error('Import is only available in the Tauri desktop app.');
  const selected = await open({ directory: true, multiple: false, title: 'Choose extracted OpenAI export folder' });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<ImportSummary>('import_openai_export', { sourcePath: selected, libraryPath: libraryPath || null });
}

export async function restorePreviousImport() {
  if (!isTauriRuntime()) throw new Error('Restore is only available in the Tauri desktop app.');
  return invoke<ImportSummary>('restore_previous_import');
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

export async function loadLinkArtifacts(): Promise<LinkArtifact[]> {
  if (isTauriRuntime()) return invoke<LinkArtifact[]>('list_link_artifacts');
  const artifacts = await loadArtifactIndex();
  return artifacts?.links || [];
}

export async function loadDocumentArtifactContent(artifact: DocumentArtifact): Promise<string> {
  if (isTauriRuntime()) return invoke<string>('get_document_artifact_content', { artifactId: artifact.id });
  if (artifact.url && artifact.url.startsWith('/')) {
    try {
      const res = await fetch(artifact.url);
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) return text;
      }
    } catch {
      // Fall through to conversation message lookup
    }
  }
  try {
    const conversation = await loadConversation(artifact.conversationId);
    const msgIndex = conversation.messages.findIndex((item) => item.id === artifact.messageId);
    const message = msgIndex >= 0 ? conversation.messages[msgIndex] : undefined;
    const normalizedPreview = artifact.preview.replace(/\s+/g, ' ').trim();
    const match = message?.blocks.find(
      (block) => block.type === 'markdown' && block.text.replace(/\s+/g, ' ').trim().startsWith(normalizedPreview),
    );
    if (match && match.type === 'markdown') return match.text;
    if (message) {
      const sections: string[] = [
        `# ${artifact.title}\n\n> **Conversation:** ${artifact.conversationTitle}`,
      ];
      if (message.text.trim()) {
        sections.push(`### ${message.role === 'user' ? 'User' : 'Assistant'} message\n\n${message.text.trim()}`);
      }
      const nextMsg = conversation.messages[msgIndex + 1];
      if (nextMsg && !nextMsg.hidden && nextMsg.text.trim()) {
        sections.push(`### Follow-up (${nextMsg.role === 'user' ? 'User' : 'Assistant'})\n\n${nextMsg.text.trim()}`);
      }
      return sections.join('\n\n---\n\n');
    }
  } catch {
    // Fall through
  }
  return `# ${artifact.title}\n\nThis is an attached document. Open it in the desktop archive to preview or export the original file.\n\nPointer: \`${artifact.original || artifact.url || 'unknown'}\``;
}

export async function exportDocumentMarkdown(artifact: DocumentArtifact, markdown: string) {
  if (!isTauriRuntime()) return null;
  return invoke<string>('export_document_markdown', { artifactId: artifact.id, markdown });
}

export async function exportCodeSnippet(code: string, defaultFileName: string) {
  if (!isTauriRuntime()) return null;
  const targetPath = await saveDialog({ title: 'Export code snippet', defaultPath: defaultFileName });
  if (!targetPath) return null;
  return invoke<string>('export_code_snippet', { targetPath, code });
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

export async function confirmProjectCandidate(candidateId: string) {
  if (!isTauriRuntime()) return null;
  return invoke<ProjectState>('confirm_project_candidate', { candidateId });
}

export async function dismissProjectCandidate(candidateId: string) {
  if (!isTauriRuntime()) return null;
  return invoke<ProjectState>('dismiss_project_candidate', { candidateId });
}

export async function addProjectConversation(projectId: number, conversationId: string) {
  if (!isTauriRuntime()) return null;
  return invoke<ProjectState>('add_project_conversation', { projectId, conversationId });
}

export async function removeProjectConversation(projectId: number, conversationId: string) {
  if (!isTauriRuntime()) return null;
  return invoke<ProjectState>('remove_project_conversation', { projectId, conversationId });
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

export async function exportRecoveryBundle(
  bundleName: string,
  targets: KnowledgeTarget[],
  chooseDirectory = false,
): Promise<RecoveryBundleSummary | null> {
  if (!isTauriRuntime()) return null;
  let destinationDir: string | null = null;
  if (chooseDirectory) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: `Choose export folder for "${bundleName}" recovery bundle`,
    });
    if (!selected || Array.isArray(selected)) return null;
    destinationDir = selected;
  }
  return invoke<RecoveryBundleSummary>('export_recovery_bundle', {
    bundleName,
    targets,
    destinationDir,
  });
}

export function resolveArchiveAssetUrl(url: string) {
  if (url.startsWith('local-file://')) {
    return convertFileSrc(url.slice('local-file://'.length));
  }
  return url;
}

export async function previewOpenAiExport(): Promise<ExportPreviewSummary | null> {
  if (!isTauriRuntime()) return null;
  const selected = await open({
    multiple: false,
    title: 'Choose OpenAI export zip for dry-run preview',
    filters: [{ name: 'OpenAI export', extensions: ['zip'] }],
  });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<ExportPreviewSummary>('preview_openai_export', { sourcePath: selected });
}

export async function importOpenAiExportByPath(sourcePath: string, libraryPath?: string | null) {
  if (!isTauriRuntime()) throw new Error('Import is only available in the Tauri desktop app.');
  return invoke<ImportSummary>('import_openai_export', {
    sourcePath,
    libraryPath: libraryPath || null,
  });
}

export async function pickExternalFileReferences(directory = false): Promise<KnowledgeTarget[]> {
  if (!isTauriRuntime()) return [];
  const selected = await open({
    directory,
    multiple: !directory,
    title: directory ? 'Reference external local folder' : 'Reference external local file(s)',
  });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  return paths.map((p) => {
    const normalized = p.replace(/\\/g, '/');
    const baseName = normalized.split('/').filter(Boolean).pop() || p;
    return {
      targetType: 'external_file',
      targetId: p,
      conversationId: 'external',
      title: baseName,
    };
  });
}

export async function inspectExternalFiles(paths: string[]): Promise<ExternalFileStatus[]> {
  if (!isTauriRuntime() || !paths.length) return [];
  return invoke<ExternalFileStatus[]>('inspect_external_files', { paths });
}

export async function revealExternalPath(path: string, revealOnly = true): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('reveal_external_path', { path, revealOnly });
}
