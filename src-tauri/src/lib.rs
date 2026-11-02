use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, UNIX_EPOCH},
};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const NOTE_EXTENSION: &str = "md";
const DEFAULT_NOTE_TITLE: &str = "无标题笔记";
const TRAY_ID: &str = "main-tray";
/// 图片统一放在笔记目录的 images/ 子目录中，Markdown 里使用相对路径引用。
const IMAGES_DIR: &str = "images";
const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "heic", "heif",
];
/// 全局唤起快捷键：即使窗口隐藏在菜单栏，也能快速回到主界面。
const GLOBAL_SHORTCUT: &str = "CommandOrControl+Shift+Space";

/// ⌘Q 第一次触发时先让前端保存，保存完成后再放行退出。
static QUIT_PENDING: AtomicBool = AtomicBool::new(false);
static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct StoredSettings {
    notes_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsInfo {
    notes_dir: String,
    default_notes_dir: String,
    is_custom: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteMeta {
    path: String,
    file_name: String,
    title: String,
    preview: String,
    content: String,
    updated_at: i64,
    created_at: i64,
    size: u64,
}

/* ---------------------------------- 路径与设置 ---------------------------------- */

fn settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取配置目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn load_stored(app: &AppHandle) -> StoredSettings {
    settings_file(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn default_notes_dir(app: &AppHandle) -> PathBuf {
    // 放在用户主目录而不是「文稿」：macOS 的「文稿」受 TCC 隐私保护，
    // 首次访问会弹授权框，记事本不应该在启动时被系统权限卡住。
    if let Ok(home) = app.path().home_dir() {
        return home.join("快捷记事本");
    }
    app.path()
        .document_dir()
        .map(|dir| dir.join("快捷记事本"))
        .unwrap_or_else(|_| {
            app.path()
                .app_data_dir()
                .map(|dir| dir.join("notes"))
                .unwrap_or_else(|_| PathBuf::from("notes"))
        })
}

fn resolve_notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let stored = load_stored(app).notes_dir;
    let dir = stored
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_notes_dir(app));

    fs::create_dir_all(&dir).map_err(|e| format!("无法创建笔记目录 {}: {e}", dir.display()))?;
    if !dir.is_dir() {
        return Err(format!("笔记目录不可用: {}", dir.display()));
    }
    Ok(dir)
}

fn settings_info(app: &AppHandle) -> Result<SettingsInfo, String> {
    let default_dir = default_notes_dir(app);
    let notes_dir = resolve_notes_dir(app)?;
    Ok(SettingsInfo {
        is_custom: notes_dir != default_dir,
        notes_dir: notes_dir.to_string_lossy().to_string(),
        default_notes_dir: default_dir.to_string_lossy().to_string(),
    })
}

fn expand_tilde(input: &str) -> String {
    if input == "~" {
        return std::env::var("HOME").unwrap_or_else(|_| input.to_string());
    }
    if let Some(rest) = input.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    input.to_string()
}

/// 只允许操作笔记目录中的直接子文件，避免误删/误写其他位置。
fn ensure_inside(dir: &Path, path: &Path) -> Result<(), String> {
    let base = dir
        .canonicalize()
        .map_err(|e| format!("笔记目录不可用: {e}"))?;
    let parent = path
        .parent()
        .ok_or_else(|| "无效的文件路径".to_string())?
        .canonicalize()
        .map_err(|e| format!("文件路径不可用: {e}"))?;
    if parent != base {
        return Err("只能操作笔记保存目录中的文件".to_string());
    }
    Ok(())
}

/// 允许访问笔记目录下的子目录（例如 images/），但必须真实位于目录内部。
fn ensure_descendant(dir: &Path, path: &Path) -> Result<(), String> {
    let base = dir
        .canonicalize()
        .map_err(|e| format!("笔记目录不可用: {e}"))?;
    let target = path
        .canonicalize()
        .map_err(|e| format!("图片路径不可用: {e}"))?;
    if !target.starts_with(&base) {
        return Err("只能读取笔记目录中的图片".to_string());
    }
    Ok(())
}

/* ---------------------------------- 笔记解析 ---------------------------------- */

fn title_of(content: &str) -> String {
    content
        .lines()
        .next()
        .unwrap_or("")
        .trim_start_matches('\u{feff}')
        .trim()
        .to_string()
}

fn preview_of(content: &str) -> String {
    content
        .lines()
        .skip(1)
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("")
        .chars()
        .take(120)
        .collect()
}

fn millis(time: Option<std::time::SystemTime>) -> i64 {
    time.and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn note_from_path(path: &Path) -> Result<NoteMeta, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("无法读取笔记信息: {e}"))?;
    let content = fs::read_to_string(path).map_err(|e| format!("无法读取笔记内容: {e}"))?;
    let updated_at = millis(metadata.modified().ok());
    let created_at = millis(metadata.created().ok());
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(NoteMeta {
        path: path.to_string_lossy().to_string(),
        file_name,
        title: title_of(&content),
        preview: preview_of(&content),
        content,
        updated_at,
        created_at: if created_at > 0 { created_at } else { updated_at },
        size: metadata.len(),
    })
}

fn sanitize_file_stem(title: &str) -> String {
    let replaced: String = title
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            ch if ch.is_control() => ' ',
            ch => ch,
        })
        .collect();
    let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim_matches(|ch: char| ch == '.' || ch == ' ');

    let mut stem: String = trimmed.chars().take(60).collect();
    stem = stem.trim_end().to_string();
    if stem.is_empty() {
        DEFAULT_NOTE_TITLE.to_string()
    } else {
        stem
    }
}

