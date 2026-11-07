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

const ROLLBACK_DIR: &str = "rollback";
const ROLLBACK_METADATA: &str = "rollback.json";

fn rollback_dir(library: &Path) -> PathBuf { library.join(ROLLBACK_DIR) }

fn rollback_is_complete(library: &Path) -> bool {
    let rollback = rollback_dir(library);
    rollback.join("chatarchive.db").is_file()
        && rollback.join("archive").is_dir()
        && rollback.join(ROLLBACK_METADATA).is_file()
}

fn copy_directory(from: &Path, to: &Path) -> AppResult<()> {
    for entry in WalkDir::new(from) {
        let entry = entry.map_err(|err| format!("Could not read rollback files: {err}"))?;
        let relative = entry.path().strip_prefix(from).map_err(|err| err.to_string())?;
        let destination = to.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination).map_err(|err| format!("Could not create rollback folder: {err}"))?;
        } else {
            if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|err| err.to_string())?; }
            fs::copy(entry.path(), &destination).map_err(|err| format!("Could not copy rollback file: {err}"))?;
        }
    }
    Ok(())
}

fn create_rollback_snapshot(library: &Path, active_archive: &Path) -> AppResult<PathBuf> {
    let staging = library.join(".rollback-staging");
    if staging.exists() { fs::remove_dir_all(&staging).map_err(|err| format!("Could not clear rollback staging: {err}"))?; }
    fs::create_dir_all(&staging).map_err(|err| format!("Could not create rollback staging: {err}"))?;
    copy_directory(active_archive, &staging.join("archive"))?;
    fs::copy(library.join("chatarchive.db"), staging.join("chatarchive.db")).map_err(|err| format!("Could not snapshot library database: {err}"))?;
    let metadata = serde_json::json!({
        "schema": "chatarchive.rollback",
        "version": 1,
        "createdAt": Utc::now().to_rfc3339(),
        "archiveId": active_archive.file_name().and_then(|name| name.to_str()).unwrap_or("unknown"),
        "database": "chatarchive.db",
        "archive": "archive"
    });
    fs::write(
        staging.join(ROLLBACK_METADATA),
        serde_json::to_vec_pretty(&metadata).map_err(|err| format!("Could not encode rollback metadata: {err}"))?,
    )
    .map_err(|err| format!("Could not write rollback metadata: {err}"))?;
    Ok(staging)
}

fn promote_rollback_snapshot(library: &Path, staging: &Path) -> AppResult<()> {
    let rollback = rollback_dir(library);
    let previous = library.join(".rollback-previous");
    if previous.exists() { fs::remove_dir_all(&previous).map_err(|err| format!("Could not clear prior rollback rotation: {err}"))?; }
    if rollback.exists() {
        fs::rename(&rollback, &previous).map_err(|err| format!("Could not preserve prior rollback during rotation: {err}"))?;
    }
    if let Err(err) = fs::rename(staging, &rollback) {
        if previous.exists() { let _ = fs::rename(&previous, &rollback); }
        return Err(format!("Could not save rollback snapshot: {err}"));
    }
    if previous.exists() {
        fs::remove_dir_all(&previous).map_err(|err| format!("Could not retire superseded rollback snapshot: {err}"))?;
    }
    Ok(())
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
            has_rollback: false,
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
            has_rollback: false,
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
            has_rollback: false,
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
            has_rollback: false,
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
        has_rollback: rollback_is_complete(&library),
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
    let state = db::load_project_state(&conn)?;
    let candidates = crate::project_intelligence::scan_projects(&index, &artifacts, &knowledge, &state);
    db::save_project_scan(&mut conn, &candidates)
}

#[tauri::command]
pub fn confirm_project_candidate(
    app: AppHandle,
    candidate_id: String,
) -> Result<ProjectState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    let index = db::load_index(&conn)?.ok_or("No archive has been imported yet")?;
    db::confirm_project_candidate(&mut conn, &candidate_id, &index)
}

#[tauri::command]
pub fn dismiss_project_candidate(app: AppHandle, candidate_id: String) -> Result<ProjectState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    db::dismiss_project_candidate(&mut conn, &candidate_id)
}

#[tauri::command]
pub fn add_project_conversation(app: AppHandle, project_id: i64, conversation_id: String) -> Result<ProjectState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    let index = db::load_index(&conn)?.ok_or("No archive has been imported yet")?;
    let conversation = index.conversations.iter().find(|item| item.id == conversation_id).ok_or("Conversation was not found in the active archive")?;
    db::add_project_conversation(&mut conn, project_id, conversation)
}

