use crate::db::Db;
use crate::time::now_ms;
use rusqlite::Connection;
use std::error::Error;
use std::fs;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use tauri::State;
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

fn escape_sql_single_quoted(s: &str) -> String {
    s.replace('\'', "''")
}

fn vacuum_into(conn: &Connection, dest: &Path) -> Result<(), rusqlite::Error> {
    let path = dest.to_string_lossy();
    let sql = format!("VACUUM INTO '{}';", escape_sql_single_quoted(&path));
    conn.execute_batch(&sql)?;
    Ok(())
}

fn zip_add_file(writer: &mut ZipWriter<File>, zip_path: &str, fs_path: &Path) -> Result<(), Box<dyn Error>> {
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    writer.start_file(zip_path, options)?;
    let mut f = File::open(fs_path)?;
    io::copy(&mut f, writer)?;
    Ok(())
}

fn zip_add_dir_recursive(
    writer: &mut ZipWriter<File>,
    dir: &Path,
    zip_prefix: &str,
) -> Result<(), Box<dyn Error>> {
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let prefix = zip_prefix.trim_end_matches('/');
    writer.add_directory(format!("{}/", prefix), options)?;

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let child_zip = format!("{}/{}", prefix, name);

        if entry.file_type()?.is_dir() {
            zip_add_dir_recursive(writer, &path, &child_zip)?;
        } else {
            zip_add_file(writer, &child_zip, &path)?;
        }
    }
    Ok(())
}

fn unzip_to_dir(zip_path: &Path, dest_dir: &Path) -> Result<(), Box<dyn Error>> {
    let f = File::open(zip_path)?;
    let mut archive = ZipArchive::new(f)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let Some(enclosed) = file.enclosed_name().map(|p| p.to_owned()) else {
            return Err(format!("unsafe zip entry: {}", file.name()).into());
        };
        let outpath = dest_dir.join(enclosed);

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut outfile = File::create(&outpath)?;
        io::copy(&mut file, &mut outfile)?;
    }

    Ok(())
}

#[tauri::command]
pub fn backup_export(db: State<'_, Db>, dest_zip_path: Option<String>) -> Result<String, String> {
    let ts = now_ms();
    let dest = match dest_zip_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => db.backups_dir().join(format!("orderly.backup.{}.zip", ts)),
    };

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let snapshot = db.backups_dir().join(format!("orderly.snapshot.{}.db", ts));
    let _ = fs::remove_file(&snapshot);

    db.with_conn(|conn| vacuum_into(conn, &snapshot))
        .map_err(|e| e.to_string())?;

    let out = File::create(&dest).map_err(|e| e.to_string())?;
    let mut writer = ZipWriter::new(out);

    (|| -> Result<(), Box<dyn Error>> {
        zip_add_file(&mut writer, "data/orderly.db", &snapshot)?;
        zip_add_dir_recursive(&mut writer, db.orders_dir(), "data/orders")?;
        Ok(())
    })()
    .map_err(|e| e.to_string())?;

    writer.finish().map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&snapshot);

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn backup_import(db: State<'_, Db>, src_zip_path: String) -> Result<(), String> {
    let src = PathBuf::from(src_zip_path);
    if !src.exists() {
        return Err("zip 文件不存在".to_string());
    }

    let exe_dir = db
        .data_dir()
        .parent()
        .ok_or_else(|| "failed to resolve executable directory".to_string())?
        .to_path_buf();

    let ts = now_ms();
    let restore_root = exe_dir.join(format!("data.restore.{}", ts));
    fs::create_dir_all(&restore_root).map_err(|e| e.to_string())?;

    unzip_to_dir(&src, &restore_root).map_err(|e| e.to_string())?;

    let extracted_data = restore_root.join("data");
    if !extracted_data.exists() {
        return Err("zip 内容不包含 data/ 目录（请使用 Orderly 导出的 zip）".to_string());
    }

    if !extracted_data.join("orderly.db").exists() {
        return Err("zip 内容缺少 data/orderly.db".to_string());
    }
    if !extracted_data.join("orders").exists() {
        return Err("zip 内容缺少 data/orders/".to_string());
    }

    let data_dir = db.data_dir().to_path_buf();
    let bak_dir = exe_dir.join(format!("data.bak.{}", ts));
    let backups_dir = db.backups_dir().to_path_buf();

    db.with_conn_paused(|| {
        if data_dir.exists() {
            fs::rename(&data_dir, &bak_dir)?;
        }
        fs::rename(&extracted_data, &data_dir)?;

        fs::create_dir_all(data_dir.join("orders"))?;
        fs::create_dir_all(&backups_dir)?;

        Ok(())
    })
    .map_err(|e| e.to_string())?;

    let _ = fs::remove_dir_all(&restore_root);
    Ok(())
}
