//! Save the audit ZIP fetched through the console's authorized CG Bridge ticket.

#[cfg(windows)]
mod windows_download {
    use std::fs::{self, OpenOptions};
    use std::io::{self, Write};
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use tauri::ipc::{InvokeBody, Request};
    use tauri::{AppHandle, Manager};
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

    fn publish_archive(temporary: &Path, destination: &Path) -> io::Result<()> {
        let from: Vec<u16> = temporary.as_os_str().encode_wide().chain([0]).collect();
        let to: Vec<u16> = destination.as_os_str().encode_wide().chain([0]).collect();
        // Move the completed file within Downloads and leave any existing destination intact.
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) } != 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }

    fn write_archive(directory: &Path, filename: &str, bytes: &[u8]) -> io::Result<PathBuf> {
        fs::create_dir_all(directory)?;
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
            let stem = Path::new(filename)
                .file_stem()
                .and_then(|part| part.to_str())
                .unwrap_or("cg-bridge-logs");
            for attempt in 0..100 {
                let destination = if attempt == 0 {
                    directory.join(filename)
                } else {
                    directory.join(format!("{stem} ({attempt}).zip"))
                };
                match publish_archive(&temporary, &destination) {
                    Ok(()) => return Ok(destination),
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                    Err(error) => return Err(error),
                }
            }
            Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "Windows Downloads has too many archives with this name.",
            ))
        });
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result
    }

    #[tauri::command]
    pub async fn save_bridge_archive(
        app: AppHandle,
        request: Request<'_>,
    ) -> Result<String, String> {
        let bytes = archive_bytes(&request)?.to_vec();
        let name = suggested_name(&request);
        let directory = app
            .path()
            .download_dir()
            .map_err(|error| format!("Windows Downloads is unavailable. {error}"))?;
        tauri::async_runtime::spawn_blocking(move || write_archive(&directory, &name, &bytes))
            .await
            .map_err(|error| error.to_string())?
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|error| format!("Windows could not write the ZIP to Downloads. {error}"))
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn saves_complete_archives_without_overwriting_existing_names() -> io::Result<()> {
            let directory =
                std::env::temp_dir().join(format!("cg-audit-save-{}", std::process::id()));
            let first = write_archive(&directory, "logs.zip", b"previous archive")?;
            let second = write_archive(&directory, "logs.zip", b"new archive")?;
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
pub use windows_download::*;

#[cfg(not(windows))]
#[tauri::command]
pub fn save_bridge_archive() -> Result<String, String> {
    Err("Saving CG Bridge logs from the desktop shell requires Windows.".to_owned())
}
