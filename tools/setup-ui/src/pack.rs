//! `cg-setup-pack`: one installer from CG Setup and a product's engine.
//!
//! 1. Copy `cg-setup.exe` and stamp it as the product: its icon (the B-290 tile), its version
//!    resource, and — for CG Bridge only — `requireAdministrator`, which CG Bridge's installer has
//!    always asked for before anything runs (`RequestExecutionLevel admin`).
//! 2. Refuse an engine whose own ProductVersion is not the release version: the version the window
//!    shows comes from `tools/release` and is never typed by hand, and the engine must agree.
//! 3. Append the engine, the configuration, the tile and the install guide, each with its SHA-256,
//!    then the index and the footer (`trailer.rs`).

use crate::engine::Sha256;
use crate::product::{Config, ProductId};
use crate::trailer::{footer, Blob, Index};
use std::ffi::c_void;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use windows::core::{BOOL, HSTRING, PCWSTR};
use windows::Win32::Foundation::{FreeLibrary, HMODULE};
use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows::Win32::System::LibraryLoader::{
    BeginUpdateResourceW, EndUpdateResourceW, EnumResourceLanguagesW, FindResourceW,
    LoadLibraryExW, LoadResource, LockResource, SizeofResource, UpdateResourceW,
    LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE,
};
use windows::Win32::UI::WindowsAndMessaging::{RT_GROUP_ICON, RT_ICON, RT_MANIFEST, RT_VERSION};

const LANG_EN_US: u16 = 0x0409;

fn id(n: u16) -> PCWSTR {
    PCWSTR(n as usize as *const u16)
}

