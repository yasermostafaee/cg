use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

#[cfg(windows)]
use windows_sys::Win32::UI::Controls::Dialogs::{
    CommDlgExtendedError, GetOpenFileNameW, OFN_EXPLORER, OFN_FILEMUSTEXIST, OFN_PATHMUSTEXIST,
    OPENFILENAMEW,
};

const MAX_TEXT_SOURCE_BYTES: u64 = 1024 * 1024;

#[derive(Default)]
pub struct SelectedTextSources(Mutex<HashSet<PathBuf>>);

impl SelectedTextSources {
    fn remember(&self, path: PathBuf) {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(path);
    }

    fn contains(&self, path: &Path) -> bool {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .contains(path)
    }
}

fn read_text_source(path: &Path) -> Result<String, String> {
    let metadata =
        std::fs::metadata(path).map_err(|err| format!("Could not read the file: {err}"))?;
    if metadata.len() > MAX_TEXT_SOURCE_BYTES {
        return Err("Choose a supported text file of 1 MiB or smaller.".to_owned());
    }
    let bytes = std::fs::read(path).map_err(|err| format!("Could not read the file: {err}"))?;
    String::from_utf8(bytes).map_err(|_| "The selected file is not valid UTF-8 text.".to_owned())
}

/// Pick and read a small text file natively. Chromium intentionally hides a file input's absolute
/// path; the native dialog is what lets the author verify the Windows/UNC share they selected.
#[tauri::command]
pub fn pick_text_source_file(
    selected_sources: State<'_, SelectedTextSources>,
) -> Result<Option<(String, String, String, String)>, String> {
    #[cfg(not(windows))]
    {
        let _ = selected_sources;
        return Err("The native text-file picker is available in the Windows app only.".to_owned());
    }

    #[cfg(windows)]
    {
        let mut path_buffer = vec![0_u16; 32_768];
        let filter: Vec<u16> = "Text files\0*.txt;*.text;*.csv;*.tsv;*.log\0All files\0*.*\0\0"
            .encode_utf16()
            .collect();
        let title: Vec<u16> = "Choose shared text file\0".encode_utf16().collect();
        let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
        dialog.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        dialog.lpstrFilter = filter.as_ptr();
        dialog.lpstrFile = path_buffer.as_mut_ptr();
        dialog.nMaxFile = path_buffer.len() as u32;
        dialog.lpstrTitle = title.as_ptr();
        dialog.Flags = OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST;

        if unsafe { GetOpenFileNameW(&mut dialog) } == 0 {
            let code = unsafe { CommDlgExtendedError() };
            if code == 0 {
                return Ok(None);
            }
            return Err(format!("Windows could not open the file picker (error {code})."));
        }

        let path_len = path_buffer
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(path_buffer.len());
        let source_path = String::from_utf16(&path_buffer[..path_len])
            .map_err(|_| "The selected file path is invalid.".to_owned())?;
        let path = std::path::PathBuf::from(&source_path);
        let supported = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| {
                matches!(
                    value.to_ascii_lowercase().as_str(),
                    "txt" | "text" | "csv" | "tsv" | "log"
                )
            })
            .unwrap_or(false);
        if !supported {
            return Err(
                "Choose a supported text file (.txt, .text, .csv, .tsv or .log).".to_owned(),
            );
        }
        let canonical = std::fs::canonicalize(&path)
            .map_err(|err| format!("Could not resolve the selected file: {err}"))?;
        let content = read_text_source(&canonical)?;
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "The selected file has an invalid name.".to_owned())?
            .to_owned();

        selected_sources.remember(canonical);

        Ok(Some((name.clone(), name, source_path, content)))
    }
}

/// Re-read only a file that the author selected in this app session. The renderer cannot turn this
/// into an arbitrary absolute-path reader by inventing another path.
#[tauri::command]
pub fn reload_text_source_file(
    source_path: String,
    selected_sources: State<'_, SelectedTextSources>,
) -> Result<String, String> {
    #[cfg(not(windows))]
    {
        let _ = source_path;
        let _ = selected_sources;
        return Err("Text-file reload is available in the Windows app only.".to_owned());
    }

    #[cfg(windows)]
    {
        let canonical = std::fs::canonicalize(PathBuf::from(source_path))
            .map_err(|err| format!("Could not resolve the selected file: {err}"))?;
        if !selected_sources.contains(&canonical) {
            return Err("Choose this file again before reloading it.".to_owned());
        }
        read_text_source(&canonical)
    }
}
