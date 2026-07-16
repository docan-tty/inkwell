// Opens a path in the OS file manager (Explorer on Windows, Finder on macOS,
// the user's file manager on Linux). Exposed as a custom Tauri command so
// callers can open any path — including user-chosen locations that are not
// covered by a static capability scope — without going through a plugin's
// internal scope check.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    opener::open(&path).map_err(|e| e.to_string())
}

// Generic, unscope'd file I/O commands.
//
// We deliberately do not use `tauri-plugin-fs` here. That plugin enforces a
// static capability scope (e.g. `$APPDATA/**`, `$DESKTOP/**`), so writes to
// user-chosen directories (e.g. a "作品保存位置" set to `D:\Novels\`) are
// silently denied and the user loses data with no feedback. Routing all
// user-data file I/O through our own commands bypasses the scope entirely
// and keeps a single, consistent permission model — matching how `open_path`
// is handled.
//
// `write_text_file` auto-creates the parent directory so callers don't need
// a separate `mkdir` command.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败 ({}): {}", path, e))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
        }
    }
    std::fs::write(p, content).map_err(|e| format!("写入失败 ({}): {}", path, e))
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| format!("删除失败 ({}): {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

// Lists file names directly inside a directory (non-recursive). Used by the
// version-snapshot feature to enumerate `chapters/{id}.snapshots/*.html`.
// Missing directories yield an empty list rather than an error.
#[tauri::command]
fn list_files(dir: String) -> Result<Vec<String>, String> {
    let p = std::path::Path::new(&dir);
    if !p.is_dir() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    let entries = std::fs::read_dir(p).map_err(|e| format!("读取目录失败 ({}): {}", dir, e))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    Ok(names)
}

// Copies a single file, creating the destination's parent directory.
#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    let d = std::path::Path::new(&dest);
    if let Some(parent) = d.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
        }
    }
    std::fs::copy(&src, &dest)
        .map(|_| ())
        .map_err(|e| format!("复制失败 ({} -> {}): {}", src, dest, e))
}

// Recursively copies a directory tree. Used when the user changes the content
// storage location and opts to migrate existing works. Existing destination
// files are overwritten; nothing at the source is removed.
#[tauri::command]
fn copy_dir_recursive(src: String, dest: String) -> Result<u64, String> {
    fn copy_inner(src: &std::path::Path, dest: &std::path::Path, count: &mut u64) -> Result<(), String> {
        if !src.is_dir() {
            return Ok(());
        }
        std::fs::create_dir_all(dest)
            .map_err(|e| format!("创建目录失败 ({}): {}", dest.display(), e))?;
        let entries = std::fs::read_dir(src)
            .map_err(|e| format!("读取目录失败 ({}): {}", src.display(), e))?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_type = entry.file_type().map_err(|e| e.to_string())?;
            let from = entry.path();
            let to = dest.join(entry.file_name());
            if file_type.is_dir() {
                copy_inner(&from, &to, count)?;
            } else if file_type.is_file() {
                std::fs::copy(&from, &to)
                    .map_err(|e| format!("复制失败 ({} -> {}): {}", from.display(), to.display(), e))?;
                *count += 1;
            }
        }
        Ok(())
    }
    let mut count = 0u64;
    copy_inner(
        std::path::Path::new(&src),
        std::path::Path::new(&dest),
        &mut count,
    )?;
    Ok(count)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_path,
            read_text_file,
            write_text_file,
            remove_file,
            file_exists,
            list_files,
            copy_file,
            copy_dir_recursive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
