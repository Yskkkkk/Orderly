use crate::db::Db;
use crate::time::now_ms;
use rusqlite::types::Value;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderListItem {
    pub id: String,
    pub system_name: String,
    pub wechat: String,
    pub username: String,
    pub repo_url: String,
    pub requirement_path: String,
    pub status: String,
    pub tech_stack: String,
    pub deliverables: String,
    pub note: String,
    pub archive_month: Option<String>,
    pub total_base_cents: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub deleted_at_ms: Option<i64>,

    pub total_current_cents: i64,
    pub paid_sum_cents: i64,
    pub deposit_sum_cents: i64,
    pub outstanding_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderGetResponse {
    pub order: OrderRecord,
    pub computed: OrderComputed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderRecord {
    pub id: String,
    pub system_name: String,
    pub wechat: String,
    pub username: String,
    pub repo_url: String,
    pub requirement_path: String,
    pub status: String,
    pub tech_stack: String,
    pub deliverables: String,
    pub note: String,
    pub archive_month: Option<String>,
    pub total_base_cents: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub deleted_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderComputed {
    pub total_current_cents: i64,
    pub paid_sum_cents: i64,
    pub deposit_sum_cents: i64,
    pub outstanding_cents: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrdersListFilters {
    pub q: Option<String>,
    pub status: Option<String>,
    pub created_from_ms: Option<i64>,
    pub created_to_ms: Option<i64>,
    pub updated_from_ms: Option<i64>,
    pub updated_to_ms: Option<i64>,
    pub archive_month: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub deleted_mode: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderCreatePayload {
    pub system_name: String,
    pub wechat: String,
    pub username: String,
    pub repo_url: String,
    pub requirement_path: Option<String>,
    pub status: Option<String>,
    pub tech_stack: Option<String>,
    pub deliverables: Option<String>,
    pub note: Option<String>,
    pub total_base_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderCreateResponse {
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderFileEntry {
    pub rel_path: String,
    pub abs_path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderPatch {
    pub system_name: Option<String>,
    pub wechat: Option<String>,
    pub username: Option<String>,
    pub repo_url: Option<String>,
    pub requirement_path: Option<String>,
    pub status: Option<String>,
    pub tech_stack: Option<String>,
    pub deliverables: Option<String>,
    pub note: Option<String>,
    pub total_base_cents: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMonthOverviewItem {
    pub month: String,
    pub order_count: i64,
    pub paid_sum_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyIncomeSummary {
    pub month: String,
    pub archived_orders: i64,
    pub paid_sum_cents: i64,
    pub deposit_sum_cents: i64,
    pub outstanding_sum_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRecord {
    pub id: String,
    pub order_id: String,
    pub amount_cents: i64,
    pub r#type: String,
    pub paid_at_ms: i64,
    pub note: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentCreatePayload {
    pub amount_cents: i64,
    pub r#type: String,
    pub paid_at_ms: i64,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentPatch {
    pub amount_cents: Option<i64>,
    pub r#type: Option<String>,
    pub paid_at_ms: Option<i64>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AmountAdjustmentRecord {
    pub id: String,
    pub order_id: String,
    pub delta_cents: i64,
    pub reason: String,
    pub at_ms: i64,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmountAdjustmentCreatePayload {
    pub delta_cents: i64,
    pub reason: Option<String>,
    pub at_ms: i64,
}

#[tauri::command]
pub fn orders_list(db: State<'_, Db>, filters: OrdersListFilters) -> Result<Vec<OrderListItem>, String> {
    db.with_conn(|conn| orders_list_impl(conn, &filters))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn order_get(db: State<'_, Db>, id: String) -> Result<OrderGetResponse, String> {
    db.with_conn(|conn| order_get_impl(conn, &id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn order_create(db: State<'_, Db>, payload: OrderCreatePayload) -> Result<OrderCreateResponse, String> {
    let order_id = Uuid::new_v4().to_string();
    let orders_dir = db.orders_dir().to_path_buf();
    let order_dir = orders_dir.join(&order_id);

    fs::create_dir_all(&order_dir).map_err(|e| e.to_string())?;

    db.with_conn(|conn| order_create_impl(conn, &order_id, &payload))
        .map_err(|e| e.to_string())?;

    Ok(OrderCreateResponse { id: order_id })
}

#[tauri::command]
pub fn order_update(db: State<'_, Db>, id: String, patch: OrderPatch) -> Result<(), String> {
    db.with_conn(|conn| order_update_impl(conn, &id, patch))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn order_soft_delete(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| order_soft_delete_impl(conn, &id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn order_restore(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| order_restore_impl(conn, &id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn order_hard_delete(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| ensure_order_not_archived(conn, &id))
        .map_err(|e| e.to_string())?;

    let order_dir = db.orders_dir().join(&id);
    if order_dir.exists() {
        fs::remove_dir_all(&order_dir).map_err(|e| e.to_string())?;
    }
    db.with_conn(|conn| order_hard_delete_impl(conn, &id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn order_unarchive(db: State<'_, Db>, id: String, reason: Option<String>) -> Result<(), String> {
    db.with_conn(|conn| order_unarchive_impl(conn, &id, reason.as_deref().unwrap_or("")))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_months_overview(db: State<'_, Db>) -> Result<Vec<ArchiveMonthOverviewItem>, String> {
    db.with_conn(|conn| archive_months_overview_impl(conn))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn monthly_income_summary(
    db: State<'_, Db>,
    month: String,
) -> Result<MonthlyIncomeSummary, String> {
    db.with_conn(|conn| monthly_income_summary_impl(conn, &month))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn order_folder_path(db: State<'_, Db>, order_id: String) -> Result<String, String> {
    let path = db.orders_dir().join(order_id);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn order_files_list(db: State<'_, Db>, order_id: String) -> Result<Vec<OrderFileEntry>, String> {
    let base = db.orders_dir().join(&order_id);
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let mut entries: Vec<OrderFileEntry> = Vec::new();
    visit_dir(&base, &base, &mut entries).map_err(|e| e.to_string())?;
    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(entries)
}

#[tauri::command]
pub fn payments_list(db: State<'_, Db>, order_id: String) -> Result<Vec<PaymentRecord>, String> {
    db.with_conn(|conn| payments_list_impl(conn, &order_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn payment_add(db: State<'_, Db>, order_id: String, payload: PaymentCreatePayload) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    db.with_conn(|conn| payment_add_impl(conn, &id, &order_id, &payload))
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn payment_update(db: State<'_, Db>, id: String, patch: PaymentPatch) -> Result<(), String> {
    db.with_conn(|conn| payment_update_impl(conn, &id, patch))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn payment_delete(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| payment_delete_impl(conn, &id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn adjustments_list(db: State<'_, Db>, order_id: String) -> Result<Vec<AmountAdjustmentRecord>, String> {
    db.with_conn(|conn| adjustments_list_impl(conn, &order_id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn adjustment_add(
    db: State<'_, Db>,
    order_id: String,
    payload: AmountAdjustmentCreatePayload,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    db.with_conn(|conn| adjustment_add_impl(conn, &id, &order_id, &payload))
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn adjustment_delete(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| adjustment_delete_impl(conn, &id))
        .map_err(|e| e.to_string())
}

fn visit_dir(dir: &Path, base: &Path, out: &mut Vec<OrderFileEntry>) -> Result<(), std::io::Error> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        let is_dir = file_type.is_dir();

        let rel = to_rel_slash(&path, base);
        out.push(OrderFileEntry {
            rel_path: rel,
            abs_path: path.to_string_lossy().to_string(),
            is_dir,
        });

        if is_dir {
            visit_dir(&path, base, out)?;
        }
    }
    Ok(())
}

fn to_rel_slash(path: &PathBuf, base: &Path) -> String {
    let rel = match path.strip_prefix(base) {
        Ok(p) => p,
        Err(_) => path.as_path(),
    };
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn orders_list_impl(conn: &Connection, filters: &OrdersListFilters) -> Result<Vec<OrderListItem>, rusqlite::Error> {
    let mut sql = String::from(
        r#"
SELECT
  o.id,
  o.system_name,
  o.wechat,
  o.username,
  o.repo_url,
  o.requirement_path,
  o.status,
  o.tech_stack,
  o.deliverables,
  o.note,
  o.archive_month,
  o.total_base_cents,
  o.created_at_ms,
  o.updated_at_ms,
  o.deleted_at_ms,
  (o.total_base_cents + COALESCE((SELECT SUM(a.delta_cents) FROM amount_adjustments a WHERE a.order_id = o.id), 0)) AS total_current_cents,
  COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id), 0) AS paid_sum_cents,
  COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id AND p.type = 'deposit'), 0) AS deposit_sum_cents
FROM orders o
"#,
    );

    let mut where_parts: Vec<&'static str> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(q) = filters.q.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        where_parts.push("(o.system_name LIKE ? OR o.wechat LIKE ? OR o.username LIKE ?)");
        let pattern = format!("%{}%", q);
        params.push(Value::from(pattern.clone()));
        params.push(Value::from(pattern.clone()));
        params.push(Value::from(pattern));
    }

    if let Some(status) = filters.status.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        where_parts.push("o.status = ?");
        params.push(Value::from(status.to_string()));
    }

    if let Some(v) = filters.created_from_ms {
        where_parts.push("o.created_at_ms >= ?");
        params.push(Value::from(v));
    }
    if let Some(v) = filters.created_to_ms {
        where_parts.push("o.created_at_ms <= ?");
        params.push(Value::from(v));
    }
    if let Some(v) = filters.updated_from_ms {
        where_parts.push("o.updated_at_ms >= ?");
        params.push(Value::from(v));
    }
    if let Some(v) = filters.updated_to_ms {
        where_parts.push("o.updated_at_ms <= ?");
        params.push(Value::from(v));
    }
    if let Some(v) = filters
        .archive_month
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if v == "__none__" {
            where_parts.push("o.archive_month IS NULL");
        } else {
            where_parts.push("o.archive_month = ?");
            params.push(Value::from(v.to_string()));
        }
    }
    let deleted_mode = filters
        .deleted_mode
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("active");
    match deleted_mode {
        "deleted" => where_parts.push("o.deleted_at_ms IS NOT NULL"),
        "all" => {}
        _ => where_parts.push("o.deleted_at_ms IS NULL"),
    }

    if !where_parts.is_empty() {
        sql.push_str("WHERE ");
        sql.push_str(&where_parts.join(" AND "));
        sql.push('\n');
    }

    sql.push_str("ORDER BY o.updated_at_ms DESC\n");
    let limit = filters.limit.map(|v| v.clamp(1, 500));
    let offset = filters.offset.map(|v| v.max(0));
    if let Some(v) = limit {
        sql.push_str("LIMIT ?\n");
        params.push(Value::from(v));
        if let Some(o) = offset {
            sql.push_str("OFFSET ?\n");
            params.push(Value::from(o));
        }
    } else if let Some(o) = offset {
        sql.push_str("LIMIT -1 OFFSET ?\n");
        params.push(Value::from(o));
    }

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| map_order_list_item(row))?;

    let mut items = Vec::new();
    for r in rows {
        let mut item = r?;
        item.outstanding_cents = item.total_current_cents - item.paid_sum_cents;
        items.push(item);
    }
    Ok(items)
}

fn map_order_list_item(row: &Row<'_>) -> Result<OrderListItem, rusqlite::Error> {
    Ok(OrderListItem {
        id: row.get(0)?,
        system_name: row.get(1)?,
        wechat: row.get(2)?,
        username: row.get(3)?,
        repo_url: row.get(4)?,
        requirement_path: row.get(5)?,
        status: row.get(6)?,
        tech_stack: row.get(7)?,
        deliverables: row.get(8)?,
        note: row.get(9)?,
        archive_month: row.get(10)?,
        total_base_cents: row.get(11)?,
        created_at_ms: row.get(12)?,
        updated_at_ms: row.get(13)?,
        deleted_at_ms: row.get(14)?,
        total_current_cents: row.get(15)?,
        paid_sum_cents: row.get(16)?,
        deposit_sum_cents: row.get(17)?,
        outstanding_cents: 0,
    })
}

fn order_get_impl(conn: &Connection, id: &str) -> Result<OrderGetResponse, rusqlite::Error> {
    let order: OrderRecord = conn.query_row(
        r#"
SELECT
  id, system_name, wechat, username, repo_url, requirement_path, status,
  tech_stack, deliverables, note, archive_month, total_base_cents, created_at_ms, updated_at_ms, deleted_at_ms
FROM orders
WHERE id = ?
"#,
        params![id],
        |row| {
            Ok(OrderRecord {
                id: row.get(0)?,
                system_name: row.get(1)?,
                wechat: row.get(2)?,
                username: row.get(3)?,
                repo_url: row.get(4)?,
                requirement_path: row.get(5)?,
                status: row.get(6)?,
                tech_stack: row.get(7)?,
                deliverables: row.get(8)?,
                note: row.get(9)?,
                archive_month: row.get(10)?,
                total_base_cents: row.get(11)?,
                created_at_ms: row.get(12)?,
                updated_at_ms: row.get(13)?,
                deleted_at_ms: row.get(14)?,
            })
        },
    )?;

    let computed: OrderComputed = conn.query_row(
        r#"
SELECT
  (o.total_base_cents + COALESCE((SELECT SUM(a.delta_cents) FROM amount_adjustments a WHERE a.order_id = o.id), 0)) AS total_current_cents,
  COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id), 0) AS paid_sum_cents,
  COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id AND p.type = 'deposit'), 0) AS deposit_sum_cents
FROM orders o
WHERE o.id = ?
"#,
        params![id],
        |row| {
            let total_current_cents: i64 = row.get(0)?;
            let paid_sum_cents: i64 = row.get(1)?;
            let deposit_sum_cents: i64 = row.get(2)?;
            Ok(OrderComputed {
                total_current_cents,
                paid_sum_cents,
                deposit_sum_cents,
                outstanding_cents: total_current_cents - paid_sum_cents,
            })
        },
    )?;

    Ok(OrderGetResponse { order, computed })
}

fn order_create_impl(conn: &Connection, id: &str, payload: &OrderCreatePayload) -> Result<(), rusqlite::Error> {
    let created = now_ms();
    let status = payload.status.clone().unwrap_or_else(|| "pending_send".to_string());
    let requirement_path = payload.requirement_path.clone().unwrap_or_default();
    let tech_stack = payload.tech_stack.clone().unwrap_or_default();
    let deliverables = payload.deliverables.clone().unwrap_or_default();
    let note = payload.note.clone().unwrap_or_default();
    let archive_month = if status == "done" {
        Some(local_month_from_ms(conn, created)?)
    } else {
        None
    };

    conn.execute(
        r#"
INSERT INTO orders (
  id, system_name, wechat, username, repo_url, requirement_path, status,
  tech_stack, deliverables, note, archive_month, total_base_cents, created_at_ms, updated_at_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"#,
        params![
            id,
            payload.system_name,
            payload.wechat,
            payload.username,
            payload.repo_url,
            requirement_path,
            status,
            tech_stack,
            deliverables,
            note,
            archive_month,
            payload.total_base_cents,
            created,
            created
        ],
    )?;
    if let Some(month) = archive_month.as_deref() {
        insert_archive_event(conn, id, "archive", Some(month), "status_done_auto", created)?;
    }
    Ok(())
}

fn order_update_impl(conn: &Connection, id: &str, patch: OrderPatch) -> Result<(), rusqlite::Error> {
    let current: OrderRecord = conn.query_row(
        r#"
SELECT
  id, system_name, wechat, username, repo_url, requirement_path, status,
  tech_stack, deliverables, note, archive_month, total_base_cents, created_at_ms, updated_at_ms, deleted_at_ms
FROM orders
WHERE id = ?
"#,
        params![id],
        |row| {
            Ok(OrderRecord {
                id: row.get(0)?,
                system_name: row.get(1)?,
                wechat: row.get(2)?,
                username: row.get(3)?,
                repo_url: row.get(4)?,
                requirement_path: row.get(5)?,
                status: row.get(6)?,
                tech_stack: row.get(7)?,
                deliverables: row.get(8)?,
                note: row.get(9)?,
                archive_month: row.get(10)?,
                total_base_cents: row.get(11)?,
                created_at_ms: row.get(12)?,
                updated_at_ms: row.get(13)?,
                deleted_at_ms: row.get(14)?,
            })
        },
    )?;

    if current.archive_month.is_some() {
        return Err(archived_locked_error());
    }

    let updated = now_ms();
    let next_status = patch.status.clone().unwrap_or_else(|| current.status.clone());
    let next_archive_month = if current.status != "done" && next_status == "done" {
        Some(local_month_from_ms(conn, updated)?)
    } else {
        None
    };
    conn.execute(
        r#"
UPDATE orders
SET
  system_name = ?,
  wechat = ?,
  username = ?,
  repo_url = ?,
  requirement_path = ?,
  status = ?,
  tech_stack = ?,
  deliverables = ?,
  note = ?,
  archive_month = ?,
  total_base_cents = ?,
  updated_at_ms = ?
WHERE id = ?
"#,
        params![
            patch.system_name.unwrap_or(current.system_name),
            patch.wechat.unwrap_or(current.wechat),
            patch.username.unwrap_or(current.username),
            patch.repo_url.unwrap_or(current.repo_url),
            patch.requirement_path.unwrap_or(current.requirement_path),
            next_status,
            patch.tech_stack.unwrap_or(current.tech_stack),
            patch.deliverables.unwrap_or(current.deliverables),
            patch.note.unwrap_or(current.note),
            next_archive_month,
            patch.total_base_cents.unwrap_or(current.total_base_cents),
            updated,
            id
        ],
    )?;
    if let Some(month) = next_archive_month.as_deref() {
        insert_archive_event(conn, id, "archive", Some(month), "status_done_auto", updated)?;
    }
    Ok(())
}

fn order_soft_delete_impl(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    ensure_order_not_archived(conn, id)?;

    let now = now_ms();
    let affected = conn.execute(
        r#"
UPDATE orders
SET deleted_at_ms = ?, updated_at_ms = ?
WHERE id = ? AND deleted_at_ms IS NULL
"#,
        params![now, now, id],
    )?;
    if affected == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

fn order_restore_impl(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    let now = now_ms();
    let affected = conn.execute(
        r#"
UPDATE orders
SET deleted_at_ms = NULL, updated_at_ms = ?
WHERE id = ? AND deleted_at_ms IS NOT NULL
"#,
        params![now, id],
    )?;
    if affected == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

fn order_hard_delete_impl(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    ensure_order_not_archived(conn, id)?;

    let affected = conn.execute("DELETE FROM orders WHERE id = ?", params![id])?;
    if affected == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

fn order_unarchive_impl(conn: &Connection, id: &str, reason: &str) -> Result<(), rusqlite::Error> {
    let now = now_ms();
    let affected = conn.execute(
        r#"
UPDATE orders
SET archive_month = NULL, updated_at_ms = ?
WHERE id = ? AND archive_month IS NOT NULL
"#,
        params![now, id],
    )?;
    if affected == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    insert_archive_event(conn, id, "unarchive", None, reason, now)?;
    Ok(())
}

fn normalize_archive_month(raw: &str) -> Result<Option<String>, rusqlite::Error> {
    let s = raw.trim();
    if s.is_empty() {
        return Ok(None);
    }
    let bytes = s.as_bytes();
    if bytes.len() != 7
        || bytes[4] != b'-'
        || !bytes[0..4].iter().all(|b| b.is_ascii_digit())
        || !bytes[5..7].iter().all(|b| b.is_ascii_digit())
    {
        return Err(rusqlite::Error::ToSqlConversionFailure(
            format!("invalid archive month format: {}", s).into(),
        ));
    }
    let month: i32 = s[5..7]
        .parse()
        .map_err(|_| {
            rusqlite::Error::ToSqlConversionFailure(
                std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid archive month").into(),
            )
        })?;
    if !(1..=12).contains(&month) {
        return Err(rusqlite::Error::ToSqlConversionFailure(
            format!("invalid archive month value: {}", s).into(),
        ));
    }
    Ok(Some(s.to_string()))
}

fn archive_months_overview_impl(conn: &Connection) -> Result<Vec<ArchiveMonthOverviewItem>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        r#"
SELECT
  o.archive_month,
  COUNT(*) AS order_count,
  COALESCE(SUM((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id)), 0) AS paid_sum_cents
FROM orders o
WHERE o.archive_month IS NOT NULL
GROUP BY o.archive_month
ORDER BY o.archive_month DESC
"#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(ArchiveMonthOverviewItem {
            month: row.get(0)?,
            order_count: row.get(1)?,
            paid_sum_cents: row.get(2)?,
        })
    })?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn monthly_income_summary_impl(conn: &Connection, month: &str) -> Result<MonthlyIncomeSummary, rusqlite::Error> {
    let normalized = normalize_archive_month(month)?.ok_or_else(|| {
        rusqlite::Error::ToSqlConversionFailure(
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "month cannot be empty").into(),
        )
    })?;

    let (archived_orders, paid_sum_cents, deposit_sum_cents, outstanding_sum_cents): (i64, i64, i64, i64) =
        conn.query_row(
            r#"
SELECT
  (SELECT COUNT(*) FROM orders o WHERE o.archive_month = ?) AS archived_orders,
  (
    SELECT COALESCE(SUM(p.amount_cents), 0)
    FROM payments p
    WHERE strftime('%Y-%m', p.paid_at_ms / 1000, 'unixepoch', 'localtime') = ?
  ) AS paid_sum_cents,
  (
    SELECT COALESCE(SUM(p.amount_cents), 0)
    FROM payments p
    WHERE p.type = 'deposit'
      AND strftime('%Y-%m', p.paid_at_ms / 1000, 'unixepoch', 'localtime') = ?
  ) AS deposit_sum_cents,
  (
    SELECT COALESCE(SUM(
      (o.total_base_cents + COALESCE((SELECT SUM(a.delta_cents) FROM amount_adjustments a WHERE a.order_id = o.id), 0))
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id), 0)
    ), 0)
    FROM orders o
    WHERE o.archive_month = ?
  ) AS outstanding_sum_cents
"#,
            params![normalized, normalized, normalized, normalized],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

    Ok(MonthlyIncomeSummary {
        month: normalized,
        archived_orders,
        paid_sum_cents,
        deposit_sum_cents,
        outstanding_sum_cents,
    })
}

fn normalize_payment_type(raw: &str) -> Option<&'static str> {
    match raw.trim() {
        "deposit" => Some("deposit"),
        "final" => Some("final"),
        "other" => Some("other"),
        _ => None,
    }
}

fn payments_list_impl(conn: &Connection, order_id: &str) -> Result<Vec<PaymentRecord>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        r#"
SELECT
  id, order_id, amount_cents, type, paid_at_ms, note, created_at_ms
FROM payments
WHERE order_id = ?
ORDER BY paid_at_ms ASC, created_at_ms ASC
"#,
    )?;

    let rows = stmt.query_map(params![order_id], |row| map_payment_record(row))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn map_payment_record(row: &Row<'_>) -> Result<PaymentRecord, rusqlite::Error> {
    Ok(PaymentRecord {
        id: row.get(0)?,
        order_id: row.get(1)?,
        amount_cents: row.get(2)?,
        r#type: row.get(3)?,
        paid_at_ms: row.get(4)?,
        note: row.get(5)?,
        created_at_ms: row.get(6)?,
    })
}

fn payment_add_impl(conn: &Connection, id: &str, order_id: &str, payload: &PaymentCreatePayload) -> Result<(), rusqlite::Error> {
    ensure_order_not_archived(conn, order_id)?;

    let created = now_ms();
    let ty = normalize_payment_type(&payload.r#type).ok_or_else(|| {
        rusqlite::Error::ToSqlConversionFailure(format!("invalid payment type: {}", payload.r#type).into())
    })?;

    conn.execute(
        r#"
INSERT INTO payments (
  id, order_id, amount_cents, type, paid_at_ms, note, created_at_ms
) VALUES (?, ?, ?, ?, ?, ?, ?)
"#,
        params![
            id,
            order_id,
            payload.amount_cents,
            ty,
            payload.paid_at_ms,
            payload.note.clone().unwrap_or_default(),
            created
        ],
    )?;
    Ok(())
}

fn payment_update_impl(conn: &Connection, id: &str, patch: PaymentPatch) -> Result<(), rusqlite::Error> {
    let current: PaymentRecord = conn.query_row(
        r#"
SELECT
  id, order_id, amount_cents, type, paid_at_ms, note, created_at_ms
FROM payments
WHERE id = ?
"#,
        params![id],
        |row| map_payment_record(row),
    )?;
    ensure_order_not_archived(conn, &current.order_id)?;

    let ty = match patch.r#type.as_deref() {
        Some(v) => normalize_payment_type(v).ok_or_else(|| {
            rusqlite::Error::ToSqlConversionFailure(format!("invalid payment type: {}", v).into())
        })?,
        None => current.r#type.as_str(),
    };

    conn.execute(
        r#"
UPDATE payments
SET
  amount_cents = ?,
  type = ?,
  paid_at_ms = ?,
  note = ?
WHERE id = ?
"#,
        params![
            patch.amount_cents.unwrap_or(current.amount_cents),
            ty,
            patch.paid_at_ms.unwrap_or(current.paid_at_ms),
            patch.note.unwrap_or(current.note),
            id
        ],
    )?;
    Ok(())
}

fn payment_delete_impl(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    let order_id = conn
        .query_row(
            "SELECT order_id FROM payments WHERE id = ?",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(order_id) = order_id else {
        return Ok(());
    };
    ensure_order_not_archived(conn, &order_id)?;

    conn.execute("DELETE FROM payments WHERE id = ?", params![id])?;
    Ok(())
}

fn adjustments_list_impl(conn: &Connection, order_id: &str) -> Result<Vec<AmountAdjustmentRecord>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        r#"
SELECT
  id, order_id, delta_cents, reason, at_ms, created_at_ms
FROM amount_adjustments
WHERE order_id = ?
ORDER BY at_ms ASC, created_at_ms ASC
"#,
    )?;

    let rows = stmt.query_map(params![order_id], |row| {
        Ok(AmountAdjustmentRecord {
            id: row.get(0)?,
            order_id: row.get(1)?,
            delta_cents: row.get(2)?,
            reason: row.get(3)?,
            at_ms: row.get(4)?,
            created_at_ms: row.get(5)?,
        })
    })?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn adjustment_add_impl(
    conn: &Connection,
    id: &str,
    order_id: &str,
    payload: &AmountAdjustmentCreatePayload,
) -> Result<(), rusqlite::Error> {
    ensure_order_not_archived(conn, order_id)?;

    let created = now_ms();
    conn.execute(
        r#"
INSERT INTO amount_adjustments (
  id, order_id, delta_cents, reason, at_ms, created_at_ms
) VALUES (?, ?, ?, ?, ?, ?)
"#,
        params![
            id,
            order_id,
            payload.delta_cents,
            payload.reason.clone().unwrap_or_default(),
            payload.at_ms,
            created
        ],
    )?;
    Ok(())
}

fn adjustment_delete_impl(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    let order_id = conn
        .query_row(
            "SELECT order_id FROM amount_adjustments WHERE id = ?",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(order_id) = order_id else {
        return Ok(());
    };
    ensure_order_not_archived(conn, &order_id)?;

    conn.execute("DELETE FROM amount_adjustments WHERE id = ?", params![id])?;
    Ok(())
}

fn local_month_from_ms(conn: &Connection, at_ms: i64) -> Result<String, rusqlite::Error> {
    conn.query_row(
        "SELECT strftime('%Y-%m', ? / 1000, 'unixepoch', 'localtime')",
        params![at_ms],
        |row| row.get(0),
    )
}

fn archived_locked_error() -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(
        std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "ORDER_ARCHIVED_LOCKED: order is archived, unarchive first",
        )
        .into(),
    )
}

fn ensure_order_not_archived(conn: &Connection, order_id: &str) -> Result<(), rusqlite::Error> {
    let archived_month = conn.query_row(
        "SELECT archive_month FROM orders WHERE id = ?",
        params![order_id],
        |row| row.get::<_, Option<String>>(0),
    )?;

    if archived_month.is_some() {
        return Err(archived_locked_error());
    }
    Ok(())
}

fn insert_archive_event(
    conn: &Connection,
    order_id: &str,
    event_type: &str,
    month: Option<&str>,
    reason: &str,
    created_at_ms: i64,
) -> Result<(), rusqlite::Error> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        r#"
INSERT INTO order_archive_events (
  id, order_id, event_type, month, reason, created_at_ms
) VALUES (?, ?, ?, ?, ?, ?)
"#,
        params![id, order_id, event_type, month, reason, created_at_ms],
    )?;
    Ok(())
}
