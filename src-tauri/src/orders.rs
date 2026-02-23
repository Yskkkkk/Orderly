use crate::db::Db;
use crate::time::now_ms;
use rusqlite::types::Value;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;

const BUSINESS_TZ_USER_KEY: &str = "default";
const BUSINESS_TZ_PAGE_KEY: &str = "orders";
const BUSINESS_TZ_PREF_KEY: &str = "business_tz_mode";

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
pub struct ArchiveEventRecord {
    pub id: String,
    pub order_id: String,
    pub event_type: String,
    pub month: Option<String>,
    pub reason: String,
    pub created_at_ms: i64,
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
pub fn archive_events_list(db: State<'_, Db>, order_id: String) -> Result<Vec<ArchiveEventRecord>, String> {
    db.with_conn(|conn| archive_events_list_impl(conn, &order_id))
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
        where_parts.push(
            "(o.system_name LIKE ? OR o.wechat LIKE ? OR o.username LIKE ? OR EXISTS (SELECT 1 FROM orders_fts WHERE orders_fts.rowid = o.rowid AND orders_fts MATCH ?))",
        );
        let pattern = format!("%{}%", q);
        params.push(Value::from(pattern.clone()));
        params.push(Value::from(pattern.clone()));
        params.push(Value::from(pattern));
        params.push(Value::from(to_fts_query(q)));
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
        Some(month_from_ms_by_business_tz(conn, created)?)
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
        Some(month_from_ms_by_business_tz(conn, updated)?)
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

    let paid_month_expr = if business_tz_mode(conn)? == "utc" {
        "strftime('%Y-%m', p.paid_at_ms / 1000, 'unixepoch')"
    } else {
        "strftime('%Y-%m', p.paid_at_ms / 1000, 'unixepoch', 'localtime')"
    };
    let sql = format!(
        r#"
SELECT
  (SELECT COUNT(*) FROM orders o WHERE o.archive_month = ?) AS archived_orders,
  (
    SELECT COALESCE(SUM(p.amount_cents), 0)
    FROM payments p
    WHERE {paid_month_expr} = ?
  ) AS paid_sum_cents,
  (
    SELECT COALESCE(SUM(p.amount_cents), 0)
    FROM payments p
    WHERE p.type = 'deposit'
      AND {paid_month_expr} = ?
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
    );
    let (archived_orders, paid_sum_cents, deposit_sum_cents, outstanding_sum_cents): (i64, i64, i64, i64) =
        conn.query_row(
            &sql,
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

fn archive_events_list_impl(conn: &Connection, order_id: &str) -> Result<Vec<ArchiveEventRecord>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        r#"
SELECT
  id, order_id, event_type, month, reason, created_at_ms
FROM order_archive_events
WHERE order_id = ?
ORDER BY created_at_ms DESC
"#,
    )?;

    let rows = stmt.query_map(params![order_id], |row| {
        Ok(ArchiveEventRecord {
            id: row.get(0)?,
            order_id: row.get(1)?,
            event_type: row.get(2)?,
            month: row.get(3)?,
            reason: row.get(4)?,
            created_at_ms: row.get(5)?,
        })
    })?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
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

fn month_from_ms_by_business_tz(conn: &Connection, at_ms: i64) -> Result<String, rusqlite::Error> {
    if business_tz_mode(conn)? == "utc" {
        return conn.query_row(
            "SELECT strftime('%Y-%m', ? / 1000, 'unixepoch')",
            params![at_ms],
            |row| row.get(0),
        );
    }

    conn.query_row(
        "SELECT strftime('%Y-%m', ? / 1000, 'unixepoch', 'localtime')",
        params![at_ms],
        |row| row.get(0),
    )
}

fn business_tz_mode(conn: &Connection) -> Result<&'static str, rusqlite::Error> {
    let pref: Option<String> = conn
        .query_row(
            r#"
SELECT pref_value
FROM ui_preferences
WHERE user_key = ? AND page_key = ? AND pref_key = ?
"#,
            params![BUSINESS_TZ_USER_KEY, BUSINESS_TZ_PAGE_KEY, BUSINESS_TZ_PREF_KEY],
            |row| row.get(0),
        )
        .optional()?;

    if pref
        .as_deref()
        .map(|s| s.trim().eq_ignore_ascii_case("utc"))
        .unwrap_or(false)
    {
        Ok("utc")
    } else {
        Ok("local")
    }
}

fn to_fts_query(raw: &str) -> String {
    let mut tokens: Vec<String> = raw
        .split_whitespace()
        .map(|s| s.trim_matches(|c: char| c.is_ascii_punctuation()))
        .filter(|s| !s.is_empty())
        .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
        .collect();

    if tokens.is_empty() {
        tokens.push(format!("\"{}\"", raw.replace('"', "\"\"")));
    }
    tokens.join(" OR ")
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::ensure_schema;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open sqlite in memory");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        ensure_schema(&conn).expect("ensure schema");
        conn
    }

    fn month_from_ms(conn: &Connection, ms: i64) -> String {
        conn.query_row(
            "SELECT strftime('%Y-%m', ? / 1000, 'unixepoch', 'localtime')",
            params![ms],
            |row| row.get(0),
        )
        .expect("query month")
    }

    fn month_from_ms_utc(conn: &Connection, ms: i64) -> String {
        conn.query_row(
            "SELECT strftime('%Y-%m', ? / 1000, 'unixepoch')",
            params![ms],
            |row| row.get(0),
        )
        .expect("query utc month")
    }

    fn month_from_now(conn: &Connection) -> String {
        conn.query_row(
            "SELECT strftime('%Y-%m', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .expect("query current month")
    }

    fn sample_payload(status: &str) -> OrderCreatePayload {
        OrderCreatePayload {
            system_name: "system".into(),
            wechat: "wxid".into(),
            username: "user".into(),
            repo_url: "https://github.com/example/repo".into(),
            requirement_path: Some(String::new()),
            status: Some(status.into()),
            tech_stack: Some("Rust".into()),
            deliverables: Some("zip".into()),
            note: Some(String::new()),
            total_base_cents: 100_00,
        }
    }

    fn search_filters(q: &str) -> OrdersListFilters {
        OrdersListFilters {
            q: Some(q.to_string()),
            status: None,
            created_from_ms: None,
            created_to_ms: None,
            updated_from_ms: None,
            updated_to_ms: None,
            archive_month: None,
            limit: Some(100),
            offset: Some(0),
            deleted_mode: Some("active".to_string()),
        }
    }

    fn set_business_tz_mode(conn: &Connection, mode: &str) {
        conn.execute(
            r#"
INSERT INTO ui_preferences (user_key, page_key, pref_key, pref_value, updated_at_ms)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_key, page_key, pref_key)
DO UPDATE SET pref_value = excluded.pref_value, updated_at_ms = excluded.updated_at_ms
"#,
            params![
                BUSINESS_TZ_USER_KEY,
                BUSINESS_TZ_PAGE_KEY,
                BUSINESS_TZ_PREF_KEY,
                mode,
                now_ms()
            ],
        )
        .expect("set business tz mode");
    }

    #[test]
    fn auto_archive_when_create_done() {
        let conn = test_conn();
        order_create_impl(&conn, "o1", &sample_payload("done")).expect("create order");

        let month: Option<String> = conn
            .query_row("SELECT archive_month FROM orders WHERE id = 'o1'", [], |row| row.get(0))
            .expect("query archive month");
        assert_eq!(month, Some(month_from_now(&conn)));

        let events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM order_archive_events WHERE order_id = 'o1' AND event_type = 'archive'",
                [],
                |row| row.get(0),
            )
            .expect("query event count");
        assert_eq!(events, 1);
    }