fn unique_note_path(dir: &Path, stem: &str, exclude: Option<&Path>) -> PathBuf {
    let first = dir.join(format!("{stem}.{NOTE_EXTENSION}"));
    if exclude == Some(first.as_path()) {
        return first;
    }
    if !first.exists() {
        return first;
    }
    for index in 2..10_000 {
        let candidate = dir.join(format!("{stem} {index}.{NOTE_EXTENSION}"));
        if exclude == Some(candidate.as_path()) || !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!(
        "{stem}-{}.{NOTE_EXTENSION}",
        std::process::id()
    ))
}

/* ------------------------------------ 图片 ------------------------------------ */

/// 图片文件名保持可读，同时去掉会破坏 Markdown 链接的字符。
fn image_file_stem(input: &str) -> String {
    let replaced: String = input
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '(' | ')' | '[' | ']'
            | '#' | '%' => ' ',
            ch if ch.is_control() => ' ',
            ch => ch,
        })
        .collect();
    let stem = replaced.split_whitespace().collect::<Vec<_>>().join("-");
    let stem = stem
        .trim_matches(|ch: char| ch == '.' || ch == '-')
        .chars()
        .take(60)
        .collect::<String>();
    if stem.is_empty() {
        "图片".to_string()
    } else {
        stem
    }
}

fn unique_image_path(dir: &Path, stem: &str, extension: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{extension}"));
    if !first.exists() {
        return first;
    }
    for index in 2..10_000 {
        let candidate = dir.join(format!("{stem}-{index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}-{}.{extension}", std::process::id()))
}

/// 把选中的图片复制到 `<笔记目录>/images/`，返回 Markdown 中使用的相对路径。
fn copy_image_into(notes_dir: &Path, source: &Path) -> Result<String, String> {
    let metadata = fs::metadata(source).map_err(|e| format!("无法读取图片: {e}"))?;
    if !metadata.is_file() {
        return Err("请选择图片文件".to_string());
    }
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("图片不能超过 25 MB".to_string());
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("不支持这种图片格式".to_string());
    }

    let images_dir = notes_dir.join(IMAGES_DIR);
    fs::create_dir_all(&images_dir).map_err(|e| format!("无法创建图片目录: {e}"))?;

    let stem = image_file_stem(
        source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("图片"),
    );
    let target = unique_image_path(&images_dir, &stem, &extension);
    fs::copy(source, &target).map_err(|e| format!("复制图片失败: {e}"))?;

    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图片文件名无效".to_string())?;
    Ok(format!("{IMAGES_DIR}/{file_name}"))
}

fn image_mime(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        _ => None,
    }
}

fn image_extension_for_mime(mime: &str) -> Option<&'static str> {
    match mime.to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "image/avif" => Some("avif"),
        "image/heic" => Some("heic"),
        "image/heif" => Some("heif"),
        _ => None,
    }
}

