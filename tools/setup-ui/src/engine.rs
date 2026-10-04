//! The engine: today's NSIS installer, carried behind this program, unpacked and run.
//!
//! 🔴 THE SILENT PATH IS THE ENGINE'S. With `/S` (or Tauri's `/P`) this program shows nothing: it
//! unpacks the engine, runs it with this installer's command line exactly (`realcmds`, byte for
//! byte), waits, and exits with the engine's exit code. So `/S`, every argument, `/D=` and the
//! exit codes 0 / 1 / 2 are the engine's own — the clean-Windows smoke runs every silent path
//! against this installer AND against its engine alone and requires the same codes.

use crate::product::Config;
use crate::trailer::{read_blob, read_index, Blob, Index};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Security::Cryptography::{
    BCryptCloseAlgorithmProvider, BCryptCreateHash, BCryptDestroyHash, BCryptFinishHash,
    BCryptHashData, BCryptOpenAlgorithmProvider, BCRYPT_ALG_HANDLE, BCRYPT_HASH_HANDLE,
    BCRYPT_OPEN_ALGORITHM_PROVIDER_FLAGS, BCRYPT_SHA256_ALGORITHM,
};
use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
use windows::Win32::System::Threading::{
    CreateProcessW, GetExitCodeProcess, GetStartupInfoW, WaitForSingleObject, INFINITE,
    PROCESS_CREATION_FLAGS, PROCESS_INFORMATION, STARTF_USESHOWWINDOW, STARTUPINFOW,
};

/// The installer this program is, with what was appended behind it.
pub struct Payload {
    pub exe: PathBuf,
    pub index: Index,
    pub config: Config,
}

impl Payload {
    pub fn blob(&self, name: &str) -> Option<&Blob> {
        self.index.blobs.get(name)
    }
    pub fn read(&self, name: &str) -> Option<Vec<u8>> {
        read_blob(&self.exe, self.blob(name)?).ok()
    }
}

/// `Ok(None)`: nothing is appended (a developer's bare build).
pub fn locate() -> Result<Option<Payload>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let Some(index) = read_index(&exe).map_err(|e| format!("Setup is damaged: {e}"))? else {
        return Ok(None);
    };
    let config_blob = index
        .blobs
        .get("config")
        .ok_or("Setup is damaged: no configuration.")?;
    let raw = read_blob(&exe, config_blob).map_err(|e| e.to_string())?;
    let config: Config =
        serde_json::from_slice(&raw).map_err(|e| format!("Setup is damaged: {e}"))?;
    Ok(Some(Payload { exe, index, config }))
}

/// SHA-256 through Windows' own CNG: no crypto of ours.
pub struct Sha256 {
    alg: BCRYPT_ALG_HANDLE,
    hash: BCRYPT_HASH_HANDLE,
}

impl Sha256 {
    pub fn new() -> Option<Sha256> {
        unsafe {
            let mut alg = BCRYPT_ALG_HANDLE::default();
            BCryptOpenAlgorithmProvider(
                &mut alg,
                BCRYPT_SHA256_ALGORITHM,
                PCWSTR::null(),
                BCRYPT_OPEN_ALGORITHM_PROVIDER_FLAGS(0),
            )
            .ok()
            .ok()?;
            let mut hash = BCRYPT_HASH_HANDLE::default();
            if BCryptCreateHash(alg, &mut hash, None, None, 0)
                .ok()
                .is_err()
            {
                let _ = BCryptCloseAlgorithmProvider(alg, 0);
                return None;
            }
            Some(Sha256 { alg, hash })
        }
    }
    pub fn update(&mut self, data: &[u8]) {
        unsafe {
            let _ = BCryptHashData(self.hash, data, 0);
        }
    }
    pub fn hex(self) -> String {
        let mut out = [0u8; 32];
        unsafe {
            let _ = BCryptFinishHash(self.hash, &mut out, 0);
        }
        out.iter().map(|b| format!("{b:02x}")).collect()
    }
}

impl Drop for Sha256 {
    fn drop(&mut self) {
        unsafe {
            let _ = BCryptDestroyHash(self.hash);
            let _ = BCryptCloseAlgorithmProvider(self.alg, 0);
        }
    }
}

/// SHA-256 of a byte slice (the packer's).
pub fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new().expect("CNG provides SHA-256");
    h.update(data);
    h.hex()
}

/// A folder of this run's own under %TEMP%.
pub fn temp_dir() -> Result<PathBuf, String> {
    let base = std::env::temp_dir();
    for n in 0..100u32 {
        let dir = base.join(format!("CG-Setup-{}-{n}", std::process::id()));
        if std::fs::create_dir(&dir).is_ok() {
            return Ok(dir);
        }
    }
    Err(format!(
        "Setup could not create a folder in {}.",
        base.display()
    ))
}

