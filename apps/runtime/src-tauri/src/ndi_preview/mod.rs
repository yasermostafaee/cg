//! Direct NDI preview transport for the local CG Control window.
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex,
    },
    thread,
};

use tauri::{ipc::Response, State};

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
mod receiver;

const PICTURE: u8 = 1;
const AUDIO: u8 = 2;
const NO_SIGNAL: u8 = 3;
const ERROR: u8 = 4;
const MAX_JPEG_BYTES: usize = 512 * 1024;
const MAX_PCM_BYTES: usize = 48_000 * 2 * 2 / 10;
const MAX_RECEIVERS: usize = 8;

#[derive(Default)]
struct Mailbox {
    picture: Option<Vec<u8>>,
    audio: Vec<u8>,
    no_signal: bool,
    error: Option<String>,
}

impl Mailbox {
    fn push(&mut self, kind: u8, bytes: Vec<u8>) {
        match kind {
            PICTURE if !bytes.is_empty() && bytes.len() <= MAX_JPEG_BYTES => {
                self.no_signal = false;
                self.picture = Some(bytes);
            }
            AUDIO if !bytes.is_empty() && bytes.len() % 4 == 0 => {
                let keep = bytes.len().saturating_sub(MAX_PCM_BYTES);
                self.audio.extend_from_slice(&bytes[keep..]);
                let discard = self.audio.len().saturating_sub(MAX_PCM_BYTES);
                self.audio.drain(..discard);
            }
            NO_SIGNAL => {
                self.picture = None;
                self.audio.clear();
                self.no_signal = true;
            }
            _ => {}
        }
    }

    fn fail(&mut self, error: String) {
        self.picture = None;
        self.audio.clear();
        self.no_signal = false;
        self.error = Some(error);
    }

    fn drain(&mut self) -> Vec<u8> {
        let mut packet = Vec::new();
        if let Some(error) = self.error.take() {
            append(&mut packet, ERROR, error.as_bytes());
            return packet;
        }
        if std::mem::take(&mut self.no_signal) {
            append(&mut packet, NO_SIGNAL, &[]);
        }
        if let Some(picture) = self.picture.take() {
            append(&mut packet, PICTURE, &picture);
        }
        if !self.audio.is_empty() {
            append(&mut packet, AUDIO, &self.audio);
            self.audio.clear();
        }
        packet
    }
}

fn append(output: &mut Vec<u8>, kind: u8, bytes: &[u8]) {
    output.push(kind);
    output.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    output.extend_from_slice(bytes);
}

struct Preview {
    sender: String,
    stop: Arc<AtomicBool>,
    mailbox: Arc<Mutex<Mailbox>>,
    worker: Option<thread::JoinHandle<()>>,
}

impl Drop for Preview {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
    }
}

#[derive(Default)]
pub struct NdiPreviews {
    next: AtomicU32,
    active: Mutex<HashMap<u32, Preview>>,
}

impl NdiPreviews {
    pub fn clear(&self) {
        if let Ok(mut active) = self.active.lock() {
            active.clear();
        }
    }
}