/// 读取笔记目录中的图片，并转成预览可以直接使用的 data URL。
fn read_image_data_url(notes_dir: &Path, relative: &str) -> Result<String, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path.components().any(|component| {
            !matches!(
                component,
                std::path::Component::Normal(_) | std::path::Component::CurDir
            )
        })
    {
        return Err("图片路径不合法".to_string());
    }

    let image_path = notes_dir.join(relative_path);
    if !image_path.is_file() {
        return Err("图片不存在".to_string());
    }
    ensure_descendant(notes_dir, &image_path)?;

    let extension = image_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = image_mime(&extension).ok_or_else(|| "不支持这种图片格式".to_string())?;

    let bytes = fs::read(&image_path).map_err(|e| format!("读取图片失败: {e}"))?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("图片不能超过 25 MB".to_string());
    }

    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

/// 保存来自剪贴板（data URL）的图片，返回 Markdown 中使用的相对路径。
fn save_image_data_url(
    notes_dir: &Path,
    file_name: &str,
    data_url: &str,
) -> Result<String, String> {
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "图片数据格式无效".to_string())?;
    let header = header
        .strip_prefix("data:")
        .ok_or_else(|| "图片数据格式无效".to_string())?;
    let mime = header
        .strip_suffix(";base64")
        .ok_or_else(|| "图片数据格式无效".to_string())?;
    let extension = image_extension_for_mime(mime)
        .ok_or_else(|| "不支持这种图片格式".to_string())?;

    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "图片数据解码失败".to_string())?;
    if bytes.is_empty() {
        return Err("剪贴板中没有图片".to_string());
    }
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("图片不能超过 25 MB".to_string());
    }

    let images_dir = notes_dir.join(IMAGES_DIR);
    fs::create_dir_all(&images_dir).map_err(|e| format!("无法创建图片目录: {e}"))?;

    let stem = image_file_stem(
        Path::new(file_name)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("图片"),
    );
    let target = unique_image_path(&images_dir, &stem, extension);
    fs::write(&target, bytes).map_err(|e| format!("保存图片失败: {e}"))?;

    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图片文件名无效".to_string())?;
    Ok(format!("{IMAGES_DIR}/{file_name}"))
}

/* ---------------------------------- 系统操作 ---------------------------------- */

#[cfg(target_os = "macos")]
fn open_path(path: &Path, reveal: bool) -> Result<(), String> {
    let mut command = std::process::Command::new("open");
    if reveal {
        command.arg("-R");
    }
    let status = command
        .arg(path)
        .status()
        .map_err(|e| format!("无法打开访达: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("打开访达失败".to_string())
    }
}

#[cfg(target_os = "windows")]
fn open_path(path: &Path, reveal: bool) -> Result<(), String> {
    let mut command = std::process::Command::new("explorer");
    if reveal {
        command.arg(format!("/select,{}", path.display()));
    } else {
        command.arg(path);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("无法打开资源管理器: {e}"))
}

#[cfg(target_os = "linux")]
fn open_path(path: &Path, reveal: bool) -> Result<(), String> {
    let target = if reveal {
        path.parent().unwrap_or(path)
    } else {
        path
    };
    std::process::Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("无法打开文件管理器: {e}"))
}

/* ------------------------------------ 托盘 ------------------------------------ */

/// 前端没有响应退出请求时兜底，避免应用卡在“退不掉”的状态。
fn force_quit_after(app: &AppHandle, delay: Duration) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        if !ALLOW_EXIT.load(Ordering::SeqCst) {
            ALLOW_EXIT.store(true, Ordering::SeqCst);
            handle.exit(0);
        }
    });
}

