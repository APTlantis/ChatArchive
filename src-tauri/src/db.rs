use crate::models::*;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub type AppResult<T> = Result<T, String>;

const SETTINGS_FILE: &str = "settings.json";

pub fn now_ms() -> i64 {
  Utc::now().timestamp_millis()
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
  library_path: Option<String>,
}

pub fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|err| format!("Could not resolve app config dir: {err}"))?;
  fs::create_dir_all(&dir).map_err(|err| format!("Could not create app config dir: {err}"))?;
  Ok(dir.join(SETTINGS_FILE))
}

fn read_app_settings(app: &AppHandle) -> AppResult<AppSettings> {
  let path = settings_path(app)?;
  if !path.exists() {
    return Ok(AppSettings::default());
  }
  let text = fs::read_to_string(&path).map_err(|err| format!("Could not read settings: {err}"))?;
  serde_json::from_str(&text).map_err(|err| format!("Could not parse settings: {err}"))
}

fn write_app_settings(app: &AppHandle, settings: &AppSettings) -> AppResult<()> {
  let path = settings_path(app)?;
  let text = serde_json::to_string_pretty(settings).map_err(|err| format!("Could not encode settings: {err}"))?;
  fs::write(path, text).map_err(|err| format!("Could not write settings: {err}"))
}

pub fn configured_library(app: &AppHandle) -> AppResult<Option<PathBuf>> {
  Ok(read_app_settings(app)?.library_path.map(PathBuf::from))
}

pub fn set_configured_library(app: &AppHandle, library: &Path) -> AppResult<()> {
  fs::create_dir_all(library).map_err(|err| format!("Could not create library folder: {err}"))?;
  write_app_settings(
    app,
    &AppSettings {
      library_path: Some(library.to_string_lossy().to_string()),
    },
  )?;
  ensure_library_layout(library)?;
  Ok(())
}

pub fn ensure_library_layout(library: &Path) -> AppResult<()> {
  fs::create_dir_all(library.join("archives")).map_err(|err| format!("Could not create archives folder: {err}"))?;
  fs::create_dir_all(library.join("exports")).map_err(|err| format!("Could not create exports folder: {err}"))?;
  let settings = library.join("settings.json");
  if !settings.exists() {
    fs::write(&settings, "{\n  \"version\": 1\n}\n").map_err(|err| format!("Could not write library settings: {err}"))?;
  }
  let conn = open_db(library)?;
  migrate(&conn)?;
  Ok(())
}