#[tauri::command]
pub fn remove_project_conversation(app: AppHandle, project_id: i64, conversation_id: String) -> Result<ProjectState, String> {
    let (_, mut conn) = open_library_db(&app)?;
    db::remove_project_conversation(&mut conn, project_id, &conversation_id)
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
        let previous_archive = db::active_archive_path(&conn)?;
        conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
            .map_err(|err| format!("Could not prepare library database for rollback: {err}"))?;
        let rollback_staging = previous_archive
            .as_deref()
            .map(|archive| create_rollback_snapshot(&library, archive))
            .transpose()?;
        let reconciliation = db::reconcile_metadata(&conn, &build.conversations, &build.artifacts)?;
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
        if let Some(staging) = rollback_staging {
            if let Err(err) = promote_rollback_snapshot(&library, &staging) {
                return Err(err);
            }
            if let Some(previous) = previous_archive {
                if previous != build.archive_path && previous.exists() {
                    if let Err(err) = fs::remove_dir_all(previous) {
                        eprintln!("New archive is active but the prior archive could not be retired after its rollback snapshot was committed: {err}");
                    }
                }
            }
        }
        Ok(ImportSummary {
            library_path: library.to_string_lossy().to_string(),
            archive_id: build.archive_id,
            manifest_path: build.manifest_path.to_string_lossy().to_string(),
            index: build.index,
            artifacts: build.artifacts,
            reconciliation,
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

#[tauri::command]
pub fn restore_previous_import(app: AppHandle) -> Result<ImportSummary, String> {
    let library = library_or_error(&app)?;
    let rollback = rollback_dir(&library);
    let snapshot_db = rollback.join("chatarchive.db");
    let snapshot_archive = rollback.join("archive");
    if !rollback_is_complete(&library) || !snapshot_db.is_file() || !snapshot_archive.is_dir() {
        return Err("There is no previous import available to restore.".to_string());
    }
    let live_conn = db::open_db(&library)?;
    let current_archive = db::active_archive_path(&live_conn)?.ok_or("No current archive is available to snapshot")?;
    drop(live_conn);
    let staging = create_rollback_snapshot(&library, &current_archive)?;
    let snapshot_conn = rusqlite::Connection::open(&snapshot_db).map_err(|err| format!("Could not read rollback database: {err}"))?;
    let restored_archive = db::active_archive_path(&snapshot_conn)?.ok_or("Rollback database has no active archive")?;
    let index = db::load_index(&snapshot_conn)?.ok_or("Rollback database has no archive index")?;
    let artifacts = db::load_artifacts(&snapshot_conn)?.ok_or("Rollback database has no artifact index")?;
    drop(snapshot_conn);
    promote_rollback_snapshot(&library, &staging)?;
    let archive_staging = library.join(".restore-archive-staging");
    let db_staging = library.join(".restore-db-staging");
    for temporary in [&archive_staging, &db_staging] {
        if temporary.exists() {
            if temporary.is_dir() { fs::remove_dir_all(temporary) } else { fs::remove_file(temporary) }
                .map_err(|err| format!("Could not clear interrupted restore staging: {err}"))?;
        }
    }
    copy_directory(&snapshot_archive, &archive_staging)?;
    fs::copy(&snapshot_db, &db_staging).map_err(|err| format!("Could not stage rollback database: {err}"))?;
    let current_archive_retired = library.join(".restore-current-archive");
    let restored_archive_retired = library.join(".restore-existing-archive");
    let current_db_retired = library.join(".restore-current-db");
    for temporary in [&current_archive_retired, &restored_archive_retired, &current_db_retired] {
        if temporary.exists() {
            if temporary.is_dir() { fs::remove_dir_all(temporary) } else { fs::remove_file(temporary) }
                .map_err(|err| format!("Could not clear interrupted restore recovery data: {err}"))?;
        }
    }
    fs::rename(&current_archive, &current_archive_retired).map_err(|err| format!("Could not preserve current archive during restore: {err}"))?;
    if restored_archive.exists() {
        if let Err(err) = fs::rename(&restored_archive, &restored_archive_retired) {
            let _ = fs::rename(&current_archive_retired, &current_archive);
            return Err(format!("Could not preserve prior restored archive during restore: {err}"));
        }
    }
    if let Err(err) = fs::rename(&archive_staging, &restored_archive) {
        let _ = fs::rename(&current_archive_retired, &current_archive);
        if restored_archive_retired.exists() { let _ = fs::rename(&restored_archive_retired, &restored_archive); }
        return Err(format!("Could not activate restored archive: {err}"));
    }
    let live_db = library.join("chatarchive.db");
    if let Err(err) = fs::rename(&live_db, &current_db_retired) {
        let _ = fs::rename(&restored_archive, &archive_staging);
        let _ = fs::rename(&current_archive_retired, &current_archive);
        if restored_archive_retired.exists() { let _ = fs::rename(&restored_archive_retired, &restored_archive); }
        return Err(format!("Could not preserve current database during restore: {err}"));
    }
    if let Err(err) = fs::rename(&db_staging, &live_db) {
        let _ = fs::rename(&current_db_retired, &live_db);
        let _ = fs::rename(&restored_archive, &archive_staging);
        let _ = fs::rename(&current_archive_retired, &current_archive);
        if restored_archive_retired.exists() { let _ = fs::rename(&restored_archive_retired, &restored_archive); }
        return Err(format!("Could not activate restored database: {err}"));
    }
    for retired in [&current_archive_retired, &restored_archive_retired, &current_db_retired] {
        if retired.exists() {
            let cleanup = if retired.is_dir() { fs::remove_dir_all(retired) } else { fs::remove_file(retired) };
            if let Err(err) = cleanup { eprintln!("Restore completed but retained recovery data at {}: {err}", retired.display()); }
        }
    }
    Ok(ImportSummary {
        library_path: library.to_string_lossy().to_string(),
        archive_id: restored_archive.file_name().and_then(|name| name.to_str()).unwrap_or("restored").to_string(),
        manifest_path: restored_archive.join("manifest.json").to_string_lossy().to_string(),
        index,
        artifacts,
        reconciliation: ImportReconciliation::default(),
    })
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
        let Some(safe_name) = entry.enclosed_name() else {
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
pub fn list_link_artifacts(app: AppHandle) -> Result<Vec<LinkArtifact>, String> {
    let (_, conn) = open_library_db(&app)?;
    db::list_link_artifacts(&conn)
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
            return Err(format!(
                "Export folder does not exist: {}",
                parent.display()
            ));
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

fn code_language_extension(language: &str) -> &'static str {
    match language.trim().to_ascii_lowercase().as_str() {
        "rust" | "rs" => "rs",
        "python" | "py" => "py",
        "typescript" | "ts" => "ts",
        "tsx" => "tsx",
        "javascript" | "js" => "js",
        "jsx" => "jsx",
        "bash" | "sh" | "zsh" | "shell" => "sh",
        "powershell" | "ps1" | "pwsh" => "ps1",
        "cmd" | "bat" | "batch" => "bat",
        "json" => "json",
        "jsonl" => "jsonl",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "html" | "htm" => "html",
        "css" => "css",
        "sql" => "sql",
        "go" | "golang" => "go",
        "c" => "c",
        "cpp" | "c++" | "cxx" => "cpp",
        "csharp" | "c#" | "cs" => "cs",
        "java" => "java",
        "markdown" | "md" => "md",
        "mermaid" | "mmd" => "mmd",
        "xml" | "svg" => "xml",
        "racket" | "rkt" => "rkt",
        "r" => "R",
        _ => "txt",
    }
}

pub(crate) fn build_recovery_bundle(
    library: &Path,
    conn: &rusqlite::Connection,
    bundle_name: &str,
    targets: &[KnowledgeTarget],
    destination_root: &Path,
) -> AppResult<RecoveryBundleSummary> {
    if targets.is_empty() {
        return Err("Select at least one item or collection to export.".to_string());
    }
    let safe_slug = slugify_path_name(bundle_name);
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let bundle_dir = destination_root.join(format!("recovered-{safe_slug}-{timestamp}"));
    fs::create_dir_all(&bundle_dir)
        .map_err(|err| format!("Could not create recovery bundle folder: {err}"))?;

    let code_artifacts = db::list_code_artifacts(conn)?;
    let doc_artifacts = db::list_document_artifacts(conn)?;
    let asset_artifacts = db::list_asset_artifacts(conn)?;
    let link_artifacts = db::list_link_artifacts(conn)?;

    let mut items = Vec::new();
    let mut exported_count = 0usize;
    let mut skipped_count = 0usize;

    for (idx, target) in targets.iter().enumerate() {
        let index_prefix = format!("{:03}", idx + 1);
        match target.target_type.as_str() {
            "code" => {
                if let Some(code) = code_artifacts.iter().find(|item| item.base.id == target.target_id) {
                    let code_dir = bundle_dir.join("code");
                    fs::create_dir_all(&code_dir).map_err(|err| err.to_string())?;
                    let ext = code_language_extension(&code.language);
                    let title_slug = slugify_path_name(&code.base.conversation_title);
                    let rel_name = format!(
                        "code/{index_prefix}-{title_slug}-{}.{ext}",
                        code.base.id.chars().take(8).collect::<String>()
                    );
                    fs::write(bundle_dir.join(&rel_name), &code.text)
                        .map_err(|err| format!("Could not write code file: {err}"))?;
                    exported_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "code".to_string(),
                        target_id: code.base.id.clone(),
                        title: format!("{} ({})", code.base.conversation_title, code.language),
                        conversation_id: code.base.conversation_id.clone(),
                        message_id: Some(code.base.message_id.clone()),
                        exported_relative_path: Some(rel_name),
                        status: "exported".to_string(),
                        original_pointer: None,
                    });
                } else {
                    skipped_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "code".to_string(),
                        target_id: target.target_id.clone(),
                        title: target.title.clone(),
                        conversation_id: target.conversation_id.clone(),
                        message_id: None,
                        exported_relative_path: None,
                        status: "missing_from_index".to_string(),
                        original_pointer: None,
                    });
                }
            }
            "document" => {
                if let Some(doc) = doc_artifacts.iter().find(|item| item.base.id == target.target_id) {
                    let doc_dir = bundle_dir.join("documents");
                    fs::create_dir_all(&doc_dir).map_err(|err| err.to_string())?;
                    let source_file = doc
                        .url
                        .as_deref()
                        .and_then(|u| u.strip_prefix("local-file://"))
                        .map(PathBuf::from)
                        .filter(|p| p.is_file());
                    let rel_name = if let Some(src) = source_file {
                        let ext = src
                            .extension()
                            .and_then(|e| e.to_str())
                            .filter(|e| !e.is_empty() && !e.eq_ignore_ascii_case("dat"))
                            .or_else(|| crate::importer::detect_file_signature(&src))
                            .unwrap_or("md");
                        let title_slug = slugify_path_name(&doc.title);
                        let rel = format!("documents/{index_prefix}-{title_slug}.{ext}");
                        fs::copy(&src, bundle_dir.join(&rel))
                            .map_err(|err| format!("Could not copy document file: {err}"))?;
                        rel
                    } else {
                        let content = db::document_artifact_content(conn, &doc.base.id)
                            .unwrap_or_else(|_| doc.preview.clone());
                        let title_slug = slugify_path_name(&doc.title);
                        let rel = format!("documents/{index_prefix}-{title_slug}.md");
                        fs::write(bundle_dir.join(&rel), content)
                            .map_err(|err| format!("Could not write document markdown: {err}"))?;
                        rel
                    };
                    exported_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "document".to_string(),
                        target_id: doc.base.id.clone(),
                        title: doc.title.clone(),
                        conversation_id: doc.base.conversation_id.clone(),
                        message_id: Some(doc.base.message_id.clone()),
                        exported_relative_path: Some(rel_name),
                        status: "exported".to_string(),
                        original_pointer: doc.original.clone(),
                    });
                } else {
                    skipped_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "document".to_string(),
                        target_id: target.target_id.clone(),
                        title: target.title.clone(),
                        conversation_id: target.conversation_id.clone(),
                        message_id: None,
                        exported_relative_path: None,
                        status: "missing_from_index".to_string(),
                        original_pointer: None,
                    });
                }
            }
            "asset" => {
                if let Some(asset) = asset_artifacts.iter().find(|item| item.base.id == target.target_id) {
                    let source_file = asset
                        .url
                        .strip_prefix("local-file://")
                        .map(PathBuf::from)
                        .filter(|p| p.is_file());
                    if let Some(src) = source_file {
                        let assets_dir = bundle_dir.join("assets");
                        fs::create_dir_all(&assets_dir).map_err(|err| err.to_string())?;
                        let ext = src
                            .extension()
                            .and_then(|e| e.to_str())
                            .filter(|e| !e.is_empty() && !e.eq_ignore_ascii_case("dat"))
                            .or_else(|| crate::importer::detect_file_signature(&src))
                            .unwrap_or("bin");
                        let label_slug = slugify_path_name(&asset.label);
                        let rel_name = format!(
                            "assets/{index_prefix}-{label_slug}-{}.{ext}",
                            asset.base.id.chars().take(8).collect::<String>()
                        );
                        fs::copy(&src, bundle_dir.join(&rel_name))
                            .map_err(|err| format!("Could not copy asset file: {err}"))?;
                        exported_count += 1;
                        items.push(RecoveryBundleItem {
                            target_type: "asset".to_string(),
                            target_id: asset.base.id.clone(),
                            title: asset.label.clone(),
                            conversation_id: asset.base.conversation_id.clone(),
                            message_id: Some(asset.base.message_id.clone()),
                            exported_relative_path: Some(rel_name),
                            status: "exported".to_string(),
                            original_pointer: Some(asset.original.clone()),
                        });
                    } else {
                        skipped_count += 1;
                        items.push(RecoveryBundleItem {
                            target_type: "asset".to_string(),
                            target_id: asset.base.id.clone(),
                            title: asset.label.clone(),
                            conversation_id: asset.base.conversation_id.clone(),
                            message_id: Some(asset.base.message_id.clone()),
                            exported_relative_path: None,
                            status: format!("unrecoverable_{}", asset.kind),
                            original_pointer: Some(asset.original.clone()),
                        });
                    }
                } else {
                    skipped_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "asset".to_string(),
                        target_id: target.target_id.clone(),
                        title: target.title.clone(),
                        conversation_id: target.conversation_id.clone(),
                        message_id: None,
                        exported_relative_path: None,
                        status: "missing_from_index".to_string(),
                        original_pointer: None,
                    });
                }
            }
            "conversation" => {
                if let Some(conv) = db::load_conversation(library, conn, &target.target_id)? {
                    let conv_dir = bundle_dir.join("conversations");
                    fs::create_dir_all(&conv_dir).map_err(|err| err.to_string())?;
                    let rel_name = format!("conversations/{index_prefix}-{}.md", conv.summary.slug);
                    let mut md = format!(
                        "# {}\n\n- **Conversation ID:** `{}`\n- **Created:** {}\n- **Updated:** {}\n- **Visible Messages:** {}\n\n---\n\n",
                        conv.summary.title,
                        conv.summary.id,
                        conv.summary.create_iso.as_deref().unwrap_or("Unknown"),
                        conv.summary.update_iso.as_deref().unwrap_or("Unknown"),
                        conv.summary.message_count
                    );
                    for msg in conv.messages.iter().filter(|m| !m.hidden) {
                        md.push_str(&format!("## {} (`{}`)\n\n{}\n\n", msg.role.to_uppercase(), msg.id, msg.text));
                    }
                    fs::write(bundle_dir.join(&rel_name), md)
                        .map_err(|err| format!("Could not write conversation markdown: {err}"))?;
                    exported_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "conversation".to_string(),
                        target_id: conv.summary.id.clone(),
                        title: conv.summary.title.clone(),
                        conversation_id: conv.summary.id.clone(),
                        message_id: None,
                        exported_relative_path: Some(rel_name),
                        status: "exported".to_string(),
                        original_pointer: None,
                    });
                } else {
                    skipped_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "conversation".to_string(),
                        target_id: target.target_id.clone(),
                        title: target.title.clone(),
                        conversation_id: target.conversation_id.clone(),
                        message_id: None,
                        exported_relative_path: None,
                        status: "missing_from_index".to_string(),
                        original_pointer: None,
                    });
                }
            }
            "link" => {
                if let Some(link) = link_artifacts.iter().find(|item| item.base.id == target.target_id) {
                    let links_dir = bundle_dir.join("links");
                    fs::create_dir_all(&links_dir).map_err(|err| err.to_string())?;
                    let clean_url = crate::importer::clean_extracted_url(&link.url);
                    let clean_domain = crate::importer::domain_from_url(&clean_url);
                    let domain_slug = slugify_path_name(if clean_domain.is_empty() { "link" } else { &clean_domain });
                    let rel_name = format!(
                        "links/{index_prefix}-{domain_slug}-{}.md",
                        link.base.id.chars().take(8).collect::<String>()
                    );
                    let md = format!(
                        "# {}\n\n- **URL:** {}\n- **Domain:** `{}`\n- **Conversation:** {} (`{}`)\n- **Message ID:** `{}`\n",
                        link.label,
                        clean_url,
                        if clean_domain.is_empty() { "unknown" } else { &clean_domain },
                        link.base.conversation_title,
                        link.base.conversation_id,
                        link.base.message_id
                    );
                    fs::write(bundle_dir.join(&rel_name), md)
                        .map_err(|err| format!("Could not write link markdown: {err}"))?;
                    exported_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "link".to_string(),
                        target_id: link.base.id.clone(),
                        title: link.label.clone(),
                        conversation_id: link.base.conversation_id.clone(),
                        message_id: Some(link.base.message_id.clone()),
                        exported_relative_path: Some(rel_name),
                        status: "exported".to_string(),
                        original_pointer: Some(clean_url),
                    });
                } else {
                    skipped_count += 1;
                    items.push(RecoveryBundleItem {
                        target_type: "link".to_string(),
                        target_id: target.target_id.clone(),
                        title: target.title.clone(),
                        conversation_id: target.conversation_id.clone(),
                        message_id: None,
                        exported_relative_path: None,
                        status: "missing_from_index".to_string(),
                        original_pointer: None,
                    });
                }
            }
            other => {
                skipped_count += 1;
                items.push(RecoveryBundleItem {
                    target_type: other.to_string(),
                    target_id: target.target_id.clone(),
                    title: target.title.clone(),
                    conversation_id: target.conversation_id.clone(),
                    message_id: None,
                    exported_relative_path: None,
                    status: "unsupported_type".to_string(),
                    original_pointer: None,
                });
            }
        }
    }

    let exported_at = Utc::now().to_rfc3339();
    let manifest_path = bundle_dir.join("manifest.json");
    let manifest_json = serde_json::json!({
        "schema": "chatarchive.recovery-bundle",
        "version": 1,
        "bundleName": bundle_name,
        "exportedAt": exported_at,
        "totalRequested": targets.len(),
        "exportedCount": exported_count,
        "skippedCount": skipped_count,
        "items": items,
    });
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest_json).map_err(|err| err.to_string())?,
    )
    .map_err(|err| format!("Could not write bundle manifest: {err}"))?;

    let readme_path = bundle_dir.join("README.md");
    let mut readme = format!(
        "# Recovered Bundle: {}\n\n- **Exported At:** {}\n- **Materialized Files:** {}\n- **Skipped / Unresolved:** {}\n- **Manifest:** `manifest.json`\n\n## Recovered Contents\n\n| # | Type | Title | File | Source Conversation | Status |\n|---|---|---|---|---|---|\n",
        bundle_name, exported_at, exported_count, skipped_count
    );
    for (i, item) in items.iter().enumerate() {
        let rel = item.exported_relative_path.as_deref().unwrap_or("—");
        readme.push_str(&format!(
            "| {} | `{}` | {} | `{}` | `{}` | `{}` |\n",
            i + 1,
            item.target_type,
            item.title.replace('|', "\\|"),
            rel,
            item.conversation_id,
            item.status
        ));
    }
    fs::write(&readme_path, readme)
        .map_err(|err| format!("Could not write bundle README: {err}"))?;

    Ok(RecoveryBundleSummary {
        bundle_name: bundle_name.to_string(),
        bundle_path: bundle_dir.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        readme_path: readme_path.to_string_lossy().to_string(),
        exported_count,
        skipped_count,
        items,
    })
}