/// Unpack a blob to `dest`, hashing as it goes; a mismatch deletes the file and fails.
pub fn extract(
    payload: &Payload,
    name: &str,
    dest: &Path,
    cancel: &AtomicBool,
    progress: &dyn Fn(f32),
) -> Result<(), String> {
    let blob = payload
        .blob(name)
        .ok_or_else(|| format!("Setup is damaged: no {name}."))?;
    let mut src = File::open(&payload.exe).map_err(|e| e.to_string())?;
    src.seek(SeekFrom::Start(blob.offset))
        .map_err(|e| e.to_string())?;
    let mut out =
        File::create(dest).map_err(|e| format!("Setup could not unpack its files: {e}"))?;
    let mut hash = Sha256::new().ok_or("Windows refused SHA-256.")?;
    let mut buf = vec![0u8; 1 << 20];
    let mut left = blob.length;
    while left > 0 {
        if cancel.load(Ordering::SeqCst) {
            drop(out);
            let _ = std::fs::remove_file(dest);
            return Err("cancelled".into());
        }
        let n = (left.min(buf.len() as u64)) as usize;
        src.read_exact(&mut buf[..n])
            .map_err(|e| format!("Setup could not read itself: {e}"))?;
        hash.update(&buf[..n]);
        out.write_all(&buf[..n])
            .map_err(|e| format!("Setup could not unpack its files: {e}"))?;
        left -= n as u64;
        progress(1.0 - left as f32 / blob.length.max(1) as f32);
    }
    out.flush().map_err(|e| e.to_string())?;
    drop(out);
    if hash.hex() != blob.sha256 {
        let _ = std::fs::remove_file(dest);
        return Err("Setup's files are damaged. Download it again.".into());
    }
    Ok(())
}

/// A running engine.
pub struct Child(HANDLE);
unsafe impl Send for Child {}

impl Child {
    /// `Some(code)` once it has exited.
    pub fn poll(&self, wait_ms: u32) -> Option<u32> {
        unsafe {
            if WaitForSingleObject(self.0, wait_ms) != WAIT_OBJECT_0 {
                return None;
            }
            let mut code = 0u32;
            GetExitCodeProcess(self.0, &mut code).ok()?;
            Some(code)
        }
    }
    pub fn wait(&self) -> u32 {
        unsafe {
            WaitForSingleObject(self.0, INFINITE);
        }
        self.poll(0).unwrap_or(2)
    }
}

impl Drop for Child {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

/// Start the engine with a full command line. `show` passes this process's own show state on (an
/// installer started hidden starts its engine hidden).
pub fn spawn(engine: &Path, command_line: &str, inherit_show: bool) -> Result<Child, String> {
    unsafe {
        let mut si = STARTUPINFOW {
            cb: std::mem::size_of::<STARTUPINFOW>() as u32,
            ..Default::default()
        };
        if inherit_show {
            let mut mine = STARTUPINFOW {
                cb: std::mem::size_of::<STARTUPINFOW>() as u32,
                ..Default::default()
            };
            GetStartupInfoW(&mut mine);
            if mine.dwFlags.contains(STARTF_USESHOWWINDOW) {
                si.dwFlags |= STARTF_USESHOWWINDOW;
                si.wShowWindow = mine.wShowWindow;
            }
        }
        let mut pi = PROCESS_INFORMATION::default();
        let app = HSTRING::from(engine.as_os_str());
        let mut line: Vec<u16> = command_line
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        CreateProcessW(
            &app,
            Some(PWSTR(line.as_mut_ptr())),
            None,
            None,
            false,
            PROCESS_CREATION_FLAGS(0),
            None,
            PCWSTR::null(),
            &si,
            &mut pi,
        )
        .map_err(|e| format!("Setup could not start its installer: {}", e.message()))?;
        let _ = CloseHandle(pi.hThread);
        Ok(Child(pi.hProcess))
    }
}

/// Remove this run's temp folder; an engine still holding a file only leaves it for Windows' own
/// temp clean-up.
pub fn cleanup(dir: &Path) {
    for _ in 0..20 {
        if std::fs::remove_dir_all(dir).is_ok() || !dir.exists() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

/// The silent path: the engine, this command line, its exit code. Nothing is shown.
pub fn passthrough(payload: &Payload, tail: &str) -> u32 {
    // The engine may write to the caller's console (Tauri's template does, for a refusal). It
    // attaches to its PARENT's console — this process — so this process attaches to its own
    // parent's first, and the line reaches the caller as it did when the engine was the installer.
    unsafe {
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
    let Ok(dir) = temp_dir() else {
        return 2;
    };
    let engine = dir.join(&payload.config.engine_name);
    let never = AtomicBool::new(false);
    let code = match extract(payload, "engine", &engine, &never, &|_| {}) {
        Ok(()) => {
            let line = crate::cmdline::passthrough_command_line(&engine.to_string_lossy(), tail);
            match spawn(&engine, &line, true) {
                Ok(child) => child.wait(),
                Err(_) => 2,
            }
        }
        Err(_) => 2,
    };
    cleanup(&dir);
    code
}
