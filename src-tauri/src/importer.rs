use crate::db::AppResult;
use crate::models::*;
use chrono::{TimeZone, Utc};
use regex::Regex;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use url::Url;
use walkdir::WalkDir;

const MAX_SEARCH_TEXT: usize = 24_000;
const MAX_ARTIFACT_TEXT: usize = 12_000;
static FILE_ID_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"file[-_][A-Za-z0-9]{8,}").unwrap());
static HASH_PREFIX_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-f0-9]{12,20}").unwrap());
static EXTERNAL_IMAGE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\.(png|jpe?g|webp|gif|avif)(\?|$)").unwrap());

pub trait ProviderImporter {
    fn import(&self, source_dir: &Path, library_dir: &Path) -> AppResult<ImportBuild>;
}

pub struct OpenAiImporter;

pub struct ImportBuild {
    pub archive_id: String,
    pub archive_path: PathBuf,
    pub manifest_path: PathBuf,
    pub index: ArchiveIndex,
    pub artifacts: ArtifactIndex,
    pub conversations: Vec<ConversationFile>,
}

#[derive(Default)]
struct AssetIndex {
    by_key: HashMap<String, Vec<AssetCandidate>>,
    image_files: Vec<AssetCandidate>,
}

#[derive(Clone, Debug)]
struct AssetCandidate {
    source_path: PathBuf,
    original_name: String,
}

struct SourceConversation {
    value: Value,
    source_index: usize,
}

#[derive(Default)]
struct ImportManifest {
    generated_at: String,
    source_path: String,
    source_image_files: usize,
    copied_assets: Vec<Value>,
    missing_pointers: Vec<String>,
    external_urls: Vec<String>,
    unresolved_pointers: BTreeSet<String>,
    external_set: BTreeSet<String>,
}

#[derive(Default)]
struct ArtifactBuckets {
    code: Vec<CodeArtifact>,
    assets: Vec<AssetArtifact>,
    documents: Vec<DocumentArtifact>,
    links: Vec<LinkArtifact>,
}

impl ProviderImporter for OpenAiImporter {
    fn import(&self, source_dir: &Path, library_dir: &Path) -> AppResult<ImportBuild> {
        let (conversations, raw_files) = load_openai_conversations(source_dir)?;

        let archive_id = archive_id(source_dir);
        let archive_path = library_dir.join("archives").join(&archive_id);
        let staging_path = library_dir
            .join("archives")
            .join(format!(".{archive_id}.staging"));
        if staging_path.exists() {
            fs::remove_dir_all(&staging_path)
                .map_err(|err| format!("Could not remove old staging import: {err}"))?;
        }
        fs::create_dir_all(staging_path.join("raw"))
            .map_err(|err| format!("Could not create raw folder: {err}"))?;
        fs::create_dir_all(staging_path.join("conversations"))
            .map_err(|err| format!("Could not create conversations folder: {err}"))?;
        fs::create_dir_all(staging_path.join("assets"))
            .map_err(|err| format!("Could not create assets folder: {err}"))?;
        fs::create_dir_all(staging_path.join("documents"))
            .map_err(|err| format!("Could not create documents folder: {err}"))?;
        fs::create_dir_all(staging_path.join("exports"))
            .map_err(|err| format!("Could not create exports folder: {err}"))?;
        for raw_file in &raw_files {
            if let Some(name) = raw_file.file_name() {
                fs::copy(raw_file, staging_path.join("raw").join(name)).map_err(|err| {
                    format!(
                        "Could not copy raw export file {}: {err}",
                        raw_file.display()
                    )
                })?;
            }
        }

        let export_files = collect_export_files(source_dir)?;
        let asset_index = build_asset_index(source_dir, &export_files)?;
        let mut copied = BTreeSet::new();
        let mut manifest = ImportManifest {
            generated_at: Utc::now().to_rfc3339(),
            source_path: source_dir.to_string_lossy().to_string(),
            source_image_files: asset_index.image_files.len(),
            ..Default::default()
        };

        let mut summaries = Vec::new();
        let mut output_conversations = Vec::new();
        let mut artifact_index = ArtifactBuckets::default();
        let mut visible_messages = 0usize;
        let mut hidden_messages = 0usize;
        let mut missing_assets = 0usize;
        let mut external_assets = 0usize;

        for conversation in &conversations {
            let nodes = ordered_nodes(&conversation.value);
            let messages = nodes
                .iter()
                .map(|node| {
                    normalize_message(
                        node,
                        source_dir,
                        &staging_path,
                        &asset_index,
                        &mut copied,
                        &mut manifest,
                    )
                })
                .collect::<AppResult<Vec<_>>>()?;
            let summary = summarize_conversation(&conversation.value, &messages);
            visible_messages += summary.message_count;
            hidden_messages += summary.hidden_message_count;
            missing_assets += messages
                .iter()
                .flat_map(|message| &message.assets)
                .filter(|asset| asset.kind == "missing")
                .count();
            external_assets += summary.external_asset_count;

            let file = ConversationFile {
                summary: summary.clone(),
                source_index: conversation.source_index,
                messages,
            };
            let text = serde_json::to_string_pretty(&file)
                .map_err(|err| format!("Could not encode conversation JSON: {err}"))?;
            fs::write(
                staging_path
                    .join("conversations")
                    .join(format!("{}.json", summary.id)),
                text,
            )
            .map_err(|err| format!("Could not write conversation JSON: {err}"))?;
            let artifacts = build_conversation_artifacts(&summary, &file.messages);
            artifact_index.code.extend(artifacts.code);
            artifact_index.assets.extend(artifacts.assets);
            artifact_index.documents.extend(artifacts.documents);
            artifact_index.links.extend(artifacts.links);
            summaries.push(summary);
            output_conversations.push(file);
        }

        summaries.sort_by(|a, b| {
            conversation_time(b)
                .partial_cmp(&conversation_time(a))
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let generated_at = Utc::now().to_rfc3339();
        let archive_index = ArchiveIndex {
            generated_at: generated_at.clone(),
            source_path: source_dir.to_string_lossy().to_string(),
            totals: ArchiveTotals {
                conversations: summaries.len(),
                visible_messages,
                hidden_messages,
                assets: copied.len() + external_assets + missing_assets,
                copied_assets: copied.len(),
                missing_assets,
                external_assets,
            },
            conversations: summaries,
        };

        let mut language_counts: BTreeMap<String, usize> = BTreeMap::new();
        for item in &artifact_index.code {
            *language_counts.entry(item.language.clone()).or_default() += 1;
        }
        let mut language_counts_vec = language_counts.into_iter().collect::<Vec<_>>();
        language_counts_vec.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let language_counts = language_counts_vec.into_iter().collect::<BTreeMap<_, _>>();

        let artifacts = ArtifactIndex {
            generated_at,
            source_path: source_dir.to_string_lossy().to_string(),
            totals: ArtifactTotals {
                code: artifact_index.code.len(),
                assets: artifact_index.assets.len(),
                documents: artifact_index.documents.len(),
                links: artifact_index.links.len(),
            },
            language_counts,
            code: artifact_index.code,
            assets: artifact_index.assets,
            documents: artifact_index.documents,
            links: artifact_index.links,
        };

        for file in &copied {
            let candidate = asset_index
                .image_files
                .iter()
                .find(|item| &item.source_path == file)
                .cloned()
                .unwrap_or_else(|| AssetCandidate {
                    source_path: file.clone(),
                    original_name: file
                        .file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("asset")
                        .to_string(),
                });
            manifest.copied_assets.push(json!({
        "source": relative_string(source_dir, file),
        "originalName": candidate.original_name,
        "url": local_file_url(&staging_path.join("assets").join(export_asset_name(&candidate))),
      }));
        }
        manifest.missing_pointers = manifest.unresolved_pointers.iter().cloned().collect();
        manifest.external_urls = manifest.external_set.iter().cloned().collect();

        fs::write(
            staging_path.join("manifest.json"),
            serde_json::to_string_pretty(&json!({
              "generatedAt": manifest.generated_at,
              "sourcePath": manifest.source_path,
              "sourceImageFiles": manifest.source_image_files,
              "copiedAssets": manifest.copied_assets,
              "missingPointers": manifest.missing_pointers,
              "externalUrls": manifest.external_urls,
            }))
            .map_err(|err| err.to_string())?,
        )
        .map_err(|err| format!("Could not write manifest: {err}"))?;

        if archive_path.exists() {
            fs::remove_dir_all(&archive_path)
                .map_err(|err| format!("Could not remove previous archive folder: {err}"))?;
        }
        fs::rename(&staging_path, &archive_path)
            .map_err(|err| format!("Could not commit archive folder: {err}"))?;
        fix_local_urls_after_commit(
            &staging_path,
            &archive_path,
            &mut output_conversations,
            &mut manifest,
        );

        // Re-read and update normalized JSON files with final non-staging local-file URLs.
        for conversation in &output_conversations {
            let text = serde_json::to_string_pretty(conversation).map_err(|err| err.to_string())?;
            fs::write(
                archive_path
                    .join("conversations")
                    .join(format!("{}.json", conversation.summary.id)),
                text,
            )
            .map_err(|err| format!("Could not rewrite committed conversation JSON: {err}"))?;
        }
        let final_artifacts = build_all_artifacts(
            &output_conversations,
            &archive_index.source_path,
            &artifacts.generated_at,
        );
        let manifest_path = archive_path.join("manifest.json");
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&json!({
              "generatedAt": manifest.generated_at,
              "sourcePath": manifest.source_path,
              "sourceImageFiles": manifest.source_image_files,
              "copiedAssets": manifest.copied_assets,
              "missingPointers": manifest.missing_pointers,
              "externalUrls": manifest.external_urls,
            }))
            .map_err(|err| err.to_string())?,
        )
        .map_err(|err| format!("Could not rewrite committed manifest: {err}"))?;

        Ok(ImportBuild {
            archive_id,
            archive_path,
            manifest_path,
            index: archive_index,
            artifacts: final_artifacts,
            conversations: output_conversations,
        })
    }
}

