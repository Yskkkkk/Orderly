use rusqlite::Connection;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
    db_path: PathBuf,
    orders_dir: PathBuf,
    backups_dir: PathBuf,
}

impl Db {
    pub fn init_portable() -> Result<Self, Box<dyn Error>> {
        let exe_dir = portable_exe_dir()?;

        let data_dir = exe_dir.join("data");
        let db_path = data_dir.join("orderly.db");
        let orders_dir = data_dir.join("orders");
        let backups_dir = data_dir.join("backups");

        std::fs::create_dir_all(&orders_dir)?;
        std::fs::create_dir_all(&backups_dir)?;

        let conn = Connection::open(&db_path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        ensure_schema(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            data_dir,
            db_path,
            orders_dir,
            backups_dir,
        })
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub fn orders_dir(&self) -> &Path {
        &self.orders_dir
    }

    pub fn backups_dir(&self) -> &Path {
        &self.backups_dir
    }

    #[allow(dead_code)]
    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> Result<T, rusqlite::Error>) -> Result<T, rusqlite::Error> {
        let guard = self.conn.lock().expect("db mutex poisoned");
        f(&guard)
    }

    pub fn with_conn_paused<T>(&self, f: impl FnOnce() -> Result<T, Box<dyn Error>>) -> Result<T, Box<dyn Error>> {
        let mut guard = self.conn.lock().expect("db mutex poisoned");
        let in_mem = Connection::open_in_memory()?;
        let old = std::mem::replace(&mut *guard, in_mem);
        drop(old);

        let res = f();

        let reopened = (|| -> Result<Connection, Box<dyn Error>> {
            let conn = Connection::open(&self.db_path)?;
            conn.pragma_update(None, "foreign_keys", "ON")?;
            ensure_schema(&conn)?;
            Ok(conn)
        })();

        match reopened {
            Ok(conn) => {
                let _ = std::mem::replace(&mut *guard, conn);
                res
            }
            Err(e) => Err(e),
        }
    }
}

fn portable_exe_dir() -> Result<PathBuf, Box<dyn Error>> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "failed to resolve executable directory"))?;
    Ok(exe_dir.to_path_buf())
}

pub(crate) fn ensure_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(SCHEMA_SQL)?;
    ensure_schema_migrations(conn)?;
    Ok(())
}

fn ensure_schema_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    let has_requirement_path: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('orders') WHERE name = 'requirement_path'",
        [],
        |row| row.get(0),
    )?;
    if has_requirement_path == 0 {
        conn.execute(
            "ALTER TABLE orders ADD COLUMN requirement_path TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    let has_archive_month: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('orders') WHERE name = 'archive_month'",
        [],
        |row| row.get(0),
    )?;
    if has_archive_month == 0 {
        conn.execute("ALTER TABLE orders ADD COLUMN archive_month TEXT", [])?;
    }

    let has_deleted_at: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('orders') WHERE name = 'deleted_at_ms'",
        [],
        |row| row.get(0),
    )?;
    if has_deleted_at == 0 {
        conn.execute("ALTER TABLE orders ADD COLUMN deleted_at_ms INTEGER", [])?;
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at_ms)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_archive_month ON orders(archive_month)",
        [],
    )?;
    conn.execute(
        r#"
UPDATE orders
SET archive_month = strftime('%Y-%m', updated_at_ms / 1000, 'unixepoch', 'localtime')
WHERE status = 'done' AND archive_month IS NULL
"#,
        [],
    )?;
    Ok(())
}

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  system_name TEXT NOT NULL,
  wechat TEXT NOT NULL,
  username TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  requirement_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  tech_stack TEXT NOT NULL DEFAULT '',
  deliverables TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  archive_month TEXT,
  total_base_cents INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_wechat ON orders(wechat);
CREATE INDEX IF NOT EXISTS idx_orders_username ON orders(username);
CREATE INDEX IF NOT EXISTS idx_orders_system_name ON orders(system_name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at_ms);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at_ms);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL,
  paid_at_ms INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at_ms);

CREATE TABLE IF NOT EXISTS amount_adjustments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delta_cents INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_order_id ON amount_adjustments(order_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_at ON amount_adjustments(at_ms);

CREATE TABLE IF NOT EXISTS order_archive_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  month TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archive_events_order_id ON order_archive_events(order_id);
CREATE INDEX IF NOT EXISTS idx_archive_events_created_at ON order_archive_events(created_at_ms);

CREATE TABLE IF NOT EXISTS ui_preferences (
  user_key TEXT NOT NULL,
  page_key TEXT NOT NULL,
  pref_key TEXT NOT NULL,
  pref_value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_key, page_key, pref_key)
);

CREATE TRIGGER IF NOT EXISTS trg_payments_touch_order_ai
AFTER INSERT ON payments
BEGIN
  UPDATE orders
  SET updated_at_ms = (CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE id = NEW.order_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_touch_order_au
AFTER UPDATE ON payments
BEGIN
  UPDATE orders
  SET updated_at_ms = (CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE id = NEW.order_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_touch_order_ad
AFTER DELETE ON payments
BEGIN
  UPDATE orders
  SET updated_at_ms = (CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE id = OLD.order_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_adjustments_touch_order_ai
AFTER INSERT ON amount_adjustments
BEGIN
  UPDATE orders
  SET updated_at_ms = (CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE id = NEW.order_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_adjustments_touch_order_ad
AFTER DELETE ON amount_adjustments
BEGIN
  UPDATE orders
  SET updated_at_ms = (CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE id = OLD.order_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_adjustments_touch_order_au
AFTER UPDATE ON amount_adjustments
BEGIN
  UPDATE orders
  SET updated_at_ms = (CAST(strftime('%s','now') AS INTEGER) * 1000)
  WHERE id = NEW.order_id;
END;
"#;