fn show_main_window(app: &AppHandle) {
    // 处理 ⌘H 隐藏应用的情况；只 show 窗口不足以让整个应用回到前台
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/* ------------------------------------ 命令 ------------------------------------ */

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<SettingsInfo, String> {
    ensure_settings_file(&app)?;
    settings_info(&app)
}

fn ensure_settings_file(app: &AppHandle) -> Result<(), String> {
    let file = settings_file(app)?;
    if file.exists() {
        return Ok(());
    }
    let raw = serde_json::to_string_pretty(&StoredSettings::default())
        .map_err(|e| format!("初始化设置失败: {e}"))?;
    fs::write(file, raw).map_err(|e| format!("初始化设置失败: {e}"))
}

#[tauri::command]
fn set_notes_dir(app: AppHandle, dir: String) -> Result<SettingsInfo, String> {
    let expanded = expand_tilde(dir.trim());
    if expanded.is_empty() {
        return Err("目录不能为空".to_string());
    }

    let path = PathBuf::from(&expanded);
    if !path.is_absolute() {
        return Err("请使用绝对路径".to_string());
    }

    fs::create_dir_all(&path).map_err(|e| format!("无法创建目录: {e}"))?;
    if !path.is_dir() {
        return Err("所选路径不是文件夹".to_string());
    }

    // 提前验证目录可写，避免保存时才发现问题
    let probe = path.join(format!(".quicknote-write-test-{}", std::process::id()));
    fs::write(&probe, b"").map_err(|e| format!("目录不可写: {e}"))?;
    let _ = fs::remove_file(&probe);

    let stored = StoredSettings {
        notes_dir: Some(path.to_string_lossy().to_string()),
    };
    let file = settings_file(&app)?;
    let raw = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    fs::write(file, raw).map_err(|e| format!("保存设置失败: {e}"))?;

    settings_info(&app)
}

#[tauri::command]
fn reset_notes_dir(app: AppHandle) -> Result<SettingsInfo, String> {
    let stored = StoredSettings { notes_dir: None };
    let file = settings_file(&app)?;
    let raw = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    fs::write(file, raw).map_err(|e| format!("保存设置失败: {e}"))?;

    settings_info(&app)
}

fn scan_notes(dir: &Path) -> Result<Vec<NoteMeta>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("无法读取笔记目录: {e}"))?;
    let mut notes = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_markdown = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case(NOTE_EXTENSION))
            .unwrap_or(false);
        if !is_markdown {
            continue;
        }
        if let Ok(note) = note_from_path(&path) {
            notes.push(note);
        }
    }

    notes.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
    Ok(notes)
}

#[tauri::command]
fn list_notes(app: AppHandle) -> Result<Vec<NoteMeta>, String> {
    let dir = resolve_notes_dir(&app)?;
    scan_notes(&dir)
}

#[tauri::command]
fn create_note(app: AppHandle) -> Result<NoteMeta, String> {
    let dir = resolve_notes_dir(&app)?;
    let path = unique_note_path(&dir, DEFAULT_NOTE_TITLE, None);
    fs::write(&path, "").map_err(|e| format!("创建笔记失败: {e}"))?;
    note_from_path(&path)
}

/// 写入内容，并让文件名跟随第一行标题。返回保存后（可能已重命名）的路径。
fn write_note_content(dir: &Path, path: &Path, content: &str) -> Result<PathBuf, String> {
    fs::write(path, content).map_err(|e| format!("保存失败: {e}"))?;

    let desired_stem = sanitize_file_stem(&title_of(content));
    let current_stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_default();

    if desired_stem == current_stem {
        return Ok(path.to_path_buf());
    }

    let target = unique_note_path(dir, &desired_stem, Some(path));
    if target == path {
        return Ok(path.to_path_buf());
    }

    fs::rename(path, &target).map_err(|e| format!("重命名笔记失败: {e}"))?;
    Ok(target)
}

#[tauri::command]
fn save_note(app: AppHandle, path: String, content: String) -> Result<NoteMeta, String> {
    let dir = resolve_notes_dir(&app)?;
    let path = PathBuf::from(path);
    ensure_inside(&dir, &path)?;

    let saved_path = write_note_content(&dir, &path, &content)?;
    note_from_path(&saved_path)
}

