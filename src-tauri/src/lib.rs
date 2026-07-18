use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};

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

fn content_roots_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    // Marker file lives in the app data dir itself (%APPDATA%/com.inkwell.app)
    // — alongside the settings/registry it authorizes, not the shared
    // dirs_next::data_dir() root that other apps also use.
    //
    // Threat model: this file is the persistence of the "user picked a
    // content folder" consent. A local attacker who can rewrite it can widen
    // the webview's write scope to arbitrary directories — an accepted risk:
    // such an attacker already has full user-level file access without the
    // app. The whitelist exists to stop *webview-reachable* path injection,
    // not a local adversary.
    app.path().app_data_dir().ok().map(|d| d.join("inkwell-content-roots.txt"))
}

fn registered_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    static CACHE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
    // The marker path is a per-app constant; OnceLock just caches the read.
    let _ = CACHE.get_or_init(|| Mutex::new(content_roots_file(app)));
    let file = CACHE.get().unwrap().lock().unwrap().clone();
    let mut roots = Vec::new();
    if let Some(file) = file {
        if let Ok(raw) = std::fs::read_to_string(&file) {
            for line in raw.lines() {
                let line = line.trim();
                if !line.is_empty() {
                    // Roots may have been persisted in verbatim form by an
                    // older build — normalize on read so comparisons work.
                    roots.push(strip_verbatim(Path::new(line)));
                }
            }
        }
    }
    roots
}

// Strips the Windows verbatim-path prefix (\\?\) that `canonicalize` adds.
// `starts_with` on verbatim vs. plain paths never matches, which would make a
// canonicalized root fail to authorize paths under itself. Normalizing both
// sides keeps the comparison honest.
fn strip_verbatim(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        p.to_path_buf()
    }
}

fn is_under(path: &Path, root: &Path) -> bool {
    path == root || path.starts_with(root)
}

