use std::{
    collections::{HashMap, HashSet},
    path::Path,
    str::FromStr,
};

use crate::AppExt;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub main_path: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct PluginManifestFile {
    id: String,
    name: String,
    version: String,
    main: String,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SkillManifestEntry {
    pub id: String,
    pub title: String,
    pub description: String,
    pub icon: Option<String>,
    pub capabilities: Vec<String>,
    pub input_requirements: Vec<String>,
    pub template: Option<String>,
    pub skill_path: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillManifestFile {
    id: String,
    title: String,
    description: String,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    capabilities: Vec<String>,
    input_requirements: Vec<String>,
    #[serde(default)]
    template: Option<String>,
}

fn is_allowed_input_requirement(value: &str) -> bool {
    matches!(value, "transcript" | "graph" | "notes")
}

fn canonical_within(path: &Path, base: &Path) -> bool {
    let Ok(canonical_path) = std::fs::canonicalize(path) else {
        return false;
    };

    let Ok(canonical_base) = std::fs::canonicalize(base) else {
        return false;
    };

    canonical_path.starts_with(canonical_base)
}

fn parse_skill_manifest(raw: &str) -> Option<SkillManifestFile> {
    use openmushi_frontmatter::Document;

    let doc = Document::<HashMap<String, serde_json::Value>>::from_str(raw).ok()?;
    let frontmatter = serde_json::to_value(&doc.frontmatter).ok()?;

    serde_json::from_value(frontmatter).ok()
}

fn is_valid_skill_manifest(manifest: &SkillManifestFile) -> bool {
    if manifest.id.trim().is_empty()
        || manifest.title.trim().is_empty()
        || manifest.description.trim().is_empty()
    {
        return false;
    }

    manifest
        .input_requirements
        .iter()
        .all(|value| is_allowed_input_requirement(value))
}

fn collect_skills_from_dir(skills_dir: &Path) -> Vec<SkillManifestEntry> {
    let mut skills = Vec::new();
    let mut seen_ids = HashSet::new();

    let Ok(entries) = std::fs::read_dir(skills_dir) else {
        return skills;
    };

    let mut entries: Vec<_> = entries.collect();
    entries.sort_by_key(|entry| match entry {
        Ok(entry) => entry.file_name(),
        Err(_) => std::ffi::OsString::new(),
    });

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        let root = entry.path();
        if !canonical_within(&root, skills_dir) {
            continue;
        }

        let skill_path = root.join("SKILL.md");
        if !skill_path.exists() || !skill_path.is_file() {
            continue;
        }

        if !canonical_within(&skill_path, skills_dir) {
            continue;
        }

        let raw = match std::fs::read_to_string(&skill_path) {
            Ok(raw) => raw,
            Err(_) => continue,
        };

        let Some(manifest) = parse_skill_manifest(&raw) else {
            continue;
        };

        if !is_valid_skill_manifest(&manifest) {
            continue;
        }

        if !seen_ids.insert(manifest.id.clone()) {
            continue;
        }

        let canonical_skill_path = match std::fs::canonicalize(&skill_path) {
            Ok(path) => path,
            Err(_) => continue,
        };

        skills.push(SkillManifestEntry {
            id: manifest.id,
            title: manifest.title,
            description: manifest.description,
            icon: manifest.icon,
            capabilities: manifest.capabilities,
            input_requirements: manifest.input_requirements,
            template: manifest.template,
            skill_path: canonical_skill_path.to_string_lossy().to_string(),
        });
    }

    skills.sort_by(|a, b| a.id.cmp(&b.id));
    skills
}

#[tauri::command]
#[specta::specta]
pub async fn get_onboarding_needed<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    app.get_onboarding_needed().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_onboarding_needed<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: bool,
) -> Result<(), String> {
    app.set_onboarding_needed(v).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_dismissed_toasts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<String>, String> {
    app.get_dismissed_toasts()
}

#[tauri::command]
#[specta::specta]
pub async fn set_dismissed_toasts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: Vec<String>,
) -> Result<(), String> {
    app.set_dismissed_toasts(v)
}

#[tauri::command]
#[specta::specta]
pub async fn get_env<R: tauri::Runtime>(_app: tauri::AppHandle<R>, key: String) -> String {
    std::env::var(&key).unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn show_devtool() -> bool {
    if cfg!(debug_assertions) {
        return true;
    }

    #[cfg(feature = "devtools")]
    {
        return true;
    }

    #[cfg(not(feature = "devtools"))]
    {
        false
    }
}

#[tauri::command]
#[specta::specta]
pub async fn resize_window_for_chat<R: tauri::Runtime>(
    window: tauri::Window<R>,
) -> Result<(), String> {
    let outer_size = window.outer_size().map_err(|e| e.to_string())?;

    let new_size = tauri::PhysicalSize {
        width: outer_size.width + 400,
        height: outer_size.height,
    };
    window
        .set_size(tauri::Size::Physical(new_size))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn resize_window_for_sidebar<R: tauri::Runtime>(
    window: tauri::Window<R>,
) -> Result<(), String> {
    let outer_size = window.outer_size().map_err(|e| e.to_string())?;

    if outer_size.width < 840 {
        let new_size = tauri::PhysicalSize {
            width: outer_size.width + 280,
            height: outer_size.height,
        };
        window
            .set_size(tauri::Size::Physical(new_size))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_tinybase_values<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_tinybase_values()
}

#[tauri::command]
#[specta::specta]
pub async fn set_tinybase_values<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: String,
) -> Result<(), String> {
    app.set_tinybase_values(v)
}

#[tauri::command]
#[specta::specta]
pub async fn get_pinned_tabs<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_pinned_tabs()
}

#[tauri::command]
#[specta::specta]
pub async fn set_pinned_tabs<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: String,
) -> Result<(), String> {
    app.set_pinned_tabs(v)
}

