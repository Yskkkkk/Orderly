use crate::db::Db;
use crate::time::now_ms;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiPrefGetInput {
    pub user_key: String,
    pub page_key: String,
    pub pref_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiPrefGetOutput {
    pub pref_value: Option<String>,
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiPrefSetInput {
    pub user_key: String,
    pub page_key: String,
    pub pref_key: String,
    pub pref_value: String,
}

#[tauri::command]
pub fn ui_pref_get(db: State<'_, Db>, input: UiPrefGetInput) -> Result<UiPrefGetOutput, String> {
    validate_input_keys(&input.user_key, &input.page_key, &input.pref_key)?;
    db.with_conn(|conn| ui_pref_get_impl(conn, &input))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ui_pref_set(db: State<'_, Db>, input: UiPrefSetInput) -> Result<(), String> {
    validate_input_keys(&input.user_key, &input.page_key, &input.pref_key)?;
    db.with_conn(|conn| ui_pref_set_impl(conn, &input))
        .map_err(|e| e.to_string())
}

fn validate_input_keys(user_key: &str, page_key: &str, pref_key: &str) -> Result<(), String> {
    if user_key.trim().is_empty() {
        return Err("userKey 不能为空".to_string());
    }
    if page_key.trim().is_empty() {
        return Err("pageKey 不能为空".to_string());
    }
    if pref_key.trim().is_empty() {
        return Err("prefKey 不能为空".to_string());
    }
    Ok(())
}

fn ui_pref_get_impl(conn: &Connection, input: &UiPrefGetInput) -> Result<UiPrefGetOutput, rusqlite::Error> {
    let row = conn
        .query_row(
            "SELECT pref_value, updated_at_ms
             FROM ui_preferences
             WHERE user_key = ?1 AND page_key = ?2 AND pref_key = ?3",
            params![input.user_key, input.page_key, input.pref_key],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()?;

    if let Some((pref_value, updated_at_ms)) = row {
        return Ok(UiPrefGetOutput {
            pref_value: Some(pref_value),
            updated_at_ms: Some(updated_at_ms),
        });
    }

    Ok(UiPrefGetOutput {
        pref_value: None,
        updated_at_ms: None,
    })
}

fn ui_pref_set_impl(conn: &Connection, input: &UiPrefSetInput) -> Result<(), rusqlite::Error> {
    let ts = now_ms();
    conn.execute(
        "INSERT INTO ui_preferences (user_key, page_key, pref_key, pref_value, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(user_key, page_key, pref_key)
         DO UPDATE SET
           pref_value = excluded.pref_value,
           updated_at_ms = excluded.updated_at_ms",
        params![
            input.user_key,
            input.page_key,
            input.pref_key,
            input.pref_value,
            ts,
        ],
    )?;
    Ok(())
}
