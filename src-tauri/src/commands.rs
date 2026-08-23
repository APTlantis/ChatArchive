use crate::db;
use crate::db::AppResult;
use crate::importer::{OpenAiImporter, ProviderImporter};
use crate::models::*;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use walkdir::WalkDir;
use zip::ZipArchive;

fn library_or_error(app: &AppHandle) -> AppResult<PathBuf> {
    let library =
        db::configured_library(app)?.ok_or("No ChatArchive library folder has been selected")?;
    db::ensure_library_layout(&library)?;
    Ok(library)
}

fn open_library_db(app: &AppHandle) -> AppResult<(PathBuf, rusqlite::Connection)> {
    let library = library_or_error(app)?;
    let conn = db::open_db(&library)?;
    db::migrate(&conn)?;
    Ok((library, conn))
}

#[tauri::command]
pub fn get_library_status(app: AppHandle) -> Result<LibraryStatus, String> {
    let library = db::saved_library_path(&app)?;
    let Some(library) = library else {
        return Ok(LibraryStatus {
            configured: false,
            library_path: None,
            library_error: None,
            has_archive: false,
            state_migrated: false,
            index: None,
            artifacts: None,
            viewer_state: ViewerState::default(),
            knowledge_state: KnowledgeState::default(),
            project_state: ProjectState::default(),
        });
    };
    if !library.exists() {
        return Ok(LibraryStatus {
            configured: false,
            library_path: Some(library.to_string_lossy().to_string()),
            library_error: Some("The saved library folder is no longer available. Choose a library folder to continue.".to_string()),
            has_archive: false,
            state_migrated: false,
            index: None,
            artifacts: None,
            viewer_state: ViewerState::default(),
            knowledge_state: KnowledgeState::default(),
            project_state: ProjectState::default(),
        });
    }
    if !library.is_dir() {
        return Ok(LibraryStatus {
            configured: false,
            library_path: Some(library.to_string_lossy().to_string()),
            library_error: Some(
                "The saved library location is not a folder. Choose a library folder to continue."
                    .to_string(),
            ),
            has_archive: false,
            state_migrated: false,
            index: None,
            artifacts: None,
            viewer_state: ViewerState::default(),
            knowledge_state: KnowledgeState::default(),
            project_state: ProjectState::default(),
        });
    }
    db::configured_library(&app)?;
    if let Err(err) = db::ensure_library_layout(&library) {
        return Ok(LibraryStatus {
            configured: false,
            library_path: Some(library.to_string_lossy().to_string()),
            library_error: Some(err),
            has_archive: false,
            state_migrated: false,
            index: None,
            artifacts: None,
            viewer_state: ViewerState::default(),
            knowledge_state: KnowledgeState::default(),
            project_state: ProjectState::default(),
        });
    }
    let conn = db::open_db(&library)?;
    let index = db::load_index(&conn)?;
    let artifacts = db::load_artifacts(&conn)?;
    let viewer_state = db::load_viewer_state(&conn)?;
    let state_migrated = db::state_migrated(&conn)?;
    let knowledge_state = db::load_knowledge_state(&conn)?;
    let project_state = db::load_project_state(&conn)?;
    Ok(LibraryStatus {
        configured: true,
        library_path: Some(library.to_string_lossy().to_string()),
        library_error: None,
        has_archive: index.is_some(),
        state_migrated,
        index,
        artifacts,
        viewer_state,
        knowledge_state,
        project_state,
    })
}

#[tauri::command]
pub fn update_knowledge_state(
    app: AppHandle,
    knowledge_state: KnowledgeState,
) -> Result<KnowledgeState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    db::replace_knowledge_state(&mut conn, &knowledge_state)
}

