//! Save the audit ZIP fetched through the console's authorized CG Bridge ticket.

#[cfg(windows)]
mod windows_save {
    use std::ffi::OsString;
    use std::fs::{self, OpenOptions};
    use std::io::{self, Write};
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use tauri::ipc::{InvokeBody, Request};
    use tauri::WebviewWindow;
    use windows::core::{w, HRESULT, PCWSTR};
    use windows::Win32::Foundation::{ERROR_CANCELLED, HWND};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{
        FileSaveDialog, IFileSaveDialog, FILEOPENDIALOGOPTIONS, FOS_FORCEFILESYSTEM,
        FOS_NOCHANGEDIR, FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, SIGDN_FILESYSPATH,
    };
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};

    const ARCHIVE_NAME: &str = "cg-bridge-logs.zip";
    // CG Bridge caps the uncompressed input at 512 MiB. Allow ZIP/deflate overhead.
    const MAX_ARCHIVE_BYTES: usize = 600 * 1024 * 1024;
    static SAVE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn suggested_name(request: &Request<'_>) -> String {
        let decoded = request
            .headers()
            .get("x-cg-archive-name")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| tauri::Url::parse(&format!("http://localhost/?name={value}")).ok())
            .and_then(|url| {
                url.query_pairs()
                    .next()
                    .map(|(_, value)| value.into_owned())
            });
        decoded
            .filter(|name| {
                name.encode_utf16().count() <= 240
                    && name.to_ascii_lowercase().ends_with(".zip")
                    && !name
                        .chars()
                        .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
            })
            .unwrap_or_else(|| ARCHIVE_NAME.to_owned())
    }

    fn archive_bytes<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
        let InvokeBody::Raw(bytes) = request.body() else {
            return Err("The desktop shell did not receive the ZIP data.".to_owned());
        };
        if bytes.len() < 22
            || bytes.len() > MAX_ARCHIVE_BYTES
            || !(bytes.starts_with(b"PK\x03\x04") || bytes.starts_with(b"PK\x05\x06"))
        {
            return Err("CG Bridge returned invalid or oversized log archive data.".to_owned());
        }
        Ok(bytes)
    }

    struct SaveApartment;

    impl SaveApartment {
        fn start() -> windows::core::Result<Self> {
            // This worker owns the apartment for its native dialog.
            unsafe {
                CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).ok()?
            };
            Ok(Self)
        }
    }

    impl Drop for SaveApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    fn choose_destination(owner: HWND, filename: &str) -> windows::core::Result<Option<PathBuf>> {
        let _apartment = SaveApartment::start()?;
        let filename: Vec<u16> = filename.encode_utf16().chain([0]).collect();
        unsafe {
            let dialog: IFileSaveDialog =
                CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)?;
            let options =
                dialog.GetOptions()? | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR | FOS_PATHMUSTEXIST;
            // Existing files stay intact. The writer publishes a distinct name on collision.
            dialog.SetOptions(FILEOPENDIALOGOPTIONS(options.0 & !FOS_OVERWRITEPROMPT.0))?;
            dialog.SetTitle(w!("Save CG Bridge logs"))?;
            dialog.SetFileTypes(&[COMDLG_FILTERSPEC {
                pszName: w!("ZIP archives (*.zip)"),
                pszSpec: w!("*.zip"),
            }])?;
            dialog.SetDefaultExtension(w!("zip"))?;
            dialog.SetFileName(PCWSTR(filename.as_ptr()))?;
            match dialog.Show(Some(owner)) {
                Err(error) if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) => {
                    return Ok(None);
                }
                result => result?,
            }
            let path = dialog.GetResult()?.GetDisplayName(SIGDN_FILESYSPATH)?;
            let destination = PathBuf::from(OsString::from_wide(path.as_wide()));
            CoTaskMemFree(Some(path.0.cast()));
            Ok(Some(destination))
        }
    }

    fn publish_archive(temporary: &Path, destination: &Path) -> io::Result<()> {
        let from: Vec<u16> = temporary.as_os_str().encode_wide().chain([0]).collect();
        let to: Vec<u16> = destination.as_os_str().encode_wide().chain([0]).collect();
        // Move the completed file within its chosen directory and leave existing files intact.
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) } != 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }

    fn write_archive(destination: &Path, bytes: &[u8]) -> io::Result<PathBuf> {
        let directory = destination.parent().ok_or(io::ErrorKind::InvalidInput)?;
        let stem = destination.file_stem().ok_or(io::ErrorKind::InvalidInput)?;
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let sequence = SAVE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temporary = directory.join(format!(
            ".cg-logs-{}-{stamp}-{sequence}.tmp",
            std::process::id()
        ));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        let written = file.write_all(bytes).and_then(|()| file.sync_all());
        drop(file);

        let result = written.and_then(|()| {
            for attempt in 0..100 {
                let output = if attempt == 0 {
                    destination.to_path_buf()
                } else {
                    let mut name = stem.to_os_string();
                    name.push(format!(" ({attempt})"));
                    if let Some(extension) = destination.extension() {
                        name.push(".");
                        name.push(extension);
                    }
                    directory.join(name)
                };
                match publish_archive(&temporary, &output) {
                    Ok(()) => return Ok(output),
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                    Err(error) => return Err(error),
                }
            }
            Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "The selected folder has too many archives with this name.",
            ))
        });
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }

    #[tauri::command]
    pub async fn save_bridge_archive(
        window: WebviewWindow,
        request: Request<'_>,
    ) -> Result<Option<String>, String> {
        let bytes = archive_bytes(&request)?.to_vec();
        let name = suggested_name(&request);
        let owner = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
        // This action comes from the console's click. Give its owner focus before the modal opens.
        window.set_focus().map_err(|error| error.to_string())?;
        tauri::async_runtime::spawn_blocking(move || {
            let Some(destination) = choose_destination(HWND(owner as _), &name)
                .map_err(|error| format!("Windows could not open Save As. {error}"))?
            else {
                return Ok(None);
            };
            write_archive(&destination, &bytes)
                .map(|path| Some(path.to_string_lossy().into_owned()))
                .map_err(|error| {
                    format!("Windows could not write the ZIP to the selected folder. {error}")
                })
        })
        .await
        .map_err(|error| error.to_string())?
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn saves_complete_archives_without_overwriting_existing_names() -> io::Result<()> {
            let directory =
                std::env::temp_dir().join(format!("cg-audit-save-{}", std::process::id()));
            fs::create_dir_all(&directory)?;
            let chosen = directory.join("logs.zip");
            let first = write_archive(&chosen, b"previous archive")?;
            let second = write_archive(&chosen, b"new archive")?;
            assert_eq!(first, directory.join("logs.zip"));
            assert_eq!(second, directory.join("logs (1).zip"));
            assert_eq!(fs::read(&first)?, b"previous archive");
            assert_eq!(fs::read(&second)?, b"new archive");
            assert_eq!(fs::read_dir(&directory)?.count(), 2);
            fs::remove_file(first)?;
            fs::remove_file(second)?;
            fs::remove_dir(directory)
        }
    }
}

#[cfg(windows)]
pub use windows_save::*;

#[cfg(not(windows))]
#[tauri::command]
pub fn save_bridge_archive() -> Result<Option<String>, String> {
    Err("Saving CG Bridge logs from the desktop shell requires Windows.".to_owned())
}