#[tauri::command]
fn delete_note(app: AppHandle, path: String) -> Result<(), String> {
    let dir = resolve_notes_dir(&app)?;
    let path = PathBuf::from(path);
    ensure_inside(&dir, &path)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn reveal_note(app: AppHandle, path: String) -> Result<(), String> {
    let dir = resolve_notes_dir(&app)?;
    let path = PathBuf::from(path);
    ensure_inside(&dir, &path)?;
    open_path(&path, true)
}

#[tauri::command]
fn open_notes_dir(app: AppHandle) -> Result<(), String> {
    let dir = resolve_notes_dir(&app)?;
    open_path(&dir, false)
}

#[tauri::command]
fn insert_note_image(
    app: AppHandle,
    note_path: String,
    source_path: String,
) -> Result<String, String> {
    let notes_dir = resolve_notes_dir(&app)?;
    let note = PathBuf::from(&note_path);
    ensure_inside(&notes_dir, &note)?;
    if !note.is_file() {
        return Err("笔记文件不存在".to_string());
    }
    copy_image_into(&notes_dir, &PathBuf::from(source_path))
}

#[tauri::command]
fn read_note_image(app: AppHandle, note_path: String, src: String) -> Result<String, String> {
    let notes_dir = resolve_notes_dir(&app)?;
    let note = PathBuf::from(&note_path);
    ensure_inside(&notes_dir, &note)?;
    if !note.is_file() {
        return Err("笔记文件不存在".to_string());
    }
    read_image_data_url(&notes_dir, &src)
}

#[tauri::command]
fn save_note_image_data(
    app: AppHandle,
    note_path: String,
    file_name: String,
    data_url: String,
) -> Result<String, String> {
    let notes_dir = resolve_notes_dir(&app)?;
    let note = PathBuf::from(&note_path);
    ensure_inside(&notes_dir, &note)?;
    if !note.is_file() {
        return Err("笔记文件不存在".to_string());
    }
    save_image_data_url(&notes_dir, &file_name, &data_url)
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("mailto:"))
    {
        return Err("只支持打开网页或邮件链接".to_string());
    }
    open_path(Path::new(trimmed), false)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    ALLOW_EXIT.store(true, Ordering::SeqCst);
    app.exit(0);
}

