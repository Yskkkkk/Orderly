// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod db;
mod backup;
mod orders;
mod settings;
mod time;

use serde::Serialize;
use tauri::{Manager, State};

use crate::db::Db;
use crate::backup::{backup_export, backup_import};
use crate::orders::{
    adjustment_add, adjustment_delete, adjustments_list, archive_months_overview, monthly_income_summary,
    order_create, order_files_list, order_folder_path, order_get, order_hard_delete, order_restore, order_soft_delete,
    order_unarchive, order_update, orders_list, payment_add, payment_delete, payment_update, payments_list,
};
use crate::settings::{ui_pref_get, ui_pref_set};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize)]
struct PortablePaths {
    data_dir: String,
    db_path: String,
    orders_dir: String,
    backups_dir: String,
}

#[tauri::command]
fn get_portable_paths(db: State<'_, Db>) -> PortablePaths {
    PortablePaths {
        data_dir: db.data_dir().to_string_lossy().to_string(),
        db_path: db.db_path().to_string_lossy().to_string(),
        orders_dir: db.orders_dir().to_string_lossy().to_string(),
        backups_dir: db.backups_dir().to_string_lossy().to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db = Db::init_portable()?;
            app.manage(db);
            Ok::<(), Box<dyn std::error::Error>>(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_portable_paths,
            orders_list,
            order_get,
            order_create,
            order_update,
            order_soft_delete,
            order_restore,
            order_hard_delete,
            order_unarchive,
            archive_months_overview,
            monthly_income_summary,
            order_folder_path,
            order_files_list,
            payments_list,
            payment_add,
            payment_update,
            payment_delete,
            adjustments_list,
            adjustment_add,
            adjustment_delete,
            ui_pref_get,
            ui_pref_set,
            backup_export,
            backup_import
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