#[tauri::command]
pub fn scan_projects(app: AppHandle) -> Result<ProjectState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    let index = db::load_index(&conn)?.ok_or("No archive has been imported yet")?;
    let artifacts = db::load_artifacts(&conn)?.ok_or("No artifact index is available")?;
    let knowledge = db::load_knowledge_state(&conn)?;
    let mut state = db::load_project_state(&conn)?;
    state.candidates =
        crate::project_intelligence::scan_projects(&index, &artifacts, &knowledge, &state);
    let next_id = state.scan_runs.iter().map(|run| run.id).max().unwrap_or(0) + 1;
    state.scan_runs.insert(
        0,
        ProjectScanRun {
            id: next_id,
            scanned_at: db::now_ms(),
            candidate_count: state.candidates.len(),
        },
    );
    state.scan_runs.truncate(20);
    db::save_project_state(&mut conn, &state)
}

#[tauri::command]
pub fn update_project_state(
    app: AppHandle,
    project_state: ProjectState,
) -> Result<ProjectState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    db::save_project_state(&mut conn, &project_state)
}

#[tauri::command]
pub fn select_library_folder(
    app: AppHandle,
    library_path: String,
) -> Result<LibraryStatus, String> {
    db::set_configured_library(&app, Path::new(&library_path))?;
    get_library_status(app)
}

#[tauri::command]
pub fn import_openai_export(
    app: AppHandle,
    source_path: String,
    library_path: Option<String>,
) -> Result<ImportSummary, String> {
    let library = if let Some(path) = library_path {
        let path = PathBuf::from(path);
        db::set_configured_library(&app, &path)?;
        path
    } else {
        library_or_error(&app)?
    };
    db::ensure_library_layout(&library)?;
    let source = PathBuf::from(&source_path);
    let prepared = prepare_openai_source(&source, &library)?;
    let importer = OpenAiImporter;
    let result = (|| {
        let build = importer.import(&prepared.source_dir, &library)?;
        let mut conn = db::open_db(&library)?;
        db::replace_archive(
            &mut conn,
            &build.archive_id,
            &source,
            &build.archive_path,
            &build.manifest_path,
            &build.index,
            &build.artifacts,
            &build.conversations,
        )?;
        Ok(ImportSummary {
            library_path: library.to_string_lossy().to_string(),
            archive_id: build.archive_id,
            manifest_path: build.manifest_path.to_string_lossy().to_string(),
            index: build.index,
            artifacts: build.artifacts,
        })
    })();
    if let Some(temp_dir) = prepared.cleanup_dir {
        if let Err(err) = fs::remove_dir_all(&temp_dir) {
            eprintln!(
                "Could not clean temporary OpenAI export folder {}: {err}",
                temp_dir.display()
            );
        }
    }
    result
}

struct PreparedOpenAiSource {
    source_dir: PathBuf,
    cleanup_dir: Option<PathBuf>,
}

fn prepare_openai_source(source: &Path, library: &Path) -> AppResult<PreparedOpenAiSource> {
    if source.is_dir() {
        return Ok(PreparedOpenAiSource {
            source_dir: source.to_path_buf(),
            cleanup_dir: None,
        });
    }
    if !source.is_file() {
        return Err(format!("OpenAI export was not found: {}", source.display()));
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension != "zip" {
        return Err("Choose an OpenAI export .zip file or an extracted export folder".to_string());
    }

    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("openai-export");
    let temp_dir = library.join("imports").join(format!(
        ".openai-{}-{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        slugify_path_name(stem)
    ));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)
            .map_err(|err| format!("Could not remove old temporary import folder: {err}"))?;
    }
    fs::create_dir_all(&temp_dir)
        .map_err(|err| format!("Could not create temporary import folder: {err}"))?;
    extract_zip(source, &temp_dir)?;
    let source_dir = find_openai_export_root(&temp_dir).ok_or_else(|| {
        format!(
            "Could not find conversations.json or conversations-*.json inside {}",
            source.display()
        )
    })?;
    Ok(PreparedOpenAiSource {
        source_dir,
        cleanup_dir: Some(temp_dir),
    })
}