fn fix_local_urls_after_commit(
    staging_path: &Path,
    archive_path: &Path,
    conversations: &mut [ConversationFile],
    manifest: &mut ImportManifest,
) {
    let from = staging_path.to_string_lossy().replace('\\', "/");
    let to = archive_path.to_string_lossy().replace('\\', "/");
    for conversation in conversations {
        for message in &mut conversation.messages {
            for asset in &mut message.assets {
                if asset.url.starts_with("local-file://") {
                    asset.url = asset.url.replace(&from, &to);
                }
            }
            for document in &mut message.documents {
                if document.url.starts_with("local-file://") {
                    document.url = document.url.replace(&from, &to);
                }
            }
        }
    }
    for item in &mut manifest.copied_assets {
        if let Some(url) = item
            .get("url")
            .and_then(Value::as_str)
            .map(ToString::to_string)
        {
            let fixed = url.replace(&from, &to);
            item["url"] = Value::String(fixed);
        }
    }
}

fn build_all_artifacts(
    conversations: &[ConversationFile],
    source_path: &str,
    generated_at: &str,
) -> ArtifactIndex {
    let mut buckets = ArtifactBuckets::default();
    for conversation in conversations {
        let artifacts = build_conversation_artifacts(&conversation.summary, &conversation.messages);
        buckets.code.extend(artifacts.code);
        buckets.assets.extend(artifacts.assets);
        buckets.documents.extend(artifacts.documents);
        buckets.links.extend(artifacts.links);
    }
    let mut language_counts: BTreeMap<String, usize> = BTreeMap::new();
    for item in &buckets.code {
        *language_counts.entry(item.language.clone()).or_default() += 1;
    }
    ArtifactIndex {
        generated_at: generated_at.to_string(),
        source_path: source_path.to_string(),
        totals: ArtifactTotals {
            code: buckets.code.len(),
            assets: buckets.assets.len(),
            documents: buckets.documents.len(),
            links: buckets.links.len(),
        },
        language_counts,
        code: buckets.code,
        assets: buckets.assets,
        documents: buckets.documents,
        links: buckets.links,
    }
}

fn load_openai_conversations(
    source_dir: &Path,
) -> AppResult<(Vec<SourceConversation>, Vec<PathBuf>)> {
    let legacy = source_dir.join("conversations.json");
    let conversation_files = if legacy.exists() {
        vec![legacy]
    } else {
        let mut shards = fs::read_dir(source_dir)
            .map_err(|err| format!("Could not read export folder: {err}"))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| {
                        name.starts_with("conversations-") && name.ends_with(".json")
                    })
            })
            .collect::<Vec<_>>();
        shards.sort();
        shards
    };

    if conversation_files.is_empty() {
        return Err(format!(
            "Cannot find conversations.json or conversations-*.json in {}",
            source_dir.display()
        ));
    }

    let mut conversations = Vec::new();
    for file in &conversation_files {
        let source_text = fs::read_to_string(file)
            .map_err(|err| format!("Could not read export {}: {err}", file.display()))?;
        let value: Value = serde_json::from_str(&source_text)
            .map_err(|err| format!("Could not parse export JSON {}: {err}", file.display()))?;
        let items = value.as_array().ok_or_else(|| {
            format!(
                "OpenAI conversation file must be an array: {}",
                file.display()
            )
        })?;
        for item in items {
            conversations.push(SourceConversation {
                value: item.clone(),
                source_index: conversations.len(),
            });
        }
    }

    let raw_files = collect_raw_export_files(source_dir, &conversation_files)?;
    Ok((conversations, raw_files))
}