pub fn open_db(library: &Path) -> AppResult<Connection> {
  Connection::open(library.join("chatarchive.db")).map_err(|err| format!("Could not open SQLite database: {err}"))
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
  conn
    .execute_batch(
      r#"
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS archives (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        source_path TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        archive_id TEXT NOT NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        create_time REAL,
        update_time REAL,
        message_count INTEGER NOT NULL,
        hidden_message_count INTEGER NOT NULL,
        code_block_count INTEGER NOT NULL,
        asset_count INTEGER NOT NULL,
        external_asset_count INTEGER NOT NULL,
        snippet TEXT NOT NULL,
        search_text TEXT NOT NULL,
        json_path TEXT NOT NULL,
        summary_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        create_time REAL,
        hidden INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        text TEXT NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (conversation_id, id)
      );
      CREATE TABLE IF NOT EXISTS code_artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        language TEXT NOT NULL,
        preview TEXT NOT NULL,
        search_text TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS asset_artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        original TEXT NOT NULL,
        url TEXT NOT NULL,
        search_text TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        title TEXT NOT NULL,
        preview TEXT NOT NULL,
        search_text TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS link_artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        search_text TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS favorite_conversations (
        conversation_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pinned_conversations (
        conversation_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS read_conversations (
        conversation_id TEXT PRIMARY KEY,
        read_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recently_viewed (
        conversation_id TEXT PRIMARY KEY,
        viewed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS message_bookmarks (
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (conversation_id, message_id)
      );
      CREATE TABLE IF NOT EXISTS scroll_positions (
        conversation_id TEXT PRIMARY KEY,
        position REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT
      );
      CREATE TABLE IF NOT EXISTS conversation_tags (
        conversation_id TEXT NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (conversation_id, tag_id)
      );
      CREATE TABLE IF NOT EXISTS saved_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS conversation_fts USING fts5(
        conversation_id UNINDEXED,
        title,
        search_text,
        artifact_text
      );
      "#,
    )
    .map_err(|err| format!("Could not migrate SQLite database: {err}"))
}

fn json<T: Serialize>(value: &T) -> AppResult<String> {
  serde_json::to_string(value).map_err(|err| format!("Could not encode JSON: {err}"))
}

pub fn get_meta<T: for<'de> serde::Deserialize<'de>>(conn: &Connection, key: &str) -> AppResult<Option<T>> {
  let raw: Option<String> = conn
    .query_row("SELECT value FROM app_meta WHERE key = ?1", params![key], |row| row.get(0))
    .optional()
    .map_err(|err| format!("Could not read app metadata: {err}"))?;
  raw
    .map(|text| serde_json::from_str(&text).map_err(|err| format!("Could not parse app metadata: {err}")))
    .transpose()
}

pub fn replace_archive(
  conn: &mut Connection,
  archive_id: &str,
  source_path: &Path,
  archive_path: &Path,
  manifest_path: &Path,
  index: &ArchiveIndex,
  artifacts: &ArtifactIndex,
  conversations: &[ConversationFile],
) -> AppResult<()> {
  let tx = conn.transaction().map_err(|err| format!("Could not begin import transaction: {err}"))?;
  tx.execute_batch(
    r#"
    DELETE FROM conversation_fts;
    DELETE FROM conversations;
    DELETE FROM messages;
    DELETE FROM code_artifacts;
    DELETE FROM asset_artifacts;
    DELETE FROM document_artifacts;
    DELETE FROM link_artifacts;
    UPDATE archives SET active = 0;
    "#,
  )
  .map_err(|err| format!("Could not clear previous indexes: {err}"))?;

  tx.execute(
    "INSERT INTO archives(id, provider, title, source_path, archive_path, manifest_path, imported_at, active)
     VALUES (?1, 'openai', ?2, ?3, ?4, ?5, ?6, 1)
     ON CONFLICT(id) DO UPDATE SET source_path = excluded.source_path, archive_path = excluded.archive_path,
       manifest_path = excluded.manifest_path, imported_at = excluded.imported_at, active = 1",
    params![
      archive_id,
      archive_id,
      source_path.to_string_lossy(),
      archive_path.to_string_lossy(),
      manifest_path.to_string_lossy(),
      Utc::now().to_rfc3339(),
    ],
  )
  .map_err(|err| format!("Could not write archive row: {err}"))?;

  for conversation in conversations {
    let summary = &conversation.summary;
    let rel_path = format!("archives/{archive_id}/conversations/{}.json", summary.id);
    tx.execute(
      "INSERT INTO conversations(id, archive_id, title, slug, create_time, update_time, message_count,
       hidden_message_count, code_block_count, asset_count, external_asset_count, snippet, search_text, json_path, summary_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
      params![
        summary.id,
        archive_id,
        summary.title,
        summary.slug,
        summary.create_time,
        summary.update_time,
        summary.message_count as i64,
        summary.hidden_message_count as i64,
        summary.code_block_count as i64,
        summary.asset_count as i64,
        summary.external_asset_count as i64,
        summary.snippet,
        summary.search_text,
        rel_path,
        json(summary)?,
      ],
    )
    .map_err(|err| format!("Could not write conversation row: {err}"))?;

    for message in &conversation.messages {
      tx.execute(
        "INSERT INTO messages(id, conversation_id, role, create_time, hidden, content_type, text, json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
          message.id,
          summary.id,
          message.role,
          message.create_time,
          if message.hidden { 1 } else { 0 },
          message.content_type,
          message.text,
          json(message)?,
        ],
      )
      .map_err(|err| format!("Could not write message row: {err}"))?;
    }
  }

  let mut artifact_text: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
  for item in &artifacts.code {
    artifact_text.entry(item.base.conversation_id.clone()).or_default().push_str(&format!("\n{}", item.base.search_text));
    tx.execute(
      "INSERT INTO code_artifacts(id, conversation_id, message_id, language, preview, search_text, json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![item.base.id, item.base.conversation_id, item.base.message_id, item.language, item.preview, item.base.search_text, json(item)?],
    )
    .map_err(|err| format!("Could not write code artifact: {err}"))?;
  }
  for item in &artifacts.assets {
    artifact_text.entry(item.base.conversation_id.clone()).or_default().push_str(&format!("\n{}", item.base.search_text));
    tx.execute(
      "INSERT INTO asset_artifacts(id, conversation_id, message_id, kind, label, original, url, search_text, json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
      params![item.base.id, item.base.conversation_id, item.base.message_id, item.kind, item.label, item.original, item.url, item.base.search_text, json(item)?],
    )
    .map_err(|err| format!("Could not write asset artifact: {err}"))?;
  }
  for item in &artifacts.documents {
    artifact_text.entry(item.base.conversation_id.clone()).or_default().push_str(&format!("\n{}", item.base.search_text));
    tx.execute(
      "INSERT INTO document_artifacts(id, conversation_id, message_id, document_type, title, preview, search_text, json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      params![item.base.id, item.base.conversation_id, item.base.message_id, item.document_type, item.title, item.preview, item.base.search_text, json(item)?],
    )
    .map_err(|err| format!("Could not write document artifact: {err}"))?;
  }
  for item in &artifacts.links {
    artifact_text.entry(item.base.conversation_id.clone()).or_default().push_str(&format!("\n{}", item.base.search_text));
    tx.execute(
      "INSERT INTO link_artifacts(id, conversation_id, message_id, domain, label, url, search_text, json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      params![item.base.id, item.base.conversation_id, item.base.message_id, item.domain, item.label, item.url, item.base.search_text, json(item)?],
    )
    .map_err(|err| format!("Could not write link artifact: {err}"))?;
  }

  for summary in &index.conversations {
    tx.execute(
      "INSERT INTO conversation_fts(conversation_id, title, search_text, artifact_text) VALUES (?1, ?2, ?3, ?4)",
      params![
        summary.id,
        summary.title,
        summary.search_text,
        artifact_text.get(&summary.id).cloned().unwrap_or_default()
      ],
    )
    .map_err(|err| format!("Could not write search index: {err}"))?;
  }

  tx.execute(
    "INSERT INTO app_meta(key, value) VALUES ('active_archive_id', ?1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    params![json(&archive_id)?],
  )
  .map_err(|err| format!("Could not set active archive: {err}"))?;
  tx.execute(
    "INSERT INTO app_meta(key, value) VALUES ('archive_index', ?1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    params![json(index)?],
  )
  .map_err(|err| format!("Could not store archive index: {err}"))?;
  tx.execute(
    "INSERT INTO app_meta(key, value) VALUES ('artifact_index', ?1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    params![json(artifacts)?],
  )
  .map_err(|err| format!("Could not store artifact index: {err}"))?;

  tx.commit().map_err(|err| format!("Could not commit import: {err}"))?;
  Ok(())
}

pub fn load_index(conn: &Connection) -> AppResult<Option<ArchiveIndex>> {
  get_meta(conn, "archive_index")
}

pub fn load_artifacts(conn: &Connection) -> AppResult<Option<ArtifactIndex>> {
  get_meta(conn, "artifact_index")
}

pub fn list_code_artifacts(conn: &Connection) -> AppResult<Vec<CodeArtifact>> {
  let mut stmt = conn
    .prepare("SELECT json FROM code_artifacts ORDER BY language COLLATE NOCASE, id")
    .map_err(|err| format!("Could not prepare code artifact query: {err}"))?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|err| format!("Could not query code artifacts: {err}"))?;
  let mut artifacts = Vec::new();
  for row in rows {
    let raw = row.map_err(|err| format!("Could not read code artifact row: {err}"))?;
    artifacts.push(serde_json::from_str(&raw).map_err(|err| format!("Could not parse code artifact JSON: {err}"))?);
  }
  Ok(artifacts)
}

pub fn load_conversation(library: &Path, conn: &Connection, id: &str) -> AppResult<Option<ConversationFile>> {
  let path: Option<String> = conn
    .query_row("SELECT json_path FROM conversations WHERE id = ?1", params![id], |row| row.get(0))
    .optional()
    .map_err(|err| format!("Could not query conversation: {err}"))?;
  let Some(path) = path else {
    return Ok(None);
  };
  let text = fs::read_to_string(library.join(path)).map_err(|err| format!("Could not read conversation JSON: {err}"))?;
  serde_json::from_str(&text).map(Some).map_err(|err| format!("Could not parse conversation JSON: {err}"))
}

pub fn load_viewer_state(conn: &Connection) -> AppResult<ViewerState> {
  let mut state = ViewerState::default();
  {
    let mut stmt = conn.prepare("SELECT conversation_id, created_at FROM favorite_conversations").map_err(|err| err.to_string())?;
    let rows = stmt.query_map([], |row| {
      Ok(ConversationBookmark {
        conversation_id: row.get(0)?,
        created_at: row.get(1)?,
      })
    }).map_err(|err| err.to_string())?;
    for row in rows {
      let item = row.map_err(|err| err.to_string())?;
      state.favorites.insert(item.conversation_id.clone(), item);
    }
  }
  {
    let mut stmt = conn.prepare("SELECT conversation_id, created_at FROM pinned_conversations").map_err(|err| err.to_string())?;
    let rows = stmt.query_map([], |row| {
      Ok(ConversationBookmark {
        conversation_id: row.get(0)?,
        created_at: row.get(1)?,
      })
    }).map_err(|err| err.to_string())?;
    for row in rows {
      let item = row.map_err(|err| err.to_string())?;
      state.pinned.insert(item.conversation_id.clone(), item);
    }
  }
  {
    let mut stmt = conn.prepare("SELECT conversation_id, read_at FROM read_conversations").map_err(|err| err.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))).map_err(|err| err.to_string())?;
    for row in rows {
      let (id, read_at) = row.map_err(|err| err.to_string())?;
      state.read.insert(id, read_at);
    }
  }
  {
    let mut stmt = conn.prepare("SELECT conversation_id, viewed_at FROM recently_viewed ORDER BY viewed_at DESC LIMIT 12").map_err(|err| err.to_string())?;
    let rows = stmt.query_map([], |row| {
      Ok(ViewedConversation {
        conversation_id: row.get(0)?,
        viewed_at: row.get(1)?,
      })
    }).map_err(|err| err.to_string())?;
    for row in rows {
      state.recently_viewed.push(row.map_err(|err| err.to_string())?);
    }
  }
  {
    let mut stmt = conn.prepare("SELECT conversation_id, message_id, label, created_at FROM message_bookmarks ORDER BY created_at DESC").map_err(|err| err.to_string())?;
    let rows = stmt.query_map([], |row| {
      Ok(MessageBookmark {
        conversation_id: row.get(0)?,
        message_id: row.get(1)?,
        label: row.get(2)?,
        created_at: row.get(3)?,
      })
    }).map_err(|err| err.to_string())?;
    for row in rows {
      let item = row.map_err(|err| err.to_string())?;
      state.message_bookmarks.entry(item.conversation_id.clone()).or_default().push(item);
    }
  }
  {
    let mut stmt = conn.prepare("SELECT conversation_id, position FROM scroll_positions").map_err(|err| err.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).map_err(|err| err.to_string())?;
    for row in rows {
      let (id, position) = row.map_err(|err| err.to_string())?;
      state.scroll_positions.insert(id, position);
    }
  }
  Ok(state)
}

