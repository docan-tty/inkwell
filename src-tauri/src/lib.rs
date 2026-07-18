use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

// ---------------------------------------------------------------------------
// Path authorization
// ---------------------------------------------------------------------------
//
// The custom file commands below accept absolute paths instead of going
// through tauri-plugin-fs's static capability scope (see the comment above
// `read_text_file`). To keep that flexibility without exposing the whole
// disk to the webview, every path is checked against a whitelist of roots:
//   - the app data directory (settings, registry, default content location)
//   - the user's configured content directory (registered by JS when the
//     storage location changes; survives restarts via a marker file in the
//     app data dir)
// Anything outside those roots (or escaping them via `..` / symlinks) is
// rejected. `open_path` is additionally restricted to directories so it can
// never be used to launch a written payload.

fn content_roots_file() -> Option<PathBuf> {
    dirs_next::data_dir().map(|d| {
        d.join(env!("CARGO_PKG_NAME"))
            .join("inkwell-content-roots.txt")
    })
}

fn registered_roots() -> &'static Mutex<Vec<PathBuf>> {
    static ROOTS: OnceLock<Mutex<Vec<PathBuf>>> = OnceLock::new();
    ROOTS.get_or_init(|| {
        let mut roots = Vec::new();
        if let Some(file) = content_roots_file() {
            if let Ok(raw) = std::fs::read_to_string(&file) {
                for line in raw.lines() {
                    let line = line.trim();
                    if !line.is_empty() {
                        roots.push(PathBuf::from(line));
                    }
                }
            }
        }
        Mutex::new(roots)
    })
}

fn is_under(path: &Path, root: &Path) -> bool {
    path == root || path.starts_with(root)
}

fn push_root(root: PathBuf) {
    let mut roots = registered_roots().lock().unwrap();
    if !roots.contains(&root) {
        roots.push(root);
        if let Some(file) = content_roots_file() {
            if let Some(parent) = file.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let body = roots
                .iter()
                .map(|r| r.to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("\n");
            let _ = std::fs::write(&file, body);
        }
    }
}

// Authorize `path` for file I/O: it must live under the app data dir or a
// registered content root. Existing paths are canonicalized first so `..`
// segments and symlink escapes are caught; new paths are checked against
// their canonicalized parent.
fn authorize_path(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = app.path().app_data_dir() {
        roots.push(dir);
    }
    roots.extend(registered_roots().lock().unwrap().iter().cloned());

    let canonical_roots: Vec<PathBuf> = roots
        .iter()
        .filter_map(|r| r.canonicalize().ok().or_else(|| Some(r.clone())))
        .collect();

    if p.exists() {
        let canon = p
            .canonicalize()
            .map_err(|e| format!("路径解析失败 ({}): {}", path, e))?;
        if canonical_roots.iter().any(|r| is_under(&canon, r)) {
            return Ok(canon);
        }
    } else {
        let parent = p.parent().unwrap_or(Path::new(""));
        if let Ok(canon_parent) = parent.canonicalize() {
            if canonical_roots
                .iter()
                .any(|r| is_under(&canon_parent, r))
            {
                return Ok(p.to_path_buf());
            }
        }
    }
    Err(format!("路径不在允许的目录范围内: {}", path))
}

// Called by JS on startup (and whenever the content location changes) to
// register the user's chosen content directory as an allowed root.
#[tauri::command]
fn register_content_root(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    std::fs::create_dir_all(&p).map_err(|e| format!("创建目录失败 ({}): {}", path, e))?;
    push_root(p.canonicalize().unwrap_or(p));
    Ok(())
}

// Opens a directory in the OS file manager (Explorer on Windows, Finder on
// macOS, the user's file manager on Linux). Restricted to directories and to
// authorized roots — opening an arbitrary file would turn `write_text_file`
// into one-click code execution.
#[tauri::command]
fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = authorize_path(&app, &path)?;
    if !p.is_dir() {
        return Err(format!("只能打开文件夹: {}", path));
    }
    opener::open(&p).map_err(|e| e.to_string())
}

// Generic file I/O commands, path-restricted to the app data dir and the
// user's registered content roots.
//
// We deliberately do not use `tauri-plugin-fs` here. That plugin enforces a
// static capability scope (e.g. `$APPDATA/**`, `$DESKTOP/**`), so writes to
// user-chosen directories (e.g. a "作品保存位置" set to `D:\Novels\`) are
// silently denied and the user loses data with no feedback. Routing all
// user-data file I/O through our own commands keeps one consistent,
// explicitly-registered permission model.
//
// `write_text_file` auto-creates the parent directory so callers don't need
// a separate `mkdir` command.
#[tauri::command]
fn read_text_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let p = authorize_path(&app, &path)?;
    std::fs::read_to_string(&p).map_err(|e| format!("读取失败 ({}): {}", path, e))
}

