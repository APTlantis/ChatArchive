use crate::db;
use crate::db::AppResult;
use crate::importer::{OpenAiImporter, ProviderImporter};
use crate::models::*;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

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
    let library = db::configured_library(&app)?;
    let Some(library) = library else {
        return Ok(LibraryStatus {
            configured: false,
            library_path: None,
            has_archive: false,
            state_migrated: false,
            index: None,
            artifacts: None,
            viewer_state: ViewerState::default(),
        });
    };
    db::ensure_library_layout(&library)?;
    let conn = db::open_db(&library)?;
    let index = db::load_index(&conn)?;
    let artifacts = db::load_artifacts(&conn)?;
    let viewer_state = db::load_viewer_state(&conn)?;
    let state_migrated = db::state_migrated(&conn)?;
    Ok(LibraryStatus {
        configured: true,
        library_path: Some(library.to_string_lossy().to_string()),
        has_archive: index.is_some(),
        state_migrated,
        index,
        artifacts,
        viewer_state,
    })
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
    let importer = OpenAiImporter;
    let build = importer.import(Path::new(&source_path), &library)?;
    let mut conn = db::open_db(&library)?;
    db::replace_archive(
        &mut conn,
        &build.archive_id,
        Path::new(&source_path),
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