#[tauri::command]
pub fn export_recovery_bundle(
    app: AppHandle,
    bundle_name: String,
    targets: Vec<KnowledgeTarget>,
    destination_dir: Option<String>,
) -> Result<RecoveryBundleSummary, String> {
    let (library, conn) = open_library_db(&app)?;
    let dest_root = if let Some(dir) = destination_dir.filter(|d| !d.trim().is_empty()) {
        PathBuf::from(dir)
    } else {
        let archive_path = db::active_archive_path(&conn)?.ok_or("No active archive folder found")?;
        archive_path.join("exports").join("bundles")
    };
    fs::create_dir_all(&dest_root)
        .map_err(|err| format!("Could not create bundle export destination: {err}"))?;
    build_recovery_bundle(&library, &conn, &bundle_name, &targets, &dest_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_library(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("chatarchive-rollback-{label}-{nonce}"))
    }

    #[test]
    fn rollback_snapshot_keeps_only_the_latest_prior_archive_and_database() {
        let library = temporary_library("rotation");
        db::ensure_library_layout(&library).unwrap();
        let first = library.join("archives").join("first");
        fs::create_dir_all(&first).unwrap();
        fs::write(first.join("marker.txt"), "first").unwrap();
        fs::write(library.join("chatarchive.db"), "database-first").unwrap();
        let first_staging = create_rollback_snapshot(&library, &first).unwrap();
        promote_rollback_snapshot(&library, &first_staging).unwrap();

        let second = library.join("archives").join("second");
        fs::create_dir_all(&second).unwrap();
        fs::write(second.join("marker.txt"), "second").unwrap();
        fs::write(library.join("chatarchive.db"), "database-second").unwrap();
        let second_staging = create_rollback_snapshot(&library, &second).unwrap();
        promote_rollback_snapshot(&library, &second_staging).unwrap();

        assert_eq!(fs::read_to_string(rollback_dir(&library).join("archive").join("marker.txt")).unwrap(), "second");
        assert_eq!(fs::read_to_string(rollback_dir(&library).join("chatarchive.db")).unwrap(), "database-second");
        let metadata: serde_json::Value = serde_json::from_slice(&fs::read(rollback_dir(&library).join(ROLLBACK_METADATA)).unwrap()).unwrap();
        assert_eq!(metadata["schema"], "chatarchive.rollback");
        assert_eq!(metadata["archiveId"], "second");
        let _ = fs::remove_dir_all(library);
    }

    #[test]
    fn recovery_bundle_exports_mixed_artifacts_with_manifest_and_readme() {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("tests")
            .join("fixtures")
            .join("openai-export");
        let library = temporary_library("bundle-export");
        db::ensure_library_layout(&library).unwrap();
        let build = OpenAiImporter.import(&source, &library).unwrap();
        let mut conn = db::open_db(&library).unwrap();
        db::migrate(&conn).unwrap();
        db::replace_archive(
            &mut conn,
            &build.archive_id,
            &source,
            &build.archive_path,
            &build.manifest_path,
            &build.index,
            &build.artifacts,
            &build.conversations,
        )
        .unwrap();

        let targets = vec![
            KnowledgeTarget {
                target_type: "code".to_string(),
                target_id: build.artifacts.code[0].base.id.clone(),
                conversation_id: build.artifacts.code[0].base.conversation_id.clone(),
                title: "Snippet".to_string(),
            },
            KnowledgeTarget {
                target_type: "document".to_string(),
                target_id: build.artifacts.documents[0].base.id.clone(),
                conversation_id: build.artifacts.documents[0].base.conversation_id.clone(),
                title: build.artifacts.documents[0].title.clone(),
            },
            KnowledgeTarget {
                target_type: "asset".to_string(),
                target_id: build.artifacts.assets[0].base.id.clone(),
                conversation_id: build.artifacts.assets[0].base.conversation_id.clone(),
                title: build.artifacts.assets[0].label.clone(),
            },
            KnowledgeTarget {
                target_type: "conversation".to_string(),
                target_id: build.conversations[0].summary.id.clone(),
                conversation_id: build.conversations[0].summary.id.clone(),
                title: build.conversations[0].summary.title.clone(),
            },
        ];

        let dest_root = library.join("bundle-out");
        fs::create_dir_all(&dest_root).unwrap();
        let summary =
            build_recovery_bundle(&library, &conn, "Logos-And-Theming", &targets, &dest_root)
                .unwrap();
        assert_eq!(summary.exported_count, 4);
        assert_eq!(summary.skipped_count, 0);
        assert!(Path::new(&summary.manifest_path).is_file());
        assert!(Path::new(&summary.readme_path).is_file());
        let readme_text = fs::read_to_string(&summary.readme_path).unwrap();
        assert!(readme_text.contains("Logos-And-Theming"));
        for item in &summary.items {
            let rel = item.exported_relative_path.as_deref().unwrap();
            assert!(Path::new(&summary.bundle_path).join(rel).is_file());
        }
        let _ = fs::remove_dir_all(library);
    }
}