fn extract_zip(zip_path: &Path, destination: &Path) -> AppResult<()> {
    let file = fs::File::open(zip_path)
        .map_err(|err| format!("Could not open OpenAI export zip: {err}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|err| format!("Could not read OpenAI export zip: {err}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|err| format!("Could not read zip entry: {err}"))?;
        let Some(safe_name) = entry.enclosed_name().map(PathBuf::from) else {
            continue;
        };
        let target = destination.join(safe_name);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|err| {
                format!("Could not create zip folder {}: {err}", target.display())
            })?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|err| {
                format!("Could not create zip folder {}: {err}", parent.display())
            })?;
        }
        let mut output = fs::File::create(&target)
            .map_err(|err| format!("Could not write extracted file {}: {err}", target.display()))?;
        io::copy(&mut entry, &mut output)
            .map_err(|err| format!("Could not extract file {}: {err}", target.display()))?;
    }
    Ok(())
}

fn find_openai_export_root(root: &Path) -> Option<PathBuf> {
    let mut candidates = WalkDir::new(root)
        .min_depth(0)
        .max_depth(3)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_dir())
        .map(|entry| entry.into_path())
        .filter(|path| has_openai_conversation_files(path))
        .collect::<Vec<_>>();
    candidates.sort_by_key(|path| path.components().count());
    candidates.into_iter().next()
}

fn has_openai_conversation_files(path: &Path) -> bool {
    if path.join("conversations.json").is_file() {
        return true;
    }
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .any(|entry| {
            entry.path().is_file()
                && entry.file_name().to_str().is_some_and(|name| {
                    name.starts_with("conversations-") && name.ends_with(".json")
                })
        })
}

fn slugify_path_name(value: &str) -> String {
    let mut out = String::new();
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            out.push(character.to_ascii_lowercase());
        } else if matches!(character, '-' | '_' | ' ') && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_matches('-');
    if out.is_empty() {
        "openai-export".to_string()
    } else {
        out.chars().take(48).collect()
    }
}

#[tauri::command]
pub fn list_conversations(app: AppHandle) -> Result<ArchiveIndex, String> {
    let (_, conn) = open_library_db(&app)?;
    db::load_index(&conn)?.ok_or("No archive has been imported yet".to_string())
}

#[tauri::command]
pub fn get_conversation(
    app: AppHandle,
    conversation_id: String,
) -> Result<ConversationFile, String> {
    let (library, conn) = open_library_db(&app)?;
    db::load_conversation(&library, &conn, &conversation_id)?
        .ok_or(format!("Conversation not found: {conversation_id}"))
}

#[tauri::command]
pub fn get_artifact_index(app: AppHandle) -> Result<Option<ArtifactIndex>, String> {
    let (_, conn) = open_library_db(&app)?;
    db::load_artifacts(&conn)
}

#[tauri::command]
pub fn list_code_artifacts(app: AppHandle) -> Result<Vec<CodeArtifact>, String> {
    let (_, conn) = open_library_db(&app)?;
    db::list_code_artifacts(&conn)
}

#[tauri::command]
pub fn list_document_artifacts(app: AppHandle) -> Result<Vec<DocumentArtifact>, String> {
    let (_, conn) = open_library_db(&app)?;
    db::list_document_artifacts(&conn)
}

#[tauri::command]
pub fn get_document_artifact_content(
    app: AppHandle,
    artifact_id: String,
) -> Result<String, String> {
    let (_, conn) = open_library_db(&app)?;
    db::document_artifact_content(&conn, &artifact_id)
}

#[tauri::command]
pub fn list_asset_artifacts(app: AppHandle) -> Result<Vec<AssetArtifact>, String> {
    let (_, conn) = open_library_db(&app)?;
    db::list_asset_artifacts(&conn)
}