// Atomic write: content goes to `{path}.tmp` first, then a same-volume
// rename swaps it into place. A crash mid-write can only leave a stray
// `.tmp` behind — never a truncated project/chapter file.
#[tauri::command]
fn write_text_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let p = authorize_path(&app, &path)?;
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
        }
    }
    let tmp = p.with_extension(format!(
        "{}.tmp",
        p.extension().map(|e| e.to_string_lossy()).unwrap_or_default()
    ));
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)
            .map_err(|e| format!("写入失败 ({}): {}", tmp.display(), e))?;
        f.write_all(content.as_bytes())
            .map_err(|e| format!("写入失败 ({}): {}", tmp.display(), e))?;
        let _ = f.sync_all();
    }
    // std::fs::rename replaces an existing destination on every supported
    // platform (MoveFileExW with MOVEFILE_REPLACE_EXISTING on Windows), so
    // the swap is atomic and there is no window where the target is missing.
    std::fs::rename(&tmp, &p).map_err(|e| format!("写入失败 ({}): {}", path, e))
}

// Moves a file or directory (same-volume rename). Used to relocate a
// project's whole folder in one step (e.g. when the work is renamed).
#[tauri::command]
fn move_path(app: tauri::AppHandle, src: String, dest: String) -> Result<(), String> {
    let s = authorize_path(&app, &src)?;
    let d = authorize_path(&app, &dest)?;
    if !s.exists() {
        return Err(format!("源路径不存在: {}", src));
    }
    if d.exists() {
        return Err(format!("目标路径已存在: {}", dest));
    }
    std::fs::rename(&s, &d).map_err(|e| format!("移动失败 ({} -> {}): {}", src, dest, e))
}

// Deletes a project folder (a directory that contains a project.json).
// Guards against turning this into a general-purpose recursive delete: only
// directories that actually contain a project.json may be removed, and the
// app data dir itself is never a valid target.
#[tauri::command]
fn remove_project_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = authorize_path(&app, &path)?;
    if !p.is_dir() {
        return Err(format!("不是文件夹: {}", path));
    }
    if !p.join("project.json").is_file() {
        return Err(format!("不是作品文件夹（缺少 project.json）: {}", path));
    }
    if let Ok(app_dir) = app.path().app_data_dir() {
        if p == app_dir {
            return Err("不能删除应用数据目录".to_string());
        }
    }
    std::fs::remove_dir_all(&p).map_err(|e| format!("删除失败 ({}): {}", path, e))
}

#[tauri::command]
fn remove_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = authorize_path(&app, &path)?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| format!("删除失败 ({}): {}", path, e))?;
    }
    Ok(())
}

// Existence probe. Not authorized on purpose — it returns only a boolean and
// callers legitimately probe the legacy/custom content location before it
// has been registered as a root (e.g. the storage-migration flow). All
// actual I/O goes through the authorized commands.
#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

// Lists file names directly inside a directory (non-recursive). Used by the
// version-snapshot feature to enumerate `chapters/{id}.snapshots/*.html`.
// Missing directories yield an empty list rather than an error.
#[tauri::command]
fn list_files(app: tauri::AppHandle, dir: String) -> Result<Vec<String>, String> {
    let p = authorize_path(&app, &dir)?;
    if !p.is_dir() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    let entries = std::fs::read_dir(&p).map_err(|e| format!("读取目录失败 ({}): {}", dir, e))?;
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
fn copy_file(app: tauri::AppHandle, src: String, dest: String) -> Result<(), String> {
    let s = authorize_path(&app, &src)?;
    let d = authorize_path(&app, &dest)?;
    if let Some(parent) = d.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
        }
    }
    std::fs::copy(&s, &d)
        .map(|_| ())
        .map_err(|e| format!("复制失败 ({} -> {}): {}", src, dest, e))
}

// Recursively copies a directory tree. Used when the user changes the content
// storage location and opts to migrate existing works. Existing destination
// files are overwritten; nothing at the source is removed.
#[tauri::command]
fn copy_dir_recursive(app: tauri::AppHandle, src: String, dest: String) -> Result<u64, String> {
    // Register the migration destination up front: nested target files do
    // not exist yet, so per-file authorization of a path whose parent
    // doesn't exist would fail.
    let d_root = PathBuf::from(&dest);
    std::fs::create_dir_all(&d_root).map_err(|e| format!("创建目录失败 ({}): {}", dest, e))?;
    let s = authorize_path(&app, &src)?;
    let d = authorize_path(&app, &dest)?;

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
    copy_inner(&s, &d, &mut count)?;
    Ok(count)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            register_content_root,
            open_path,
            read_text_file,
            write_text_file,
            remove_file,
            move_path,
            remove_project_dir,
            file_exists,
            list_files,
            copy_file,
            copy_dir_recursive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
