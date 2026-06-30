use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveIndex {
    pub generated_at: String,
    pub source_path: String,
    pub totals: ArchiveTotals,
    pub conversations: Vec<ConversationSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveTotals {
    pub conversations: usize,
    pub visible_messages: usize,
    pub hidden_messages: usize,
    pub assets: usize,
    pub copied_assets: usize,
    pub missing_assets: usize,
    pub external_assets: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub create_time: Option<f64>,
    pub update_time: Option<f64>,
    pub create_iso: Option<String>,
    pub update_iso: Option<String>,
    pub archived: bool,
    pub starred: bool,
    pub message_count: usize,
    pub hidden_message_count: usize,
    pub code_block_count: usize,
    pub asset_count: usize,
    pub external_asset_count: usize,
    pub snippet: String,
    pub search_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationFile {
    #[serde(flatten)]
    pub summary: ConversationSummary,
    pub source_index: usize,
    pub messages: Vec<ArchiveMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMessage {
    pub id: String,
    pub role: String,
    pub author_name: Option<String>,
    pub create_time: Option<f64>,
    pub status: Option<String>,
    pub content_type: String,
    pub text: String,
    pub blocks: Vec<MessageBlock>,
    pub assets: Vec<ArchiveAsset>,
    pub references: Vec<ArchiveReference>,
    pub hidden: bool,
    pub raw_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MessageBlock {
    #[serde(rename = "markdown")]
    Markdown { text: String },
    #[serde(rename = "code")]
    Code { language: String, text: String },
    #[serde(rename = "execution")]
    Execution { label: String, text: String },
    #[serde(rename = "notice")]
    Notice { text: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveAsset {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub url: String,
    pub original: String,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveReference {
    pub r#type: String,
    pub label: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactIndex {
    pub generated_at: String,
    pub source_path: String,
    pub totals: ArtifactTotals,
    pub language_counts: BTreeMap<String, usize>,
    pub code: Vec<CodeArtifact>,
    pub assets: Vec<AssetArtifact>,
    pub documents: Vec<DocumentArtifact>,
    pub links: Vec<LinkArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactTotals {
    pub code: usize,
    pub assets: usize,
    pub documents: usize,
    pub links: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseArtifact {
    pub id: String,
    pub conversation_id: String,
    pub conversation_title: String,
    pub message_id: String,
    pub create_time: Option<f64>,
    pub role: String,
    pub search_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeArtifact {
    #[serde(flatten)]
    pub base: BaseArtifact,
    pub r#type: String,
    pub language: String,
    pub preview: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetArtifact {
    #[serde(flatten)]
    pub base: BaseArtifact,
    pub r#type: String,
    pub kind: String,
    pub label: String,
    pub original: String,
    pub url: String,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentArtifact {
    #[serde(flatten)]
    pub base: BaseArtifact,
    pub r#type: String,
    pub document_type: String,
    pub title: String,
    pub preview: String,
    #[serde(default)]
    pub original: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkArtifact {
    #[serde(flatten)]
    pub base: BaseArtifact,
    pub r#type: String,
    pub label: String,
    pub url: String,
    pub domain: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBookmark {
    pub conversation_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageBookmark {
    pub conversation_id: String,
    pub message_id: String,
    pub label: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewedConversation {
    pub conversation_id: String,
    pub viewed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerState {
    pub version: i64,
    pub favorites: BTreeMap<String, ConversationBookmark>,
    pub pinned: BTreeMap<String, ConversationBookmark>,
    pub read: BTreeMap<String, i64>,
    pub recently_viewed: Vec<ViewedConversation>,
    pub message_bookmarks: BTreeMap<String, Vec<MessageBookmark>>,
    pub scroll_positions: BTreeMap<String, f64>,
}

impl Default for ViewerState {
    fn default() -> Self {
        Self {
            version: 1,
            favorites: BTreeMap::new(),
            pinned: BTreeMap::new(),
            read: BTreeMap::new(),
            recently_viewed: Vec::new(),
            message_bookmarks: BTreeMap::new(),
            scroll_positions: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStatus {
    pub configured: bool,
    pub library_path: Option<String>,
    pub has_archive: bool,
    pub state_migrated: bool,
    pub index: Option<ArchiveIndex>,
    pub artifacts: Option<ArtifactIndex>,
    pub viewer_state: ViewerState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub library_path: String,
    pub archive_id: String,
    pub manifest_path: String,
    pub index: ArchiveIndex,
    pub artifacts: ArtifactIndex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub query: String,
    pub field_scope: String,
    pub regex: bool,
    pub start_date: String,
    pub end_date: String,
    pub min_messages: String,
    pub max_messages: String,
}