#[tauri::command]
pub fn export_document_markdown(
    app: AppHandle,
    artifact_id: String,
    markdown: String,
) -> Result<String, String> {
    let (_, conn) = open_library_db(&app)?;
    let artifact = db::load_document_artifact(&conn, &artifact_id)?;
    let archive_path = db::active_archive_path(&conn)?.ok_or("No active archive folder found")?;
    let exports = archive_path.join("exports");
    fs::create_dir_all(&exports)
        .map_err(|err| format!("Could not create exports folder: {err}"))?;
    if let Some(source) = artifact
        .url
        .as_deref()
        .and_then(|value| value.strip_prefix("local-file://"))
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("document");
        let stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("document");
        let safe_stem = stem
            .chars()
            .map(|value| {
                if value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | ' ') {
                    value
                } else {
                    '-'
                }
            })
            .collect::<String>();
        let file = exports.join(format!(
            "{}-{}-{}.{}",
            safe_stem.trim().chars().take(72).collect::<String>(),
            artifact.base.id,
            Utc::now().format("%Y%m%d%H%M%S"),
            extension
        ));
        fs::copy(&source, &file)
            .map_err(|err| format!("Could not export original document: {err}"))?;
        return Ok(file.to_string_lossy().to_string());
    }

    let mut slug = artifact
        .title
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "document" } else { slug };
    let file = exports.join(format!(
        "{}-{}-{}.md",
        slug.chars().take(72).collect::<String>(),
        artifact.base.id,
        Utc::now().format("%Y%m%d%H%M%S")
    ));
    fs::write(&file, markdown).map_err(|err| format!("Could not write document export: {err}"))?;
    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_code_snippet(target_path: String, code: String) -> Result<String, String> {
    let path = PathBuf::from(&target_path);
    if path.is_dir() {
        return Err("Choose a file path, not a folder.".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(format!("Export folder does not exist: {}", parent.display()));
        }
    }
    fs::write(&path, code).map_err(|err| format!("Could not export code snippet: {err}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_dashboard(app: AppHandle) -> Result<LibraryStatus, String> {
    get_library_status(app)
}

#[tauri::command]
pub fn search_conversations(
    app: AppHandle,
    filters: SearchFilters,
) -> Result<Vec<ConversationSummary>, String> {
    let (_, conn) = open_library_db(&app)?;
    let mut conversations = db::stored_conversation_summaries(&conn)?;
    if filters.query.trim().is_empty()
        && filters.start_date.is_empty()
        && filters.end_date.is_empty()
        && filters.min_messages.is_empty()
        && filters.max_messages.is_empty()
    {
        return Ok(conversations);
    }
    let query = filters.query.to_lowercase();
    let terms = query
        .split_whitespace()
        .filter(|part| !part.contains(':'))
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    conversations.retain(|conversation| {
        let haystack =
            format!("{}\n{}", conversation.title, conversation.search_text).to_lowercase();
        let term_match = terms.iter().all(|term| haystack.contains(term));
        let min_match = filters
            .min_messages
            .parse::<usize>()
            .map(|min| conversation.message_count >= min)
            .unwrap_or(true);
        let max_match = filters
            .max_messages
            .parse::<usize>()
            .map(|max| conversation.message_count <= max)
            .unwrap_or(true);
        term_match && min_match && max_match
    });
    Ok(conversations)
}

#[tauri::command]
pub fn update_viewer_state(
    app: AppHandle,
    viewer_state: ViewerState,
) -> Result<ViewerState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    db::replace_viewer_state(&mut conn, &viewer_state)
}

#[tauri::command]
pub fn toggle_favorite(app: AppHandle, conversation_id: String) -> Result<ViewerState, String> {
    let (_, conn) = open_library_db(&app)?;
    let exists: Option<i64> = conn
        .query_row(
            "SELECT created_at FROM favorite_conversations WHERE conversation_id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    if exists.is_some() {
        conn.execute(
            "DELETE FROM favorite_conversations WHERE conversation_id = ?1",
            params![conversation_id],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO favorite_conversations(conversation_id, created_at) VALUES (?1, ?2)",
            params![conversation_id, db::now_ms()],
        )
        .map_err(|err| err.to_string())?;
    }
    db::load_viewer_state(&conn)
}

#[tauri::command]
pub fn toggle_pin(app: AppHandle, conversation_id: String) -> Result<ViewerState, String> {
    let (_, conn) = open_library_db(&app)?;
    let exists: Option<i64> = conn
        .query_row(
            "SELECT created_at FROM pinned_conversations WHERE conversation_id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    if exists.is_some() {
        conn.execute(
            "DELETE FROM pinned_conversations WHERE conversation_id = ?1",
            params![conversation_id],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO pinned_conversations(conversation_id, created_at) VALUES (?1, ?2)",
            params![conversation_id, db::now_ms()],
        )
        .map_err(|err| err.to_string())?;
    }
    db::load_viewer_state(&conn)
}

#[tauri::command]
pub fn mark_read(
    app: AppHandle,
    conversation_id: String,
    read: bool,
) -> Result<ViewerState, String> {
    let (_, conn) = open_library_db(&app)?;
    if read {
        conn.execute(
            "INSERT INTO read_conversations(conversation_id, read_at) VALUES (?1, ?2)
       ON CONFLICT(conversation_id) DO UPDATE SET read_at = excluded.read_at",
            params![conversation_id, db::now_ms()],
        )
        .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "DELETE FROM read_conversations WHERE conversation_id = ?1",
            params![conversation_id],
        )
        .map_err(|err| err.to_string())?;
    }
    db::load_viewer_state(&conn)
}