    #[test]
    fn auto_archive_when_status_turns_done() {
        let conn = test_conn();
        order_create_impl(&conn, "o2", &sample_payload("pending_send")).expect("create order");

        order_update_impl(
            &conn,
            "o2",
            OrderPatch {
                status: Some("done".into()),
                system_name: None,
                wechat: None,
                username: None,
                repo_url: None,
                requirement_path: None,
                tech_stack: None,
                deliverables: None,
                note: None,
                total_base_cents: None,
            },
        )
        .expect("update order");

        let month: Option<String> = conn
            .query_row("SELECT archive_month FROM orders WHERE id = 'o2'", [], |row| row.get(0))
            .expect("query archive month");
        assert_eq!(month, Some(month_from_now(&conn)));
    }

    #[test]
    fn archived_order_is_locked_until_unarchive() {
        let conn = test_conn();
        order_create_impl(&conn, "o3", &sample_payload("done")).expect("create done order");

        let update_result = order_update_impl(
            &conn,
            "o3",
            OrderPatch {
                note: Some("changed".into()),
                system_name: None,
                wechat: None,
                username: None,
                repo_url: None,
                requirement_path: None,
                status: None,
                tech_stack: None,
                deliverables: None,
                total_base_cents: None,
            },
        );
        assert!(update_result.is_err());
        let err = update_result.err().expect("must error").to_string();
        assert!(err.contains("ORDER_ARCHIVED_LOCKED"));

        order_unarchive_impl(&conn, "o3", "test").expect("unarchive");

        order_update_impl(
            &conn,
            "o3",
            OrderPatch {
                note: Some("changed".into()),
                system_name: None,
                wechat: None,
                username: None,
                repo_url: None,
                requirement_path: None,
                status: None,
                tech_stack: None,
                deliverables: None,
                total_base_cents: None,
            },
        )
        .expect("update after unarchive");
    }