fn collect_raw_export_files(
    source_dir: &Path,
    conversation_files: &[PathBuf],
) -> AppResult<Vec<PathBuf>> {
    let mut files = conversation_files.to_vec();
    for entry in
        fs::read_dir(source_dir).map_err(|err| format!("Could not read export folder: {err}"))?
    {
        let entry = entry.map_err(|err| format!("Could not read export entry: {err}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext == "dat" {
            continue;
        }
        if !matches!(ext.as_str(), "json" | "html") {
            continue;
        }
        if !files.iter().any(|item| item == &path) {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn collect_export_files(source_dir: &Path) -> AppResult<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in WalkDir::new(source_dir) {
        let entry = entry.map_err(|err| format!("Could not walk export folder: {err}"))?;
        if entry.file_type().is_file() {
            files.push(entry.into_path());
        }
    }
    Ok(files)
}

fn build_asset_index(source_dir: &Path, files: &[PathBuf]) -> AppResult<AssetIndex> {
    let original_names = load_asset_original_names(source_dir)?;
    let mut index = AssetIndex::default();
    for file in files {
        let source_name = file
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let original_name = original_names
            .get(&source_name)
            .cloned()
            .unwrap_or_else(|| source_name.clone());
        let ext = Path::new(&original_name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let is_image = matches!(
            ext.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "avif" | "svg"
        );
        let candidate = AssetCandidate {
            source_path: file.clone(),
            original_name,
        };
        if is_image {
            index.image_files.push(candidate.clone());
        }
        let source_stem = file
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let original_stem = Path::new(&candidate.original_name)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        add_asset_key(&mut index, &source_name, &candidate);
        add_asset_key(&mut index, &source_stem, &candidate);
        add_asset_key(&mut index, &candidate.original_name, &candidate);
        add_asset_key(&mut index, &original_stem, &candidate);
        for item in FILE_ID_RE.find_iter(&source_name) {
            add_asset_key(&mut index, item.as_str(), &candidate);
        }
        for item in FILE_ID_RE.find_iter(&candidate.original_name) {
            add_asset_key(&mut index, item.as_str(), &candidate);
        }
        if let Some(prefix) = HASH_PREFIX_RE.find(&source_stem) {
            add_asset_key(&mut index, prefix.as_str(), &candidate);
        }
    }
    Ok(index)
}

fn load_asset_original_names(source_dir: &Path) -> AppResult<HashMap<String, String>> {
    let path = source_dir.join("conversation_asset_file_names.json");
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let text = fs::read_to_string(&path)
        .map_err(|err| format!("Could not read asset filename map: {err}"))?;
    serde_json::from_str(&text).map_err(|err| format!("Could not parse asset filename map: {err}"))
}

fn add_asset_key(index: &mut AssetIndex, key: &str, candidate: &AssetCandidate) {
    if key.is_empty() {
        return;
    }
    index
        .by_key
        .entry(key.to_ascii_lowercase())
        .or_default()
        .push(candidate.clone());
}

fn pick_asset(candidates: Option<&Vec<AssetCandidate>>) -> Option<AssetCandidate> {
    let mut items = candidates?.clone();
    items.sort_by(|a, b| {
        let score = |file: &AssetCandidate| match Path::new(&file.original_name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "png" => 0,
            "jpg" | "jpeg" => 1,
            "webp" => 2,
            "svg" => 3,
            _ => 2,
        };
        score(a)
            .cmp(&score(b))
            .then_with(|| a.original_name.len().cmp(&b.original_name.len()))
            .then_with(|| {
                a.source_path
                    .as_os_str()
                    .len()
                    .cmp(&b.source_path.as_os_str().len())
            })
    });
    items.into_iter().next()
}

fn asset_keys_from_pointer(pointer: &str) -> Vec<String> {
    let mut keys = BTreeSet::new();
    for item in Regex::new(r"file[-_][A-Za-z0-9]{8,}")
        .unwrap()
        .find_iter(pointer)
    {
        keys.insert(item.as_str().to_string());
    }
    let cleaned = pointer
        .strip_prefix("file-service://")
        .or_else(|| pointer.strip_prefix("sediment://"))
        .or_else(|| pointer.strip_prefix("sandbox:/mnt/data/"))
        .unwrap_or(pointer);
    let base = Path::new(cleaned)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !base.is_empty() {
        keys.insert(base.to_string());
        if let Some(stem) = Path::new(base).file_stem().and_then(|value| value.to_str()) {
            keys.insert(stem.to_string());
        }
    }
    keys.into_iter().collect()
}

fn copy_asset(
    source_file: &AssetCandidate,
    staging_path: &Path,
    copied: &mut BTreeSet<PathBuf>,
) -> AppResult<String> {
    let dest_name = export_asset_name(source_file);
    let dest = staging_path.join("assets").join(dest_name);
    if !dest.exists() {
        fs::copy(&source_file.source_path, &dest).map_err(|err| {
            format!(
                "Could not copy asset {}: {err}",
                source_file.source_path.display()
            )
        })?;
    }
    copied.insert(source_file.source_path.clone());
    Ok(local_file_url(&dest))
}

fn export_asset_name(source_file: &AssetCandidate) -> String {
    let source_stem = source_file
        .source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");
    let original = sanitize_filename(&source_file.original_name);
    let original_path = Path::new(&original);
    let original_stem = original_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");
    let ext = original_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let short_key = source_stem.chars().take(32).collect::<String>();
    if ext.is_empty() {
        format!("{short_key}-{original_stem}")
    } else {
        format!("{short_key}-{original_stem}.{ext}")
    }
}

fn sanitize_filename(value: &str) -> String {
    let cleaned = Regex::new(r#"[^A-Za-z0-9._ -]+"#)
        .unwrap()
        .replace_all(value, "_")
        .trim()
        .trim_matches('.')
        .to_string();
    if cleaned.is_empty() {
        "asset".to_string()
    } else {
        cleaned
    }
}

fn local_file_url(path: &Path) -> String {
    format!("local-file://{}", path.to_string_lossy().replace('\\', "/"))
}

fn resolve_local_asset(
    pointer: &str,
    staging_path: &Path,
    asset_index: &AssetIndex,
    copied: &mut BTreeSet<PathBuf>,
    manifest: &mut ImportManifest,
) -> AppResult<(String, String)> {
    for key in asset_keys_from_pointer(pointer) {
        if let Some(file) = pick_asset(asset_index.by_key.get(&key.to_ascii_lowercase())) {
            let url = copy_asset(&file, staging_path, copied)?;
            return Ok(("local".to_string(), url));
        }
    }
    manifest.unresolved_pointers.insert(pointer.to_string());
    Ok(("missing".to_string(), String::new()))
}

fn walk_value(value: &Value, visitor: &mut dyn FnMut(&Value)) {
    if !value.is_object() && !value.is_array() {
        return;
    }
    visitor(value);
    match value {
        Value::Array(items) => {
            for item in items {
                walk_value(item, visitor);
            }
        }
        Value::Object(map) => {
            for item in map.values() {
                walk_value(item, visitor);
            }
        }
        _ => {}
    }
}

fn extract_text_from_content(content: &Value) -> String {
    if let Some(text) = content.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    content
        .get("parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| {
                    if let Some(text) = part.as_str() {
                        Some(text.to_string())
                    } else if let Some(text) = part.get("text").and_then(Value::as_str) {
                        Some(text.to_string())
                    } else if part.get("content_type").and_then(Value::as_str)
                        == Some("audio_transcription")
                    {
                        part.get("text")
                            .and_then(Value::as_str)
                            .map(ToString::to_string)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default()
}

fn extract_code_fences(text: &str) -> Vec<MessageBlock> {
    let regex = Regex::new(r"```([^\n`]*)\n?([\s\S]*?)```").unwrap();
    let mut blocks = Vec::new();
    let mut last = 0usize;
    for captures in regex.captures_iter(text) {
        let whole = captures.get(0).unwrap();
        let before = &text[last..whole.start()];
        if !before.trim().is_empty() {
            blocks.push(MessageBlock::Markdown {
                text: before.trim().to_string(),
            });
        }
        blocks.push(MessageBlock::Code {
            language: captures
                .get(1)
                .map(|item| item.as_str().trim())
                .filter(|item| !item.is_empty())
                .unwrap_or("text")
                .to_string(),
            text: captures
                .get(2)
                .map(|item| item.as_str().trim_end_matches('\n'))
                .unwrap_or("")
                .to_string(),
        });
        last = whole.end();
    }
    let after = &text[last..];
    if !after.trim().is_empty() {
        blocks.push(MessageBlock::Markdown {
            text: after.trim().to_string(),
        });
    }
    if blocks.is_empty() && !text.trim().is_empty() {
        blocks.push(MessageBlock::Markdown {
            text: text.trim().to_string(),
        });
    }
    blocks
}

fn strip_control_markup(text: &str) -> String {
    let no_tags = Regex::new(r"<[^>]+>").unwrap().replace_all(text, " ");
    let no_control = Regex::new(r"\u{E200}[^\u{E201}]*\u{E201}")
        .unwrap()
        .replace_all(&no_tags, " ");
    Regex::new(r"\s+")
        .unwrap()
        .replace_all(&no_control, " ")
        .trim()
        .to_string()
}

fn normalize_special_text(text: &str, refs: &[Value]) -> String {
    let mut output = text.to_string();
    for reference in refs {
        if let (Some(matched), Some(alt)) = (
            reference.get("matched_text").and_then(Value::as_str),
            reference.get("alt").and_then(Value::as_str),
        ) {
            output = output.replace(matched, alt);
        }
    }
    output = Regex::new(r"\u{E200}image_group\u{E202}([\s\S]*?)\u{E201}")
        .unwrap()
        .replace_all(&output, "\n[Image group]\n")
        .to_string();
    output = Regex::new(r"\u{E200}[^\u{E201}]*\u{E201}")
        .unwrap()
        .replace_all(&output, "")
        .to_string();
    output
}

fn extract_references(message: &Value) -> Vec<ArchiveReference> {
    let mut refs = Vec::new();
    if let Some(content_refs) = message
        .pointer("/metadata/content_references")
        .and_then(Value::as_array)
    {
        for reference in content_refs {
            let ref_type = reference
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("reference");
            if ref_type == "image_group" {
                refs.push(ArchiveReference {
                    r#type: "image_group".to_string(),
                    label: "Image group".to_string(),
                    url: None,
                });
            } else if ref_type == "entity" {
                refs.push(ArchiveReference {
                    r#type: "entity".to_string(),
                    label: reference
                        .get("name")
                        .or_else(|| reference.get("alt"))
                        .and_then(Value::as_str)
                        .unwrap_or("Entity")
                        .to_string(),
                    url: None,
                });
            } else if let Some(url) = reference.get("url").and_then(Value::as_str) {
                refs.push(ArchiveReference {
                    r#type: ref_type.to_string(),
                    label: reference
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or(url)
                        .to_string(),
                    url: Some(url.to_string()),
                });
            } else if let Some(label) = reference
                .get("alt")
                .or_else(|| reference.get("prompt_text"))
                .and_then(Value::as_str)
            {
                refs.push(ArchiveReference {
                    r#type: ref_type.to_string(),
                    label: strip_control_markup(label),
                    url: None,
                });
            }
        }
    }
    if let Some(citations) = message
        .pointer("/metadata/citations")
        .and_then(Value::as_array)
    {
        for citation in citations {
            let url = citation
                .get("url")
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let label = citation
                .get("title")
                .or_else(|| citation.pointer("/metadata/title"))
                .and_then(Value::as_str)
                .or(url.as_deref())
                .unwrap_or("Citation")
                .to_string();
            refs.push(ArchiveReference {
                r#type: "citation".to_string(),
                label,
                url,
            });
        }
    }
    refs
}

fn extract_assets(
    message: &Value,
    _source_dir: &Path,
    staging_path: &Path,
    asset_index: &AssetIndex,
    copied: &mut BTreeSet<PathBuf>,
    manifest: &mut ImportManifest,
) -> AppResult<Vec<ArchiveAsset>> {
    let mut assets = Vec::new();
    let mut seen = HashSet::new();
    let mut add_asset =
        |input: &str, label: Option<&str>, dimensions: Option<&Value>| -> AppResult<()> {
            if input.is_empty() || seen.contains(input) {
                return Ok(());
            }
            seen.insert(input.to_string());
            let (kind, url) = if Regex::new(r"^https?://").unwrap().is_match(input) {
                manifest.external_set.insert(input.to_string());
                ("external".to_string(), input.to_string())
            } else {
                resolve_local_asset(input, staging_path, asset_index, copied, manifest)?
            };
            let width = dimensions
                .and_then(|value| value.get("width"))
                .and_then(Value::as_f64);
            let height = dimensions
                .and_then(|value| value.get("height"))
                .and_then(Value::as_f64);
            assets.push(ArchiveAsset {
                id: stable_id(input),
                kind,
                label: label
                    .unwrap_or_else(|| {
                        Path::new(input)
                            .file_name()
                            .and_then(|value| value.to_str())
                            .unwrap_or("Asset")
                    })
                    .to_string(),
                url,
                original: input.to_string(),
                width,
                height,
            });
            Ok(())
        };

    if let Some(content_refs) = message
        .pointer("/metadata/content_references")
        .and_then(Value::as_array)
    {
        for reference in content_refs {
            if let Some(urls) = reference.get("safe_urls").and_then(Value::as_array) {
                for url in urls.iter().filter_map(Value::as_str) {
                    add_asset(
                        url,
                        reference
                            .get("title")
                            .or_else(|| reference.get("alt"))
                            .and_then(Value::as_str)
                            .or(Some("Reference image")),
                        None,
                    )?;
                }
            }
            if let Some(images) = reference.get("images").and_then(Value::as_array) {
                for image in images {
                    if let Some(result) = image.get("image_result") {
                        if let Some(url) = result.get("content_url").and_then(Value::as_str) {
                            add_asset(
                                url,
                                result
                                    .get("title")
                                    .or_else(|| image.get("image_search_query"))
                                    .and_then(Value::as_str)
                                    .or(Some("Image result")),
                                result.get("content_size"),
                            )?;
                        }
                    }
                }
            }
        }
    }

    walk_value(
        message.get("content").unwrap_or(&Value::Null),
        &mut |node| {
            let node_type = node
                .get("content_type")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            if node_type.contains("audio") || node_type.contains("video") {
                return;
            }
            let label = node
                .get("name")
                .or_else(|| node.get("title"))
                .or_else(|| node.get("content_type"))
                .and_then(Value::as_str);
            for key in [
                "preview_asset_pointer",
                "image_asset_pointer",
                "url",
                "content_url",
            ] {
                if let Some(candidate) = node.get(key).and_then(Value::as_str) {
                    let _ = add_asset(candidate, label, None);
                }
            }
            if node_type.contains("image") || node_type.contains("asset_pointer") {
                if let Some(candidate) = node.get("asset_pointer").and_then(Value::as_str) {
                    let _ = add_asset(candidate, label, None);
                }
            }
        },
    );

    let content_text =
        serde_json::to_string(message.get("content").unwrap_or(&Value::Null)).unwrap_or_default();
    for item in Regex::new(r#"file-service://[^"\\\s]+"#)
        .unwrap()
        .find_iter(&content_text)
    {
        add_asset(item.as_str(), Some("Attached file"), None)?;
    }
    for item in Regex::new(r#"https?://[^"\\\s)]+"#)
        .unwrap()
        .find_iter(&content_text)
    {
        if EXTERNAL_IMAGE_RE.is_match(&item.as_str().to_ascii_lowercase()) {
            add_asset(item.as_str(), Some("External image"), None)?;
        }
    }
    Ok(assets)
}

fn is_document_name(name: &str) -> bool {
    let sample = name.to_ascii_lowercase();
    if Regex::new(r"\.(png|jpe?g|webp|gif|avif|svg|ico|bmp|mp[34]|wav|zip|gz|7z|rar|exe|msi|py|js|jsx|ts|tsx|css|go|rs|java|kt|sh|ps1|bat)(?:$|[?#])")
        .unwrap()
        .is_match(&sample)
    {
        return false;
    }
    Regex::new(r"\.(md|markdown|txt|rst|pdf|doc|docx|odt|rtf|html?|ppt|pptx|toml|json|jsonl|ya?ml|csv|xml)(?:$|[?#])")
        .unwrap()
        .is_match(&sample)
        || Regex::new(r"(?:^|[/\\_-])(readme|changelog|roadmap|license)(?:$|[/\\_.-])")
            .unwrap()
            .is_match(&sample)
}

fn resolve_document_file(
    pointer: &str,
    title: &str,
    staging_path: &Path,
    asset_index: &AssetIndex,
) -> AppResult<(String, String)> {
    for key in asset_keys_from_pointer(pointer) {
        if let Some(candidate) = pick_asset(asset_index.by_key.get(&key.to_ascii_lowercase())) {
            let source_stem = candidate
                .source_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("document");
            let destination = staging_path.join("documents").join(format!(
                "{}-{}",
                source_stem,
                sanitize_filename(title)
            ));
            if !destination.exists() {
                fs::copy(&candidate.source_path, &destination).map_err(|err| {
                    format!(
                        "Could not copy document {}: {err}",
                        candidate.source_path.display()
                    )
                })?;
            }
            return Ok(("local".to_string(), local_file_url(&destination)));
        }
    }
    Ok(("missing".to_string(), String::new()))
}

fn extract_documents(
    message: &Value,
    staging_path: &Path,
    asset_index: &AssetIndex,
) -> AppResult<Vec<ArchiveAsset>> {
    let mut documents = Vec::new();
    let mut seen = HashSet::new();
    let mut add_document = |pointer: &str, title: &str| -> AppResult<()> {
        if pointer.is_empty()
            || title.is_empty()
            || !is_document_name(title)
            || !seen.insert(pointer.to_string())
        {
            return Ok(());
        }
        let (kind, url) = resolve_document_file(pointer, title, staging_path, asset_index)?;
        documents.push(ArchiveAsset {
            id: stable_id(pointer),
            kind,
            label: title.to_string(),
            url,
            original: pointer.to_string(),
            width: None,
            height: None,
        });
        Ok(())
    };

    if let Some(attachments) = message
        .pointer("/metadata/attachments")
        .and_then(Value::as_array)
    {
        for attachment in attachments {
            if let (Some(id), Some(name)) = (
                attachment.get("id").and_then(Value::as_str),
                attachment.get("name").and_then(Value::as_str),
            ) {
                add_document(&format!("file-service://{id}"), name)?;
            }
        }
    }

    let content_text =
        serde_json::to_string(message.get("content").unwrap_or(&Value::Null)).unwrap_or_default();
    for captures in Regex::new(r#"sandbox:/mnt/data/([^"\\\s)]+)"#)
        .unwrap()
        .captures_iter(&content_text)
    {
        if let (Some(pointer), Some(name)) = (captures.get(0), captures.get(1)) {
            add_document(pointer.as_str(), name.as_str())?;
        }
    }
    Ok(documents)
}

fn is_hidden_message(message: &Value) -> bool {
    let metadata = message.get("metadata").unwrap_or(&Value::Null);
    let role = message
        .pointer("/author/role")
        .and_then(Value::as_str)
        .unwrap_or("");
    metadata
        .get("is_visually_hidden_from_conversation")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || metadata
            .get("is_user_system_message")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        || metadata.get("rebase_developer_message").is_some()
        || role == "system"
        || role == "tool"
}

fn ordered_nodes(conversation: &Value) -> Vec<Value> {
    let mapping = conversation.get("mapping").and_then(Value::as_object);
    let Some(mapping) = mapping else {
        return Vec::new();
    };
    let current = conversation.get("current_node").and_then(Value::as_str);
    let mut chain = Vec::new();
    let mut seen = HashSet::new();
    let mut cursor = current
        .filter(|id| mapping.contains_key(*id))
        .map(ToString::to_string);
    while let Some(id) = cursor {
        if seen.contains(&id) {
            break;
        }
        let Some(node) = mapping.get(&id) else {
            break;
        };
        seen.insert(id);
        chain.push(node.clone());
        cursor = node
            .get("parent")
            .and_then(Value::as_str)
            .map(ToString::to_string);
    }
    chain.reverse();
    let messages = chain
        .into_iter()
        .filter(|node| {
            node.get("message")
                .is_some_and(|message| !message.is_null())
        })
        .collect::<Vec<_>>();
    if messages.len() > 2 {
        return messages;
    }
    let mut all = mapping
        .values()
        .filter(|node| {
            node.get("message")
                .is_some_and(|message| !message.is_null())
        })
        .cloned()
        .collect::<Vec<_>>();
    all.sort_by(|a, b| {
        let at = a
            .pointer("/message/create_time")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let bt = b
            .pointer("/message/create_time")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        at.partial_cmp(&bt).unwrap_or(std::cmp::Ordering::Equal)
    });
    all
}

fn normalize_message(
    node: &Value,
    source_dir: &Path,
    staging_path: &Path,
    asset_index: &AssetIndex,
    copied: &mut BTreeSet<PathBuf>,
    manifest: &mut ImportManifest,
) -> AppResult<ArchiveMessage> {
    let message = node.get("message").ok_or("Node has no message")?;
    let content = message.get("content").unwrap_or(&Value::Null);
    let raw_text = extract_text_from_content(content);
    let refs = message
        .pointer("/metadata/content_references")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let text = normalize_special_text(&raw_text, &refs);
    let content_type = content
        .get("content_type")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let mut blocks = Vec::new();
    if content_type == "code" {
        blocks.push(MessageBlock::Code {
            language: content
                .get("language")
                .or_else(|| content.get("response_format_name"))
                .and_then(Value::as_str)
                .unwrap_or("text")
                .to_string(),
            text: content
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or(&raw_text)
                .to_string(),
        });
    } else if content_type == "execution_output" || content_type == "citable_code_output" {
        blocks.push(MessageBlock::Execution {
            label: if content_type == "execution_output" {
                "Execution output"
            } else {
                "Citable output"
            }
            .to_string(),
            text: content
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or(&raw_text)
                .to_string(),
        });
    } else if content_type == "system_error" {
        blocks.push(MessageBlock::Notice {
            text: if text.is_empty() {
                "System error".to_string()
            } else {
                text.clone()
            },
        });
    } else {
        blocks.extend(extract_code_fences(&text));
    }

    Ok(ArchiveMessage {
        id: message
            .get("id")
            .or_else(|| node.get("id"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        role: message
            .pointer("/author/role")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        author_name: message
            .pointer("/author/name")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        create_time: message.get("create_time").and_then(Value::as_f64),
        status: message
            .get("status")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        content_type: content_type.to_string(),
        text,
        blocks,
        assets: extract_assets(
            message,
            source_dir,
            staging_path,
            asset_index,
            copied,
            manifest,
        )?,
        documents: extract_documents(message, staging_path, asset_index)?,
        references: extract_references(message),
        hidden: is_hidden_message(message),
        raw_type: content_type.to_string(),
    })
}

fn summarize_conversation(
    conversation: &Value,
    messages: &[ArchiveMessage],
) -> ConversationSummary {
    let visible = messages
        .iter()
        .filter(|message| !message.hidden)
        .collect::<Vec<_>>();
    let searchable = visible
        .iter()
        .map(|message| message.text.as_str())
        .collect::<Vec<_>>()
        .join("\n")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let title = conversation
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled conversation")
        .to_string();
    let fallback = format!(
        "{}{}",
        title,
        conversation
            .get("create_time")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
    );
    let id = conversation
        .get("conversation_id")
        .or_else(|| conversation.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| stable_id(&fallback));
    let code_block_count = visible
        .iter()
        .map(|message| {
            message
                .blocks
                .iter()
                .filter(|block| matches!(block, MessageBlock::Code { .. }))
                .count()
        })
        .sum();
    let asset_count = visible.iter().map(|message| message.assets.len()).sum();
    let external_asset_count = visible
        .iter()
        .flat_map(|message| &message.assets)
        .filter(|asset| asset.kind == "external")
        .count();
    let create_time = conversation.get("create_time").and_then(Value::as_f64);
    let update_time = conversation.get("update_time").and_then(Value::as_f64);
    ConversationSummary {
        id: id.clone(),
        title: title.clone(),
        slug: format!(
            "{}-{}",
            slugify(&title, &id),
            &id.chars().take(8).collect::<String>()
        ),
        create_time,
        update_time,
        create_iso: epoch_to_iso(create_time),
        update_iso: epoch_to_iso(update_time),
        archived: conversation
            .get("is_archived")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        starred: conversation
            .get("is_starred")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        message_count: visible.len(),
        hidden_message_count: messages.len().saturating_sub(visible.len()),
        code_block_count,
        asset_count,
        external_asset_count,
        snippet: truncate_chars(&searchable, 220),
        search_text: truncate_chars(&format!("{title}\n{searchable}"), MAX_SEARCH_TEXT),
    }
}

fn build_conversation_artifacts(
    summary: &ConversationSummary,
    messages: &[ArchiveMessage],
) -> ArtifactBuckets {
    let mut artifacts = ArtifactBuckets::default();
    let mut seen_links = HashSet::new();
    for message in messages.iter().filter(|message| !message.hidden) {
        for (block_index, block) in message.blocks.iter().enumerate() {
            if let MessageBlock::Code { language, text } = block {
                let language = artifact_text(language).to_ascii_lowercase();
                artifacts.code.push(CodeArtifact {
                    base: base_artifact(
                        stable_id(&format!("code:{}:{}:{block_index}", summary.id, message.id)),
                        "code",
                        summary,
                        message,
                        &format!("{}\n{}\n{}", summary.title, language, text),
                    ),
                    r#type: "code".to_string(),
                    language: if language.is_empty() {
                        "text".to_string()
                    } else {
                        language
                    },
                    preview: truncate_chars(&artifact_text(text), 260),
                    text: text.clone(),
                });
            }
        }
        for (asset_index, asset) in message.assets.iter().enumerate() {
            artifacts.assets.push(AssetArtifact {
                base: base_artifact(
                    stable_id(&format!(
                        "asset:{}:{}:{}:{asset_index}",
                        summary.id, message.id, asset.id
                    )),
                    "asset",
                    summary,
                    message,
                    &format!(
                        "{}\n{}\n{}\n{}\n{}",
                        summary.title, asset.kind, asset.label, asset.original, asset.url
                    ),
                ),
                r#type: "asset".to_string(),
                kind: asset.kind.clone(),
                label: asset.label.clone(),
                original: asset.original.clone(),
                url: asset.url.clone(),
                width: asset.width,
                height: asset.height,
            });
        }
        for (document_index, document) in message.documents.iter().enumerate() {
            let title = document_asset_title(document);
            let document_type = classify_document(&title, &summary.title);
            let origin = if message.role == "user" {
                "Uploaded document"
            } else {
                "OpenAI download"
            };
            artifacts.documents.push(DocumentArtifact {
                base: base_artifact(
                    stable_id(&format!(
                        "document-file:{}:{}:{}:{}",
                        summary.id, message.id, document_index, document.id
                    )),
                    "document",
                    summary,
                    message,
                    &format!(
                        "{}\n{}\n{}\n{}",
                        summary.title, document_type, title, document.original
                    ),
                ),
                r#type: "document".to_string(),
                document_type,
                title: title.clone(),
                preview: format!("{origin} · {title}"),
                original: Some(document.original.clone()),
                url: Some(document.url.clone()),
            });
        }
        let mut links = Vec::new();
        for reference in message
            .references
            .iter()
            .filter(|reference| reference.url.is_some())
        {
            links.push((reference.label.clone(), reference.url.clone().unwrap()));
        }
        for url in extract_text_urls(&message.text) {
            links.push((url.clone(), url));
        }
        for (link_index, (label, url)) in links.iter().enumerate() {
            let key = format!("{}:{}:{url}", summary.id, message.id);
            if seen_links.contains(&key) {
                continue;
            }
            seen_links.insert(key.clone());
            let domain = domain_from_url(url);
            artifacts.links.push(LinkArtifact {
                base: base_artifact(
                    stable_id(&format!("link:{key}:{link_index}")),
                    "link",
                    summary,
                    message,
                    &format!("{}\n{}\n{}\n{}", summary.title, domain, label, url),
                ),
                r#type: "link".to_string(),
                label: truncate_chars(&artifact_text(label), 260),
                url: url.clone(),
                domain,
            });
        }
    }
    artifacts
}

fn base_artifact(
    id: String,
    artifact_type: &str,
    summary: &ConversationSummary,
    message: &ArchiveMessage,
    search_text: &str,
) -> BaseArtifact {
    BaseArtifact {
        id,
        conversation_id: summary.id.clone(),
        conversation_title: summary.title.clone(),
        message_id: message.id.clone(),
        create_time: message.create_time,
        role: message.role.clone(),
        search_text: artifact_text(&format!("{artifact_type}\n{search_text}")),
    }
}

fn document_asset_title(asset: &ArchiveAsset) -> String {
    let generic_label = asset.label.contains("asset_pointer")
        || matches!(asset.label.as_str(), "Attached file" | "Download" | "Asset");
    if !generic_label && !asset.label.trim().is_empty() {
        return asset.label.clone();
    }
    let candidate = asset
        .original
        .strip_prefix("file-service://")
        .or_else(|| asset.original.strip_prefix("sandbox:/mnt/data/"))
        .unwrap_or(&asset.original);
    Path::new(candidate)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.starts_with("file-"))
        .map(ToString::to_string)
        .or_else(|| {
            asset.url.rsplit('/').next().map(|value| {
                Regex::new(r"^file-[A-Za-z0-9]+-")
                    .unwrap()
                    .replace(value, "")
                    .to_string()
            })
        })
        .unwrap_or_else(|| "Document".to_string())
}

fn classify_document(text: &str, conversation_title: &str) -> String {
    let sample = format!("{conversation_title}\n{text}").to_ascii_lowercase();
    let pairs = [
        (r"\breadme\b|#\s+readme", "README"),
        (
            r"release\s+notes?|changelog|version\s+notes?",
            "Release notes",
        ),
        (
            r"specification|requirements?|acceptance criteria|success criteria",
            "Specification",
        ),
        (
            r"architecture|data flow|system design|design doc",
            "Architecture",
        ),
        (
            r"standard|policy|procedure|runbook|operating model",
            "Standard",
        ),
        (r"roadmap|milestone|phase\s+\d+", "Roadmap"),
    ];
    for (pattern, label) in pairs {
        if Regex::new(pattern).unwrap().is_match(&sample) {
            return label.to_string();
        }
    }
    "Document".to_string()
}

fn extract_text_urls(text: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut urls = Vec::new();
    for item in Regex::new(r#"https?://[^\s<>"')\]]+"#)
        .unwrap()
        .find_iter(text)
    {
        let url = item
            .as_str()
            .trim_end_matches(&['.', ',', ';', ':', '!', '?'][..])
            .to_string();
        if seen.insert(url.clone()) {
            urls.push(url);
        }
    }
    urls
}

fn domain_from_url(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| host.trim_start_matches("www.").to_string())
        })
        .unwrap_or_default()
}

fn archive_id(source_dir: &Path) -> String {
    let name = source_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("openai");
    format!(
        "openai-{}-{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        slugify(name, "archive")
    )
}

pub(crate) fn stable_id(value: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
        .chars()
        .take(12)
        .collect()
}

fn slugify(value: &str, fallback: &str) -> String {
    let lower = value.to_ascii_lowercase();
    let mut out = Regex::new(r"[^a-z0-9]+")
        .unwrap()
        .replace_all(&lower, "-")
        .trim_matches('-')
        .to_string();
    if out.len() > 70 {
        out.truncate(70);
    }
    if out.is_empty() {
        fallback.to_string()
    } else {
        out
    }
}

fn epoch_to_iso(seconds: Option<f64>) -> Option<String> {
    let seconds = seconds?;
    if !seconds.is_finite() {
        return None;
    }
    Utc.timestamp_opt(seconds as i64, 0)
        .single()
        .map(|value| value.to_rfc3339())
}

fn conversation_time(summary: &ConversationSummary) -> f64 {
    summary.update_time.or(summary.create_time).unwrap_or(0.0)
}

fn artifact_text(value: &str) -> String {
    truncate_chars(
        &value.split_whitespace().collect::<Vec<_>>().join(" "),
        MAX_ARTIFACT_TEXT,
    )
}

fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn relative_string(base: &Path, file: &Path) -> String {
    file.strip_prefix(base)
        .unwrap_or(file)
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("tests")
            .join("fixtures")
            .join(name)
    }

    fn temp_library(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "chatarchive-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn detects_attached_document_files() {
        for name in [
            "README.md",
            "architecture.pdf",
            "Roadmap.docx",
            "notes.txt",
            "deck.pptx",
            "release.toml",
            "manifest.json",
        ] {
            assert!(is_document_name(name), "expected document: {name}");
        }
    }

    #[test]
    fn rejects_non_document_assets() {
        for name in ["screenshot.png", "README.png", "service.py", "archive.zip"] {
            assert!(!is_document_name(name), "expected non-document: {name}");
        }
    }

    #[test]
    fn imports_deterministic_fixture_and_recovers_documents_separately_from_media() {
        let source = fixture_path("openai-export");
        let library = temp_library("fixture-import");
        fs::create_dir_all(library.join("archives")).unwrap();
        let build = OpenAiImporter.import(&source, &library).unwrap();

        assert_eq!(build.index.totals.conversations, 1);
        assert_eq!(build.artifacts.code.len(), 1);
        assert_eq!(build.artifacts.assets.len(), 2);
        assert_eq!(build.artifacts.documents.len(), 4);
        assert_eq!(
            build
                .artifacts
                .assets
                .iter()
                .filter(|item| item.kind == "missing")
                .count(),
            0
        );
        assert_eq!(
            build
                .artifacts
                .documents
                .iter()
                .filter(|item| item
                    .url
                    .as_deref()
                    .is_some_and(|url| url.starts_with("local-file://")))
                .count(),
            3
        );
        assert_eq!(
            build
                .artifacts
                .documents
                .iter()
                .filter(|item| item.url.as_deref() == Some(""))
                .count(),
            1
        );

        let readme = build
            .artifacts
            .documents
            .iter()
            .find(|item| item.title == "README.md")
            .unwrap();
        let recovered = PathBuf::from(
            readme
                .url
                .as_deref()
                .unwrap()
                .trim_start_matches("local-file://"),
        );
        assert_eq!(
            fs::read(source.join("file_fixture_document0001.dat")).unwrap(),
            fs::read(recovered).unwrap()
        );
        assert!(!readme.url.as_deref().unwrap().contains(".staging"));

        let _ = fs::remove_dir_all(library);
    }

    #[test]
    fn fixture_artifact_ids_are_stable_and_sqlite_totals_reconcile_without_losing_state() {
        let source = fixture_path("openai-export");
        let first_library = temp_library("stable-a");
        let second_library = temp_library("stable-b");
        fs::create_dir_all(first_library.join("archives")).unwrap();
        fs::create_dir_all(second_library.join("archives")).unwrap();
        let first = OpenAiImporter.import(&source, &first_library).unwrap();
        let second = OpenAiImporter.import(&source, &second_library).unwrap();
        assert_eq!(
            first
                .artifacts
                .code
                .iter()
                .map(|item| &item.base.id)
                .collect::<Vec<_>>(),
            second
                .artifacts
                .code
                .iter()
                .map(|item| &item.base.id)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            first
                .artifacts
                .documents
                .iter()
                .map(|item| &item.base.id)
                .collect::<Vec<_>>(),
            second
                .artifacts
                .documents
                .iter()
                .map(|item| &item.base.id)
                .collect::<Vec<_>>()
        );

        let mut conn = crate::db::open_db(&first_library).unwrap();
        crate::db::migrate(&conn).unwrap();
        let mut state = ViewerState::default();
        state.favorites.insert(
            "fixture-conversation".to_string(),
            ConversationBookmark {
                conversation_id: "fixture-conversation".to_string(),
                created_at: 1,
            },
        );
        crate::db::replace_viewer_state(&mut conn, &state).unwrap();
        let project_state = ProjectState {
            projects: vec![Project {
                id: 1,
                name: "Fixture Project".to_string(),
                normalized_name: "fixture project".to_string(),
                created_at: 1,
                updated_at: 1,
            }],
            memberships: vec![ProjectMembership {
                project_id: 1,
                target: KnowledgeTarget {
                    target_type: "conversation".to_string(),
                    target_id: "fixture-conversation".to_string(),
                    conversation_id: "fixture-conversation".to_string(),
                    title: "Fixture conversation".to_string(),
                },
                source: "manual".to_string(),
                created_at: 1,
            }],
            ..ProjectState::default()
        };
        crate::db::save_project_state(&mut conn, &project_state).unwrap();
        crate::db::replace_archive(
            &mut conn,
            &first.archive_id,
            &source,
            &first.archive_path,
            &first.manifest_path,
            &first.index,
            &first.artifacts,
            &first.conversations,
        )
        .unwrap();

        for (table, expected) in [
            ("code_artifacts", first.artifacts.code.len()),
            ("asset_artifacts", first.artifacts.assets.len()),
            ("document_artifacts", first.artifacts.documents.len()),
            ("link_artifacts", first.artifacts.links.len()),
        ] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(
                count as usize, expected,
                "SQLite count mismatch for {table}"
            );
        }
        assert!(crate::db::load_viewer_state(&conn)
            .unwrap()
            .favorites
            .contains_key("fixture-conversation"));
        let preserved_projects = crate::db::load_project_state(&conn).unwrap();
        assert_eq!(preserved_projects.projects[0].name, "Fixture Project");
        assert_eq!(preserved_projects.memberships.len(), 1);

        let _ = fs::remove_dir_all(first_library);
        let _ = fs::remove_dir_all(second_library);
    }

    #[test]
    fn malformed_export_fails_without_removing_existing_archive() {
        let source = fixture_path("malformed-export");
        let library = temp_library("malformed");
        let sentinel = library
            .join("archives")
            .join("existing")
            .join("sentinel.txt");
        fs::create_dir_all(sentinel.parent().unwrap()).unwrap();
        fs::write(&sentinel, "keep").unwrap();
        assert!(OpenAiImporter.import(&source, &library).is_err());
        assert_eq!(fs::read_to_string(&sentinel).unwrap(), "keep");
        let _ = fs::remove_dir_all(library);
    }

    #[test]
    fn loads_sharded_openai_export() {
        let source = std::env::var("CHATARCHIVE_IMPORT_SMOKE_SOURCE")
            .expect("Set CHATARCHIVE_IMPORT_SMOKE_SOURCE to an OpenAI export folder");
        let (conversations, raw_files) = load_openai_conversations(Path::new(&source))
            .expect("load sharded OpenAI conversations");
        assert!(
            !conversations.is_empty(),
            "conversation shards should produce conversations"
        );
        assert!(raw_files.iter().any(|path| path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(
                |name| name.starts_with("conversations-") || name == "conversations.json"
            )));
    }

    #[test]
    #[ignore]
    fn imports_real_openai_export_shape() {
        let source = std::env::var("CHATARCHIVE_IMPORT_SMOKE_SOURCE")
            .expect("Set CHATARCHIVE_IMPORT_SMOKE_SOURCE to an OpenAI export folder");
        let library = std::env::var("CHATARCHIVE_IMPORT_SMOKE_LIBRARY")
            .expect("Set CHATARCHIVE_IMPORT_SMOKE_LIBRARY to a temporary library folder");
        let library = PathBuf::from(library);
        if library.exists() {
            fs::remove_dir_all(&library).expect("clear old smoke library");
        }
        fs::create_dir_all(library.join("archives")).expect("create smoke library");

        let importer = OpenAiImporter;
        let build = importer
            .import(Path::new(&source), &library)
            .expect("import current OpenAI export shape");

        assert!(
            !build.index.conversations.is_empty(),
            "import should produce conversations"
        );
        assert!(
            build.index.totals.visible_messages > 0,
            "import should produce visible messages"
        );
        assert_eq!(build.index.totals.conversations, build.conversations.len());
        assert!(
            build.manifest_path.exists(),
            "import should write a manifest"
        );
    }
}