#[tauri::command]
pub fn ndi_preview_start(sender: String, previews: State<'_, NdiPreviews>) -> Result<u32, String> {
    if sender.is_empty()
        || sender.len() > 255
        || sender.trim() != sender
        || sender.chars().any(char::is_control)
    {
        return Err("Invalid NDI source name.".into());
    }

    let mut active = previews
        .active
        .lock()
        .map_err(|_| String::from("NDI previews are unavailable."))?;
    if active.len() >= MAX_RECEIVERS {
        return Err("Too many NDI previews are open on this computer.".into());
    }
    if active.values().any(|preview| preview.sender == sender) {
        return Err("This NDI source is already open.".into());
    }

    let id = previews.next.fetch_add(1, Ordering::Relaxed);
    let stop = Arc::new(AtomicBool::new(false));
    let mailbox = Arc::new(Mutex::new(Mailbox::default()));
    let worker_stop = Arc::clone(&stop);
    let worker_mailbox = Arc::clone(&mailbox);
    let worker_sender = sender.clone();
    let worker = thread::Builder::new()
        .name("ndi-preview".into())
        .spawn(move || {
            let result = run_receiver(&worker_sender, &worker_stop, |kind, bytes| {
                if worker_stop.load(Ordering::Acquire) {
                    return false;
                }
                let Ok(mut mailbox) = worker_mailbox.lock() else {
                    return false;
                };
                mailbox.push(kind, bytes);
                true
            });
            if let Err(error) = result {
                if let Ok(mut mailbox) = worker_mailbox.lock() {
                    mailbox.fail(error);
                }
            }
        })
        .map_err(|_| String::from("Could not start the NDI receiver."))?;
    active.insert(
        id,
        Preview {
            sender,
            stop,
            mailbox,
            worker: Some(worker),
        },
    );
    Ok(id)
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
use receiver::run as run_receiver;

#[cfg(not(all(target_os = "windows", target_arch = "x86_64")))]
fn run_receiver(
    _sender: &str,
    _stop: &AtomicBool,
    _emit: impl FnMut(u8, Vec<u8>) -> bool,
) -> Result<(), String> {
    Err("Direct NDI preview requires 64-bit Windows.".into())
}

#[tauri::command]
pub fn ndi_preview_poll(id: u32, previews: State<'_, NdiPreviews>) -> Result<Response, String> {
    let mailbox = previews
        .active
        .lock()
        .map_err(|_| String::from("NDI previews are unavailable."))?
        .get(&id)
        .map(|preview| Arc::clone(&preview.mailbox))
        .ok_or_else(|| String::from("This NDI preview has closed."))?;
    let packet = mailbox
        .lock()
        .map_err(|_| String::from("This NDI preview is unavailable."))?
        .drain();
    Ok(Response::new(packet))
}

#[tauri::command]
pub async fn ndi_preview_stop(id: u32, previews: State<'_, NdiPreviews>) -> Result<(), String> {
    let preview = previews
        .active
        .lock()
        .map_err(|_| String::from("NDI previews are unavailable."))?
        .remove(&id);
    if let Some(mut preview) = preview {
        preview.stop.store(true, Ordering::Release);
        if let Some(worker) = preview.worker.take() {
            let _ = tauri::async_runtime::spawn_blocking(move || worker.join()).await;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mailbox_retains_only_the_newest_picture_and_bounded_recent_audio() {
        let mut mailbox = Mailbox::default();
        mailbox.push(PICTURE, vec![1; 16]);
        mailbox.push(PICTURE, vec![2; 8]);
        mailbox.push(AUDIO, vec![1; MAX_PCM_BYTES]);
        mailbox.push(AUDIO, vec![2; 4]);

        let packet = mailbox.drain();
        assert_eq!(packet[0], PICTURE);
        assert_eq!(&packet[5..13], &[2; 8]);
        assert_eq!(packet[13], AUDIO);
        assert_eq!(packet.len(), 18 + MAX_PCM_BYTES);
        assert_eq!(&packet[packet.len() - 4..], &[2; 4]);
        assert!(mailbox.drain().is_empty());
    }

    #[test]
    fn losing_signal_removes_stale_media_and_new_picture_recovers() {
        let mut mailbox = Mailbox::default();
        mailbox.push(PICTURE, vec![1]);
        mailbox.push(AUDIO, vec![1; 4]);
        mailbox.push(NO_SIGNAL, vec![]);
        assert_eq!(mailbox.drain(), [NO_SIGNAL, 0, 0, 0, 0]);

        mailbox.push(NO_SIGNAL, vec![]);
        mailbox.push(PICTURE, vec![2]);
        assert_eq!(mailbox.drain(), [PICTURE, 1, 0, 0, 0, 2]);
    }
}