    #[test]
    fn monthly_income_summary_uses_paid_at_month() {
        let conn = test_conn();
        order_create_impl(&conn, "o4", &sample_payload("pending_send")).expect("create order");

        let target_ms = 1_704_067_200_000_i64; // 2024-01-20T00:00:00Z
        let target_month = month_from_ms(&conn, target_ms);

        payment_add_impl(
            &conn,
            "p1",
            "o4",
            &PaymentCreatePayload {
                amount_cents: 120_00,
                r#type: "deposit".into(),
                paid_at_ms: target_ms,
                note: None,
            },
        )
        .expect("add payment");

        payment_add_impl(
            &conn,
            "p2",
            "o4",
            &PaymentCreatePayload {
                amount_cents: -20_00,
                r#type: "other".into(),
                paid_at_ms: target_ms,
                note: None,
            },
        )
        .expect("add refund");

        let summary = monthly_income_summary_impl(&conn, &target_month).expect("summary");
        assert_eq!(summary.month, target_month);
        assert_eq!(summary.archived_orders, 0);
        assert_eq!(summary.paid_sum_cents, 100_00);
        assert_eq!(summary.deposit_sum_cents, 120_00);
    }

    #[test]
    fn migration_backfills_done_order_archive_month_by_updated_at() {
        let conn = test_conn();

        conn.execute(
            r#"
INSERT INTO orders (
  id, system_name, wechat, username, repo_url, requirement_path, status,
  tech_stack, deliverables, note, archive_month, total_base_cents, created_at_ms, updated_at_ms, deleted_at_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"#,
            params![
                "o5",
                "sys",
                "wx",
                "user",
                "https://github.com/example/r",
                "",
                "done",
                "",
                "",
                "",
                Option::<String>::None,
                0_i64,
                1_700_000_000_000_i64,
                1_704_067_200_000_i64,
                Option::<i64>::None
            ],
        )
        .expect("insert done order without archive month");

        let before: Option<String> = conn
            .query_row("SELECT archive_month FROM orders WHERE id='o5'", [], |row| row.get(0))
            .expect("query before migration");
        assert_eq!(before, None);

        crate::db::ensure_schema(&conn).expect("re-run schema migration");

        let after: Option<String> = conn
            .query_row("SELECT archive_month FROM orders WHERE id='o5'", [], |row| row.get(0))
            .expect("query after migration");
        assert_eq!(after, Some(month_from_ms(&conn, 1_704_067_200_000_i64)));
    }

    #[test]
    fn archive_events_list_returns_archive_and_unarchive() {
        let conn = test_conn();
        order_create_impl(&conn, "o6", &sample_payload("done")).expect("create done order");
        order_unarchive_impl(&conn, "o6", "manual").expect("unarchive");

        let events = archive_events_list_impl(&conn, "o6").expect("list archive events");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, "unarchive");
        assert_eq!(events[0].reason, "manual");
        assert_eq!(events[1].event_type, "archive");
    }

    #[test]
    fn monthly_income_summary_respects_utc_policy() {
        let conn = test_conn();
        set_business_tz_mode(&conn, "utc");
        order_create_impl(&conn, "o7", &sample_payload("pending_send")).expect("create order");

        let target_ms = 1_709_251_200_000_i64; // 2024-03-01T00:00:00Z
        let target_month = month_from_ms_utc(&conn, target_ms);

        payment_add_impl(
            &conn,
            "p7",
            "o7",
            &PaymentCreatePayload {
                amount_cents: 66_00,
                r#type: "other".into(),
                paid_at_ms: target_ms,
                note: None,
            },
        )
        .expect("add payment");

        let summary = monthly_income_summary_impl(&conn, &target_month).expect("summary");
        assert_eq!(summary.paid_sum_cents, 66_00);
    }

    #[test]
    fn orders_list_search_matches_fts_fields() {
        let conn = test_conn();
        order_create_impl(
            &conn,
            "o8",
            &OrderCreatePayload {
                system_name: "Alpha".into(),
                wechat: "wx_alpha".into(),
                username: "alpha".into(),
                repo_url: "https://github.com/example/alpha".into(),
                requirement_path: Some(String::new()),
                status: Some("pending_send".into()),
                tech_stack: Some("Rust Tokio".into()),
                deliverables: Some("Windows installer".into()),
                note: Some("Supports OCR export".into()),
                total_base_cents: 100_00,
            },
        )
        .expect("create order o8");

        let by_stack = orders_list_impl(&conn, &search_filters("Tokio")).expect("query by tech stack");
        assert!(by_stack.iter().any(|o| o.id == "o8"));

        let by_deliverable = orders_list_impl(&conn, &search_filters("installer")).expect("query by deliverables");
        assert!(by_deliverable.iter().any(|o| o.id == "o8"));

        let by_note = orders_list_impl(&conn, &search_filters("OCR")).expect("query by note");
        assert!(by_note.iter().any(|o| o.id == "o8"));
    }
}