fn push_root(app: &tauri::AppHandle, root: PathBuf) {
    let mut roots = registered_roots(app);
    if !roots.contains(&root) {
        roots.push(root);
        if let Some(file) = content_roots_file(app) {
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

// Authorize `path` for file I/O: it must live under the app data dir, a
// registered content root, or a one-shot export grant (see `grant_export_path`).
fn authorize_path(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    let mut roots: Vec<PathBuf> = Vec::new();
    // The app data dir is always a root (settings, registry, default content).
    // Strip any verbatim prefix so `starts_with` compares like-for-like.
    if let Ok(dir) = app.path().app_data_dir() {
        roots.push(strip_verbatim(&dir));
    }
    roots.extend(registered_roots(app));

    let canonical_roots: Vec<PathBuf> = roots
        .iter()
        // Fail closed: a root that cannot be canonicalized (missing, dangling
        // symlink) must not authorize anything — do NOT fall back to the raw
        // path, which `..` segments could spoof. The verbatim prefix is
        // stripped so `starts_with` compares like-for-like.
        .filter_map(|r| r.canonicalize().ok())
        .map(|r| strip_verbatim(&r))
        .collect();

    if p.exists() {
        let canon = strip_verbatim(
            &p.canonicalize()
                .map_err(|e| format!("路径解析失败 ({}): {}", path, e))?,
        );
        // MSIX-packaged builds redirect the app's private data root
        // (%APPDATA%\<id>) to a Packages\...\LocalCache location at the
        // filesystem layer. `canonicalize` follows that redirect, so a
        // whitelist entry for the reported path never matches the
        // canonicalized one. When the redirect is detected, authorize by the
        // pre-canonicalization path instead — the whitelist already vetted
        // that exact path, and the redirect only ever rewrites the app's own
        // data root (it cannot widen the scope to user content).
        let redirected = !is_under(&p, &canon) && !is_under(&canon, &p);
        let matches = canonical_roots.iter().any(|r| {
            is_under(&canon, r) || (redirected && is_under(&p, r))
        });
        if matches {
            return Ok(canon);
        }
        // One-shot export grant: the exact file the user picked in the save
        // dialog. Consumed on use so it cannot be reused for other files.
        if take_export_grant(&canon) {
            return Ok(canon);
        }
    } else {
        // The target file does not exist yet (a new project/chapter). The
        // whitelist check must look at the nearest existing ancestor: the
        // immediate parent often doesn't exist either (write_text_file
        // auto-creates it), and canonicalizing a missing path fails.
        // MSIX may still redirect that ancestor at the filesystem layer, so
        // fall back to the raw lexical path when the canonicalized form is
        // unrelated to every root.
        let mut ancestor = p.parent();
        let mut canon_ancestor: Option<PathBuf> = None;
        while let Some(dir) = ancestor {
            if dir.as_os_str().is_empty() {
                break;
            }
            if let Ok(c) = dir.canonicalize() {
                canon_ancestor = Some(strip_verbatim(&c));
                break;
            }
            ancestor = dir.parent();
        }
        let raw_match = canonical_roots.iter().any(|r| is_under(&p, r));
        let canon_match = canon_ancestor
            .as_ref()
            .map(|c| canonical_roots.iter().any(|r| is_under(c, r)))
            .unwrap_or(false);
        if raw_match || canon_match {
            return Ok(p.to_path_buf());
        }
        if take_export_grant(&p) {
            return Ok(p.to_path_buf());
        }
    }
    Err(format!("路径不在允许的目录范围内: {}", path))
}

// Called by JS on startup (and whenever the content location changes) to
// register the user's chosen content directory as an allowed root.
#[tauri::command]
fn register_content_root(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    std::fs::create_dir_all(&p).map_err(|e| format!("创建目录失败 ({}): {}", path, e))?;
    // Persist in normalized (non-verbatim) form so a later read → canonicalize
    // → strip round-trips to the same string and doesn't accumulate variants.
    let normalized = strip_verbatim(&p.canonicalize().unwrap_or_else(|_| p.clone()));
    push_root(&app, normalized);
    Ok(())
}

// One-shot export grants: the user explicitly picked this exact file in the
// OS save dialog, so writing THAT file is authorized — once. Grants are
// consumed by authorize_path and never widen into a directory root.
fn export_grants() -> &'static Mutex<Vec<PathBuf>> {
    static GRANTS: OnceLock<Mutex<Vec<PathBuf>>> = OnceLock::new();
    GRANTS.get_or_init(|| Mutex::new(Vec::new()))
}

fn take_export_grant(path: &Path) -> bool {
    let mut grants = export_grants().lock().unwrap();
    if let Some(idx) = grants.iter().position(|g| g == path) {
        grants.remove(idx);
        true
    } else {
        false
    }
}

/// Registers an exact file path the user just picked in a save dialog as a
/// one-shot write grant. Called by the export flow right after the dialog
/// resolves and before `write_text_file`.
#[tauri::command]
fn grant_export_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let grant = if p.exists() {
        p.canonicalize().map_err(|e| format!("路径解析失败 ({}): {}", path, e))?
    } else {
        p
    };
    export_grants().lock().unwrap().push(grant);
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
            grant_export_path,
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
        .on_window_event(|window, event| {
            // Own the close path: when the user clicks X, notify the webview
            // (so it can fire off a best-effort content flush) and then tear
            // the window down. Doing this in Rust — instead of a JS
            // onCloseRequested handler — guarantees the X button can never be
            // blocked by a pending JS promise or a hung invoke.
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    let _ = window.emit("inkwell:closing", ());
                }
                // The window is gone but the process would otherwise linger
                // (Windows keeps the event loop alive after the last window
                // closes). Exit explicitly so closing the main window actually
                // quits the app. exit() is deferred one tick off the event
                // handler — called synchronously it races the Destroyed
                // dispatch and gets swallowed.
                tauri::WindowEvent::Destroyed => {
                    let handle = window.app_handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                        handle.exit(0);
                    });
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