#[tauri::command]
#[specta::specta]
pub async fn get_recently_opened_sessions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_recently_opened_sessions()
}

#[tauri::command]
#[specta::specta]
pub async fn set_recently_opened_sessions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: String,
) -> Result<(), String> {
    app.set_recently_opened_sessions(v)
}

#[tauri::command]
#[specta::specta]
pub async fn list_plugins<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<PluginManifestEntry>, String> {
    use tauri_plugin_settings::SettingsPluginExt;

    let base = app.settings().global_base().map_err(|e| e.to_string())?;
    let plugins_dir = base.join("plugins").into_std_path_buf();

    if !plugins_dir.exists() {
        std::fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;
        return Ok(Vec::new());
    }

    let mut plugins = Vec::new();

    for entry in std::fs::read_dir(&plugins_dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        let root = entry.path();
        let manifest_path = root.join("plugin.json");

        if !manifest_path.exists() {
            continue;
        }

        let manifest: PluginManifestFile = match std::fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<PluginManifestFile>(&raw).ok())
        {
            Some(manifest) => manifest,
            None => continue,
        };

        let main_relative = std::path::Path::new(&manifest.main);
        if main_relative.is_absolute()
            || main_relative
                .components()
                .any(|c| c == std::path::Component::ParentDir)
        {
            continue;
        }

        let main_path = root.join(main_relative);
        if !main_path.exists() {
            continue;
        }

        plugins.push(PluginManifestEntry {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            main_path: main_path.to_string_lossy().to_string(),
        });
    }

    plugins.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(plugins)
}

#[tauri::command]
#[specta::specta]
pub async fn list_skills<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<SkillManifestEntry>, String> {
    use tauri_plugin_settings::SettingsPluginExt;

    let base = app.settings().global_base().map_err(|e| e.to_string())?;
    let skills_dir = base.join("skills").into_std_path_buf();

    if !skills_dir.exists() {
        std::fs::create_dir_all(&skills_dir).map_err(|e| e.to_string())?;
        return Ok(Vec::new());
    }

    Ok(collect_skills_from_dir(&skills_dir))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new(prefix: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "openmushi-{}-{}-{}",
                prefix,
                std::process::id(),
                nonce
            ));
            std::fs::create_dir_all(&path).expect("temp test directory should be created");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn write_file(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("parent directories should be created");
        }
        std::fs::write(path, content).expect("file should be written");
    }

    fn valid_skill_md(id: &str, title: &str) -> String {
        format!(
            "---\nid: {id}\ntitle: {title}\ndescription: Sample\ninputRequirements:\n  - transcript\ncapabilities:\n  - summarize\ntemplate: basic\n---\n# Skill\n"
        )
    }

    #[test]
    fn collects_only_valid_skill_manifests() {
        let dir = TempDir::new("skills-valid");
        let skills_dir = dir.path().join("skills");
        std::fs::create_dir_all(&skills_dir).expect("skills directory should be created");

        write_file(
            &skills_dir.join("ok").join("SKILL.md"),
            &valid_skill_md("skill.ok", "OK"),
        );

        write_file(
            &skills_dir.join("missing-required").join("SKILL.md"),
            "---\nid: skill.bad\ntitle: Bad\ndescription: Missing input requirements\n---\n# Skill\n",
        );

        write_file(
            &skills_dir.join("invalid-input").join("SKILL.md"),
            "---\nid: skill.bad2\ntitle: Bad 2\ndescription: Invalid input requirements\ninputRequirements:\n  - unknown\n---\n# Skill\n",
        );

        let skills = collect_skills_from_dir(&skills_dir);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "skill.ok");
        assert_eq!(skills[0].title, "OK");
        assert_eq!(skills[0].input_requirements, vec!["transcript"]);
    }

    #[test]
    fn deduplicates_by_id_with_first_valid_winning() {
        let dir = TempDir::new("skills-dedupe");
        let skills_dir = dir.path().join("skills");
        std::fs::create_dir_all(&skills_dir).expect("skills directory should be created");

        write_file(
            &skills_dir.join("a-first").join("SKILL.md"),
            &valid_skill_md("skill.dup", "First"),
        );
        write_file(
            &skills_dir.join("z-second").join("SKILL.md"),
            &valid_skill_md("skill.dup", "Second"),
        );

        let skills = collect_skills_from_dir(&skills_dir);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "skill.dup");
        assert_eq!(skills[0].title, "First");
    }

    #[cfg(unix)]
    #[test]
    fn skips_skill_files_that_canonicalize_outside_skills_directory() {
        use std::os::unix::fs::symlink;

        let dir = TempDir::new("skills-path-hardening");
        let skills_dir = dir.path().join("skills");
        std::fs::create_dir_all(&skills_dir).expect("skills directory should be created");

        let outside_path = dir.path().join("outside").join("SKILL.md");
        write_file(&outside_path, &valid_skill_md("skill.outside", "Outside"));

        let package_dir = skills_dir.join("linked");
        std::fs::create_dir_all(&package_dir).expect("package directory should be created");
        symlink(&outside_path, package_dir.join("SKILL.md"))
            .expect("symlink should be created");

        let skills = collect_skills_from_dir(&skills_dir);

        assert!(skills.is_empty());
    }
}