/// A `.ico` file's images: (GRPICONDIRENTRY bytes without the id, image bytes).
pub fn parse_ico(ico: &[u8]) -> Result<Vec<([u8; 12], Vec<u8>)>, String> {
    let rd16 = |o: usize| {
        ico.get(o..o + 2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .ok_or("a truncated icon")
    };
    let rd32 = |o: usize| {
        ico.get(o..o + 4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .ok_or("a truncated icon")
    };
    if rd16(0)? != 0 || rd16(2)? != 1 {
        return Err("not an .ico file".into());
    }
    let count = rd16(4)? as usize;
    let mut out = Vec::new();
    for i in 0..count {
        let e = 6 + 16 * i;
        let size = rd32(e + 8)? as usize;
        let offset = rd32(e + 12)? as usize;
        let image = ico
            .get(offset..offset + size)
            .ok_or("an icon image out of range")?
            .to_vec();
        let mut head = [0u8; 12];
        head.copy_from_slice(&ico[e..e + 12]);
        out.push((head, image));
    }
    Ok(out)
}

/// One node of a version resource (`VS_VERSIONINFO`, `StringFileInfo`, `String`, …).
fn node(key: &str, value: &[u8], text: bool, value_len: u16, children: &[Vec<u8>]) -> Vec<u8> {
    let pad = |v: &mut Vec<u8>| {
        while v.len() % 4 != 0 {
            v.push(0);
        }
    };
    let mut v = vec![0u8; 6];
    v[2..4].copy_from_slice(&value_len.to_le_bytes());
    v[4..6].copy_from_slice(&u16::from(text).to_le_bytes());
    for c in key.encode_utf16().chain(std::iter::once(0)) {
        v.extend_from_slice(&c.to_le_bytes());
    }
    pad(&mut v);
    v.extend_from_slice(value);
    for child in children {
        pad(&mut v);
        v.extend_from_slice(child);
    }
    let len = v.len() as u16;
    v[0..2].copy_from_slice(&len.to_le_bytes());
    v
}

fn string_entry(key: &str, value: &str) -> Vec<u8> {
    let wide: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes: Vec<u8> = wide.iter().flat_map(|c| c.to_le_bytes()).collect();
    node(key, &bytes, true, wide.len() as u16, &[])
}

/// A complete `VS_VERSIONINFO` for `major.minor.patch`.
pub fn version_resource(version: &str, strings: &[(&str, &str)]) -> Vec<u8> {
    let n: Vec<u16> = version
        .split('.')
        .take(3)
        .map(|p| p.parse().unwrap_or(0))
        .collect();
    let (ma, mi, pa) = (
        n.first().copied().unwrap_or(0),
        n.get(1).copied().unwrap_or(0),
        n.get(2).copied().unwrap_or(0),
    );
    let ms = (u32::from(ma) << 16) | u32::from(mi);
    let ls = u32::from(pa) << 16;
    let mut fixed = Vec::new();
    for v in [
        0xFEEF_04BDu32,
        0x0001_0000,
        ms,
        ls,
        ms,
        ls,
        0x3F,
        0,
        0x0004_0004,
        1,
        0,
        0,
        0,
    ] {
        fixed.extend_from_slice(&v.to_le_bytes());
    }
    let table = node(
        "040904b0",
        &[],
        true,
        0,
        &strings
            .iter()
            .map(|(k, v)| string_entry(k, v))
            .collect::<Vec<_>>(),
    );
    let sfi = node("StringFileInfo", &[], true, 0, &[table]);
    let translation = [0x09u8, 0x04, 0xb0, 0x04];
    let var = node("Translation", &translation, false, 4, &[]);
    let vfi = node("VarFileInfo", &[], true, 0, &[var]);
    node(
        "VS_VERSION_INFO",
        &fixed,
        false,
        fixed.len() as u16,
        &[sfi, vfi],
    )
}

/// The ProductVersion an executable states in its version resource.
pub fn product_version(path: &Path) -> Option<String> {
    unsafe {
        let p = HSTRING::from(path.as_os_str());
        let size = GetFileVersionInfoSizeW(&p, None);
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        GetFileVersionInfoW(&p, None, size, data.as_mut_ptr().cast()).ok()?;
        let mut ptr: *mut c_void = std::ptr::null_mut();
        let mut len = 0u32;
        if !VerQueryValueW(
            data.as_ptr().cast(),
            &HSTRING::from(r"\VarFileInfo\Translation"),
            &mut ptr,
            &mut len,
        )
        .as_bool()
            || len < 4
        {
            return None;
        }
        let lang = *(ptr as *const u16);
        let cp = *((ptr as *const u16).add(1));
        let key = format!(r"\StringFileInfo\{lang:04x}{cp:04x}\ProductVersion");
        if !VerQueryValueW(
            data.as_ptr().cast(),
            &HSTRING::from(key),
            &mut ptr,
            &mut len,
        )
        .as_bool()
            || len == 0
        {
            return None;
        }
        let s = std::slice::from_raw_parts(ptr as *const u16, len as usize);
        let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
        Some(String::from_utf16_lossy(&s[..end]).trim().to_string())
    }
}

/// The languages CG Setup's manifest (ID 1) is compiled under.
fn manifest_languages(path: &Path) -> Vec<u16> {
    unsafe extern "system" fn each(
        _m: HMODULE,
        _t: PCWSTR,
        _n: PCWSTR,
        lang: u16,
        out: isize,
    ) -> BOOL {
        unsafe { (*(out as *mut Vec<u16>)).push(lang) };
        BOOL(1)
    }
    let mut langs: Vec<u16> = Vec::new();
    unsafe {
        if let Ok(module) = LoadLibraryExW(
            &HSTRING::from(path.as_os_str()),
            None,
            LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE,
        ) {
            let _ = EnumResourceLanguagesW(
                Some(module),
                RT_MANIFEST,
                id(1),
                Some(each),
                &mut langs as *mut Vec<u16> as isize,
            );
            let _ = FreeLibrary(module);
        }
    }
    langs
}

/// The manifest compiled into CG Setup (`build.rs`).
fn manifest_of(path: &Path) -> Result<String, String> {
    unsafe {
        let module: HMODULE = LoadLibraryExW(
            &HSTRING::from(path.as_os_str()),
            None,
            LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE,
        )
        .map_err(|e| format!("CG Setup could not be read: {}", e.message()))?;
        let res = FindResourceW(Some(module), id(1), RT_MANIFEST);
        let text = (|| {
            if res.is_invalid() {
                return None;
            }
            let size = SizeofResource(Some(module), res);
            let loaded = LoadResource(Some(module), res).ok()?;
            let ptr = LockResource(loaded) as *const u8;
            (!ptr.is_null()).then(|| {
                String::from_utf8_lossy(std::slice::from_raw_parts(ptr, size as usize)).into_owned()
            })
        })();
        let _ = FreeLibrary(module);
        text.ok_or_else(|| "CG Setup carries no manifest".to_string())
    }
}

/// Write a version resource (ProductVersion `version`) into a program.
pub fn stamp_version(exe: &Path, version: &str) -> Result<(), String> {
    let data = version_resource(
        version,
        &[("ProductVersion", version), ("FileVersion", version)],
    );
    unsafe {
        let h = BeginUpdateResourceW(&HSTRING::from(exe.as_os_str()), false)
            .map_err(|e| e.message())?;
        UpdateResourceW(
            h,
            RT_VERSION,
            id(1),
            LANG_EN_US,
            Some(data.as_ptr().cast()),
            data.len() as u32,
        )
        .map_err(|e| e.message())?;
        EndUpdateResourceW(h, false).map_err(|e| e.message())?;
    }
    Ok(())
}

pub struct Inputs<'a> {
    pub ui: &'a Path,
    pub engine: &'a Path,
    pub config: Config,
    pub icon: &'a Path,
    pub tile: &'a Path,
    pub guide: Option<&'a Path>,
    pub out: &'a Path,
}

pub fn pack(i: Inputs) -> Result<(), String> {
    let p = crate::product::product(i.config.product);
    // 2 — the engine states the same release.
    match product_version(i.engine) {
        Some(v) if v == i.config.version => {}
        Some(v) => {
            return Err(format!(
                "the engine states {v}, the release is {}",
                i.config.version
            ))
        }
        None => return Err(format!("{} states no ProductVersion", i.engine.display())),
    }
    let tmp = i.out.with_extension("tmp");
    std::fs::copy(i.ui, &tmp).map_err(|e| format!("copy {}: {e}", i.ui.display()))?;

    // 1 — the product's icon, version resource and (CG Bridge) elevation.
    let manifest = manifest_of(&tmp)?;
    let manifest_lang = manifest_languages(&tmp)
        .first()
        .copied()
        .unwrap_or(LANG_EN_US);
    let manifest = if i.config.product == ProductId::Bridge {
        if !manifest.contains("level=\"asInvoker\"") {
            return Err("CG Setup's manifest has no asInvoker level to raise".into());
        }
        manifest.replace("level=\"asInvoker\"", "level=\"requireAdministrator\"")
    } else {
        manifest
    };
    let images =
        parse_ico(&std::fs::read(i.icon).map_err(|e| format!("{}: {e}", i.icon.display()))?)?;
    let description = format!("{} {} setup", p.name, i.config.version);
    let version = version_resource(
        &i.config.version,
        &[
            ("CompanyName", "APASAI"),
            ("FileDescription", &description),
            ("FileVersion", &i.config.version),
            ("LegalCopyright", "APASAI"),
            ("ProductName", p.name),
            ("ProductVersion", &i.config.version),
        ],
    );
    unsafe {
        let h = BeginUpdateResourceW(&HSTRING::from(tmp.as_os_str()), false)
            .map_err(|e| format!("resources: {}", e.message()))?;
        let mut group = vec![0u8, 0, 1, 0];
        group.extend_from_slice(&(images.len() as u16).to_le_bytes());
        for (n, (head, image)) in images.iter().enumerate() {
            let rid = (n + 1) as u16;
            UpdateResourceW(
                h,
                RT_ICON,
                id(rid),
                LANG_EN_US,
                Some(image.as_ptr().cast()),
                image.len() as u32,
            )
            .map_err(|e| format!("icon: {}", e.message()))?;
            group.extend_from_slice(head);
            group.extend_from_slice(&rid.to_le_bytes());
        }
        UpdateResourceW(
            h,
            RT_GROUP_ICON,
            id(1),
            LANG_EN_US,
            Some(group.as_ptr().cast()),
            group.len() as u32,
        )
        .map_err(|e| format!("icon group: {}", e.message()))?;
        UpdateResourceW(
            h,
            RT_VERSION,
            id(1),
            LANG_EN_US,
            Some(version.as_ptr().cast()),
            version.len() as u32,
        )
        .map_err(|e| format!("version: {}", e.message()))?;
        // Replaced in place: the same ID and the language it was compiled under.
        UpdateResourceW(
            h,
            RT_MANIFEST,
            id(1),
            manifest_lang,
            Some(manifest.as_ptr().cast()),
            manifest.len() as u32,
        )
        .map_err(|e| format!("manifest: {}", e.message()))?;
        EndUpdateResourceW(h, false).map_err(|e| format!("resources: {}", e.message()))?;
    }

    // 3 — the blobs, the index, the footer.
    let mut out = std::fs::OpenOptions::new()
        .append(true)
        .open(&tmp)
        .map_err(|e| e.to_string())?;
    let mut at = out.metadata().map_err(|e| e.to_string())?.len();
    let mut index = Index::default();
    // Streamed and hashed as it is copied: an engine is a couple of hundred megabytes.
    let mut append =
        |name: &str, bytes_from: &mut dyn Read, index: &mut Index| -> Result<(), String> {
            let mut buf = vec![0u8; 1 << 20];
            let mut hash = Sha256::new().ok_or("Windows refused SHA-256")?;
            let mut length = 0u64;
            loop {
                let n = bytes_from.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                hash.update(&buf[..n]);
                out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                length += n as u64;
            }
            index.blobs.insert(
                name.into(),
                Blob {
                    offset: at,
                    length,
                    sha256: hash.hex(),
                },
            );
            at += length;
            Ok(())
        };
    let mut engine = File::open(i.engine).map_err(|e| format!("{}: {e}", i.engine.display()))?;
    append("engine", &mut engine, &mut index)?;
    let config = serde_json::to_vec(&i.config).map_err(|e| e.to_string())?;
    append("config", &mut config.as_slice(), &mut index)?;
    let mut tile = File::open(i.tile).map_err(|e| format!("{}: {e}", i.tile.display()))?;
    append("tile", &mut tile, &mut index)?;
    if let Some(guide) = i.guide {
        let mut g = File::open(guide).map_err(|e| format!("{}: {e}", guide.display()))?;
        append("guide", &mut g, &mut index)?;
    }
    let json = serde_json::to_vec(&index).map_err(|e| e.to_string())?;
    out.write_all(&json).map_err(|e| e.to_string())?;
    out.write_all(&footer(at, json.len() as u64))
        .map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;
    drop(out);
    if i.out.exists() {
        std::fs::remove_file(i.out).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, i.out).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_version_resource_is_laid_out_as_windows_reads_it() {
        let v = version_resource("0.10.0", &[("ProductVersion", "0.10.0")]);
        assert_eq!(u16::from_le_bytes([v[0], v[1]]) as usize, v.len());
        assert_eq!(u16::from_le_bytes([v[2], v[3]]), 52, "VS_FIXEDFILEINFO");
        let key: Vec<u16> = "VS_VERSION_INFO".encode_utf16().collect();
        let got: Vec<u16> = v[6..6 + key.len() * 2]
            .chunks(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        assert_eq!(got, key);
        // The fixed info starts on a 32-bit boundary with its signature.
        let fixed_at = (6 + (key.len() + 1) * 2).div_ceil(4) * 4;
        assert_eq!(
            u32::from_le_bytes(v[fixed_at..fixed_at + 4].try_into().unwrap()),
            0xFEEF_04BD
        );
        // 0.10.0 → MS = 0x0000000A, LS = 0x00000000.
        assert_eq!(
            u32::from_le_bytes(v[fixed_at + 8..fixed_at + 12].try_into().unwrap()),
            0x0000_000A
        );
    }

    #[test]
    fn the_app_tiles_icons_parse() {
        for app in ["runtime", "designer"] {
            let ico = std::fs::read(format!("../../apps/{app}/src-tauri/icons/icon.ico")).unwrap();
            let images = parse_ico(&ico).unwrap();
            assert_eq!(images.len(), 6, "16 – 256 px");
        }
    }
}