#[tauri::command]
pub fn save_message_bookmark(
    app: AppHandle,
    bookmark: MessageBookmark,
    bookmarked: bool,
) -> Result<ViewerState, String> {
    let (_, conn) = open_library_db(&app)?;
    if bookmarked {
        conn.execute(
      "INSERT INTO message_bookmarks(conversation_id, message_id, label, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(conversation_id, message_id) DO UPDATE SET label = excluded.label, created_at = excluded.created_at",
      params![bookmark.conversation_id, bookmark.message_id, bookmark.label, bookmark.created_at],
    )
    .map_err(|err| err.to_string())?;
    } else {
        conn.execute(
            "DELETE FROM message_bookmarks WHERE conversation_id = ?1 AND message_id = ?2",
            params![bookmark.conversation_id, bookmark.message_id],
        )
        .map_err(|err| err.to_string())?;
    }
    db::load_viewer_state(&conn)
}

#[tauri::command]
pub fn save_scroll_position(
    app: AppHandle,
    conversation_id: String,
    position: f64,
) -> Result<ViewerState, String> {
    let (_, conn) = open_library_db(&app)?;
    conn.execute(
        "INSERT INTO scroll_positions(conversation_id, position) VALUES (?1, ?2)
     ON CONFLICT(conversation_id) DO UPDATE SET position = excluded.position",
        params![conversation_id, position],
    )
    .map_err(|err| err.to_string())?;
    db::load_viewer_state(&conn)
}

#[tauri::command]
pub fn export_conversation_markdown(
    app: AppHandle,
    conversation_id: String,
    markdown: String,
) -> Result<String, String> {
    let (library, conn) = open_library_db(&app)?;
    let conversation = db::load_conversation(&library, &conn, &conversation_id)?
        .ok_or("Conversation not found")?;
    let archive_path = db::active_archive_path(&conn)?.ok_or("No active archive folder found")?;
    let exports = archive_path.join("exports");
    fs::create_dir_all(&exports)
        .map_err(|err| format!("Could not create exports folder: {err}"))?;
    let file = exports.join(format!(
        "{}-{}.md",
        conversation.summary.slug,
        Utc::now().format("%Y%m%d%H%M%S")
    ));
    fs::write(&file, markdown).map_err(|err| format!("Could not write Markdown export: {err}"))?;
    Ok(file.to_string_lossy().to_string())
}