/* ------------------------------------ 启动 ------------------------------------ */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        show_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // 首次启动时确保笔记目录存在
            let _ = resolve_notes_dir(app.handle());

            // 全局快捷键：窗口隐藏时也能唤起主窗口
            match app.global_shortcut().register(GLOBAL_SHORTCUT) {
                Ok(()) => println!("已注册全局快捷键: {GLOBAL_SHORTCUT}"),
                Err(err) => eprintln!("注册全局快捷键失败: {err}"),
            }

            // 保留系统默认菜单（复制/粘贴、退出等快捷键）
            let menu = tauri::menu::Menu::default(app.handle())?;
            app.set_menu(menu)?;

            // 菜单栏常驻图标：沿用原项目图标，点击直接打开主窗口
            let tray_icon = app
                .default_window_icon()
                .cloned()
                .expect("无法获取应用图标");
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(tray_icon)
                .tooltip("快捷记事本")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_notes_dir,
            reset_notes_dir,
            list_notes,
            create_note,
            save_note,
            delete_note,
            reveal_note,
            open_notes_dir,
            insert_note_image,
            read_note_image,
            save_note_image_data,
            open_external,
            quit_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            // ⌘Q 先拦截一次，让前端保存完再退出
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !ALLOW_EXIT.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    if !QUIT_PENDING.swap(true, Ordering::SeqCst) {
                        let _ = app_handle.emit("quit-requested", ());
                        force_quit_after(app_handle, Duration::from_secs(4));
                    }
                }
            }
            // 关闭主窗口时隐藏到托盘，应用继续常驻
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                if label == "main" {
                    api.prevent_close();
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                show_main_window(app_handle);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_comes_from_first_line() {
        assert_eq!(title_of("我的标题\n正文"), "我的标题");
        assert_eq!(title_of("\u{feff}标题\n"), "标题");
        assert_eq!(title_of(""), "");
    }

    #[test]
    fn preview_skips_title_and_blank_lines() {
        assert_eq!(preview_of("标题\n\n  正文第一行 \n第二行"), "正文第一行");
        assert_eq!(preview_of("只有标题"), "");
    }

    #[test]
    fn sanitize_replaces_illegal_characters() {
        assert_eq!(sanitize_file_stem("a/b:c*d?"), "a b c d");
        assert_eq!(sanitize_file_stem("   "), "无标题笔记");
        assert_eq!(sanitize_file_stem(".hidden"), "hidden");
        assert_eq!(sanitize_file_stem("很长的标题"), "很长的标题");
    }

    #[test]
    fn unique_path_avoids_collisions() {
        let dir = std::env::temp_dir().join(format!("quicknote-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let first = unique_note_path(&dir, "笔记", None);
        assert_eq!(first.file_name().unwrap(), "笔记.md");
        fs::write(&first, "x").unwrap();

        let second = unique_note_path(&dir, "笔记", None);
        assert_eq!(second.file_name().unwrap(), "笔记 2.md");
        assert_ne!(first, second);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn note_metadata_reads_content_and_title() {
        let dir = std::env::temp_dir().join(format!("quicknote-meta-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let path = dir.join("测试.md");
        fs::write(&path, "标题\n\n正文内容").unwrap();
        let note = note_from_path(&path).unwrap();
        assert_eq!(note.title, "标题");
        assert_eq!(note.preview, "正文内容");
        assert_eq!(note.content, "标题\n\n正文内容");
        assert_eq!(note.file_name, "测试.md");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saving_renames_file_after_title() {
        let dir = std::env::temp_dir().join(format!("quicknote-save-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let original = dir.join("无标题笔记.md");
        fs::write(&original, "").unwrap();

        let saved = write_note_content(&dir, &original, "购物清单\n\n牛奶\n鸡蛋").unwrap();
        assert_eq!(saved.file_name().unwrap(), "购物清单.md");
        assert!(!original.exists());

        let note = note_from_path(&saved).unwrap();
        assert_eq!(note.title, "购物清单");
        assert_eq!(note.preview, "牛奶");

        // 标题不变的再次保存不应重命名
        let saved_again = write_note_content(&dir, &saved, "购物清单\n\n牛奶").unwrap();
        assert_eq!(saved_again, saved);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saving_duplicate_title_gets_suffix() {
        let dir = std::env::temp_dir().join(format!("quicknote-dup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        fs::write(dir.join("重复标题.md"), "重复标题\n旧内容").unwrap();
        let second = dir.join("无标题笔记.md");
        fs::write(&second, "").unwrap();

        let saved = write_note_content(&dir, &second, "重复标题\n新内容").unwrap();
        assert_eq!(saved.file_name().unwrap(), "重复标题 2.md");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn global_shortcut_is_valid() {
        let shortcut: tauri_plugin_global_shortcut::Shortcut =
            GLOBAL_SHORTCUT.parse().expect("全局快捷键格式应有效");
        assert!(!shortcut.mods.is_empty());
    }

    #[test]
    fn images_are_copied_to_images_dir_with_unique_names() {
        let root = std::env::temp_dir().join(format!("quicknote-image-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let notes = root.join("notes");
        fs::create_dir_all(&notes).unwrap();

        let source = root.join("我的 图片 (1).png");
        fs::write(&source, b"image-data").unwrap();

        let first = copy_image_into(&notes, &source).unwrap();
        assert_eq!(first, "images/我的-图片-1.png");
        assert_eq!(fs::read(notes.join(&first)).unwrap(), b"image-data");

        let second = copy_image_into(&notes, &source).unwrap();
        assert_eq!(second, "images/我的-图片-1-2.png");

        let text = root.join("note.txt");
        fs::write(&text, b"not an image").unwrap();
        assert!(copy_image_into(&notes, &text).is_err());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn image_data_urls_round_trip() {
        let root = std::env::temp_dir().join(format!("quicknote-paste-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let notes = root.join("notes");
        let images = notes.join("images");
        fs::create_dir_all(&images).unwrap();
        fs::write(images.join("photo.png"), b"\x89PNG\r\n\x1a\n").unwrap();

        let data_url = read_image_data_url(&notes, "images/photo.png").unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));
        assert!(read_image_data_url(&notes, "../secret.png").is_err());

        let saved = save_image_data_url(
            &notes,
            "pasted.png",
            "data:image/png;base64,iVBORw0KGgo=",
        )
        .unwrap();
        assert_eq!(saved, "images/pasted.png");
        assert!(notes.join(&saved).is_file());

        let _ = fs::remove_dir_all(&root);
    }
}
