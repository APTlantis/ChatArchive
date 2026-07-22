#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod importer;
mod models;
mod project_intelligence;

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
            commands::list_code_artifacts,
            commands::list_document_artifacts,
            commands::get_document_artifact_content,
            commands::list_asset_artifacts,
            commands::export_document_markdown,
            commands::search_conversations,
            commands::get_dashboard,
            commands::update_viewer_state,
            commands::update_knowledge_state,
            commands::scan_projects,
            commands::update_project_state,
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