pub fn replace_viewer_state(conn: &mut Connection, state: &ViewerState) -> AppResult<ViewerState> {
  let tx = conn.transaction().map_err(|err| format!("Could not begin state transaction: {err}"))?;
  tx.execute_batch(
    "DELETE FROM favorite_conversations; DELETE FROM pinned_conversations; DELETE FROM read_conversations;
     DELETE FROM recently_viewed; DELETE FROM message_bookmarks; DELETE FROM scroll_positions;",
  )
  .map_err(|err| format!("Could not clear viewer state: {err}"))?;
  for item in state.favorites.values() {
    tx.execute("INSERT INTO favorite_conversations(conversation_id, created_at) VALUES (?1, ?2)", params![item.conversation_id, item.created_at])
      .map_err(|err| err.to_string())?;
  }
  for item in state.pinned.values() {
    tx.execute("INSERT INTO pinned_conversations(conversation_id, created_at) VALUES (?1, ?2)", params![item.conversation_id, item.created_at])
      .map_err(|err| err.to_string())?;
  }
  for (id, read_at) in &state.read {
    tx.execute("INSERT INTO read_conversations(conversation_id, read_at) VALUES (?1, ?2)", params![id, read_at]).map_err(|err| err.to_string())?;
  }
  for item in state.recently_viewed.iter().take(12) {
    tx.execute("INSERT INTO recently_viewed(conversation_id, viewed_at) VALUES (?1, ?2)", params![item.conversation_id, item.viewed_at])
      .map_err(|err| err.to_string())?;
  }
  for items in state.message_bookmarks.values() {
    for item in items {
      tx.execute(
        "INSERT INTO message_bookmarks(conversation_id, message_id, label, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![item.conversation_id, item.message_id, item.label, item.created_at],
      )
      .map_err(|err| err.to_string())?;
    }
  }
  for (id, position) in &state.scroll_positions {
    tx.execute("INSERT INTO scroll_positions(conversation_id, position) VALUES (?1, ?2)", params![id, position]).map_err(|err| err.to_string())?;
  }
  tx.execute(
    "INSERT INTO app_meta(key, value) VALUES ('viewer_state_migrated', 'true')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [],
  )
  .map_err(|err| err.to_string())?;
  tx.commit().map_err(|err| format!("Could not commit viewer state: {err}"))?;
  load_viewer_state(conn)
}

