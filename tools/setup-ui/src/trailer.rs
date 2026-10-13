//! What `cg-setup-pack` appends behind the setup program, and how it is found again.
//!
//! ```text
//! [ cg-setup.exe ][ blob … ][ index (JSON) ][ footer: "CGSETUP1" · index offset u64 · index length u64 ]
//! ```
//!
//! The footer sits at the end of the file — or, once the installer is Authenticode-signed, just
//! before the certificate table, which signing appends after everything else. The PE header's
//! security directory says where that table starts, so a signed installer finds its payload the
//! same way an unsigned one does.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub const MAGIC: &[u8; 8] = b"CGSETUP1";
pub const FOOTER_LEN: u64 = 24;

/// One appended blob: where it is, how long, and its SHA-256 (lower-case hex).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Blob {
    pub offset: u64,
    pub length: u64,
    pub sha256: String,
}

/// The index: every blob by name (`engine`, `config`, `tile`, `guide`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Index {
    pub blobs: BTreeMap<String, Blob>,
}

/// The footer, as bytes.
pub fn footer(index_offset: u64, index_length: u64) -> [u8; 24] {
    let mut out = [0u8; 24];
    out[..8].copy_from_slice(MAGIC);
    out[8..16].copy_from_slice(&index_offset.to_le_bytes());
    out[16..24].copy_from_slice(&index_length.to_le_bytes());
    out
}

/// Where the appended data ends: the start of the certificate table when the file is signed,
/// else its length. `head` is the file's first bytes (4 KiB is plenty for any PE header).
pub fn data_end(head: &[u8], file_len: u64) -> u64 {
    let rd16 = |o: usize| head.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]]));
    let rd32 = |o: usize| {
        head.get(o..o + 4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    };
    let Some(pe) = rd32(0x3c).map(|v| v as usize) else {
        return file_len;
    };
    if head.get(pe..pe + 4) != Some(b"PE\0\0".as_slice()) {
        return file_len;
    }
    let optional = pe + 24;
    let dirs = match rd16(optional) {
        Some(0x10b) => optional + 96,
        Some(0x20b) => optional + 112,
        _ => return file_len,
    };
    // Data directory 4 is the certificate table; its "address" is a FILE offset.
    match (rd32(dirs + 4 * 8), rd32(dirs + 4 * 8 + 4)) {
        (Some(at), Some(size)) if at != 0 && size != 0 && u64::from(at) <= file_len => {
            u64::from(at)
        }
        _ => file_len,
    }
}

/// Read the footer and the index from an installer on disk. `None` when nothing was appended
/// (a bare `cg-setup.exe`, as a developer builds it).
pub fn read_index(path: &Path) -> std::io::Result<Option<Index>> {
    let mut f = File::open(path)?;
    let len = f.metadata()?.len();
    let mut head = vec![0u8; 4096.min(len as usize)];
    f.read_exact(&mut head)?;
    let end = data_end(&head, len);
    if end < FOOTER_LEN {
        return Ok(None);
    }
    f.seek(SeekFrom::Start(end - FOOTER_LEN))?;
    let mut foot = [0u8; 24];
    f.read_exact(&mut foot)?;
    if &foot[..8] != MAGIC {
        return Ok(None);
    }
    let offset = u64::from_le_bytes(foot[8..16].try_into().unwrap_or_default());
    let length = u64::from_le_bytes(foot[16..24].try_into().unwrap_or_default());
    if offset
        .checked_add(length)
        .is_none_or(|e| e > end - FOOTER_LEN)
        || length > 1 << 20
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "the setup index is out of range",
        ));
    }
    f.seek(SeekFrom::Start(offset))?;
    let mut json = vec![0u8; length as usize];
    f.read_exact(&mut json)?;
    serde_json::from_slice(&json)
        .map(Some)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

/// Read a (small) blob whole.
pub fn read_blob(path: &Path, blob: &Blob) -> std::io::Result<Vec<u8>> {
    let mut f = File::open(path)?;
    f.seek(SeekFrom::Start(blob.offset))?;
    let mut out = vec![0u8; blob.length as usize];
    f.read_exact(&mut out)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_pe(security_at: u32, security_size: u32, pe32_plus: bool) -> Vec<u8> {
        let mut h = vec![0u8; 1024];
        h[0] = b'M';
        h[1] = b'Z';
        h[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        h[0x80..0x84].copy_from_slice(b"PE\0\0");
        let optional = 0x80 + 24;
        let magic: u16 = if pe32_plus { 0x20b } else { 0x10b };
        h[optional..optional + 2].copy_from_slice(&magic.to_le_bytes());
        let dirs = optional + if pe32_plus { 112 } else { 96 };
        h[dirs + 32..dirs + 36].copy_from_slice(&security_at.to_le_bytes());
        h[dirs + 36..dirs + 40].copy_from_slice(&security_size.to_le_bytes());
        h
    }

    #[test]
    fn an_unsigned_file_ends_at_its_length() {
        assert_eq!(data_end(&fake_pe(0, 0, false), 5000), 5000);
        assert_eq!(data_end(b"not a pe", 8), 8);
    }

    #[test]
    fn a_signed_file_ends_where_its_certificate_table_starts() {
        assert_eq!(data_end(&fake_pe(4000, 900, false), 4900), 4000);
        assert_eq!(data_end(&fake_pe(4000, 900, true), 4900), 4000);
    }

    #[test]
    fn the_footer_round_trips() {
        let f = footer(123, 45);
        assert_eq!(&f[..8], MAGIC);
        assert_eq!(u64::from_le_bytes(f[8..16].try_into().unwrap()), 123);
        assert_eq!(u64::from_le_bytes(f[16..24].try_into().unwrap()), 45);
    }

    #[test]
    fn an_index_is_read_back_from_a_file() {
        let dir = std::env::temp_dir().join(format!("cg-setup-trailer-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("t.exe");
        let mut bytes = fake_pe(0, 0, false);
        let blob_at = bytes.len() as u64;
        bytes.extend_from_slice(b"hello");
        let mut index = Index::default();
        index.blobs.insert(
            "engine".into(),
            Blob {
                offset: blob_at,
                length: 5,
                sha256: "x".into(),
            },
        );
        let json = serde_json::to_vec(&index).unwrap();
        let index_at = bytes.len() as u64;
        bytes.extend_from_slice(&json);
        bytes.extend_from_slice(&footer(index_at, json.len() as u64));
        std::fs::write(&file, &bytes).unwrap();
        let back = read_index(&file).unwrap().unwrap();
        assert_eq!(back, index);
        assert_eq!(read_blob(&file, &back.blobs["engine"]).unwrap(), b"hello");
        // A bare program has no footer.
        std::fs::write(&file, fake_pe(0, 0, false)).unwrap();
        assert_eq!(read_index(&file).unwrap(), None);
        std::fs::remove_dir_all(&dir).ok();
    }
}
