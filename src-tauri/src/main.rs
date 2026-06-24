mod commands;
mod db;
mod importer;
mod models;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      commands::get_library_status,
      commands::select_library_folder,
      commands::import_openai_export,
      commands::list_conversations,
      commands::get_conversation,
      commands::get_artifact_index,
      commands::search_conversations,
      commands::get_dashboard,
      commands::update_viewer_state,
      commands::toggle_favorite,
      commands::toggle_pin,
      commands::mark_read,
      commands::save_message_bookmark,
      commands::save_scroll_position,
      commands::export_conversation_markdown,
    ])
    .run(tauri::generate_context!())
    .expect("failed to run ChatArchive");
}