pub fn state_migrated(conn: &Connection) -> AppResult<bool> {
  let value: Option<String> = conn
    .query_row("SELECT value FROM app_meta WHERE key = 'viewer_state_migrated'", [], |row| row.get(0))
    .optional()
    .map_err(|err| format!("Could not read migration marker: {err}"))?;
  Ok(value.as_deref() == Some("true"))
}

pub fn active_archive_path(conn: &Connection) -> AppResult<Option<PathBuf>> {
  conn
    .query_row("SELECT archive_path FROM archives WHERE active = 1 LIMIT 1", [], |row| row.get::<_, String>(0))
    .optional()
    .map(|item| item.map(PathBuf::from))
    .map_err(|err| format!("Could not read active archive path: {err}"))
}

pub fn stored_conversation_summaries(conn: &Connection) -> AppResult<Vec<ConversationSummary>> {
  let mut stmt = conn
    .prepare("SELECT summary_json FROM conversations ORDER BY COALESCE(update_time, create_time, 0) DESC")
    .map_err(|err| format!("Could not prepare conversation list: {err}"))?;
  let rows = stmt
    .query_map([], |row| {
      let raw: String = row.get(0)?;
      let value: ConversationSummary = serde_json::from_str(&raw).map_err(|err| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err)))?;
      Ok(value)
    })
    .map_err(|err| format!("Could not query conversation list: {err}"))?;
  rows.collect::<Result<Vec<_>, _>>().map_err(|err| format!("Could not read conversation list: {err}"))
}
