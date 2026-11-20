use jpeg_encoder::{ColorType, Encoder};
use libloading::os::windows::{
    Library, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR,
};
use std::ffi::{c_char, c_void, CStr};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use std::{env, ptr, slice, thread};

const DLL_NAME: &str = "Processing.NDI.Lib.x64.dll";
const PREVIEW_RATE: i32 = 25;
const AUDIO_RATE: i32 = 48_000;
const AUDIO_CHANNELS: i32 = 2;
const AUDIO_SAMPLES: i32 = AUDIO_RATE / PREVIEW_RATE;
const FRAME_PERIOD: Duration = Duration::from_millis(1_000 / PREVIEW_RATE as u64);
const JPEG: u8 = 1;
const PCM: u8 = 2;
const NO_SIGNAL: u8 = 3;
const RGBX: u32 = u32::from_le_bytes(*b"RGBX");
const RGBA: u32 = u32::from_le_bytes(*b"RGBA");
const RECEIVER_COLOR_RGBX_RGBA: i32 = 2;
const RECEIVER_BANDWIDTH_PREVIEW: i32 = 0;
const PROGRESSIVE: i32 = 1;

// Minimal declarations for the published NDI C ABI. The runtime is loaded from
// the installed NDI SDK/redistributable and no SDK binary is bundled here.
type Instance = *mut c_void;
type Destroy = unsafe extern "C" fn(Instance);

#[repr(C)]
#[derive(Clone, Copy)]
struct Source {
    name: *const c_char,
    address: *const c_char,
}

#[repr(C)]
struct ReceiverSettings {
    source: Source,
    color_format: i32,
    bandwidth: i32,
    allow_video_fields: bool,
    name: *const c_char,
}

#[repr(C)]
#[derive(Default)]
struct VideoFrame {
    width: i32,
    height: i32,
    fourcc: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    aspect: f32,
    frame_format: i32,
    timecode: i64,
    data: *mut u8,
    line_stride: i32,
    metadata: *const c_char,
    timestamp: i64,
}

#[repr(C)]
#[derive(Default)]
struct AudioFrame {
    sample_rate: i32,
    channels: i32,
    samples: i32,
    timecode: i64,
    data: *mut f32,
    channel_stride: i32,
    metadata: *const c_char,
    timestamp: i64,
}

struct Api {
    _library: Library,
    find_create: unsafe extern "C" fn(*const c_void) -> Instance,
    find_destroy: Destroy,
    find_wait: unsafe extern "C" fn(Instance, u32) -> bool,
    find_sources: unsafe extern "C" fn(Instance, *mut u32) -> *const Source,
    recv_create: unsafe extern "C" fn(*const ReceiverSettings) -> Instance,
    recv_destroy: Destroy,
    connection_count: unsafe extern "C" fn(Instance) -> i32,
    sync_create: unsafe extern "C" fn(Instance) -> Instance,
    sync_destroy: Destroy,
    capture_video: unsafe extern "C" fn(Instance, *mut VideoFrame, i32),
    free_video: unsafe extern "C" fn(Instance, *mut VideoFrame),
    capture_audio: unsafe extern "C" fn(Instance, *mut AudioFrame, i32, i32, i32),
    free_audio: unsafe extern "C" fn(Instance, *mut AudioFrame),
}

impl Api {
    fn load(path: &Path) -> Result<Self, ()> {
        // The DLL path is absolute and dependencies are searched only in
        // trusted loader locations and the NDI runtime's own directory.
        unsafe {
            let library = Library::load_with_flags(
                path,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            )
            .map_err(|_| ())?;
            let initialize = *library
                .get::<unsafe extern "C" fn() -> bool>(b"NDIlib_initialize\0")
                .map_err(|_| ())?;
            macro_rules! load {
                ($name:literal) => {
                    *library
                        .get(concat!($name, "\0").as_bytes())
                        .map_err(|_| ())?
                };
            }
            let api = Self {
                find_create: load!("NDIlib_find_create_v2"),
                find_destroy: load!("NDIlib_find_destroy"),
                find_wait: load!("NDIlib_find_wait_for_sources"),
                find_sources: load!("NDIlib_find_get_current_sources"),
                recv_create: load!("NDIlib_recv_create_v3"),
                recv_destroy: load!("NDIlib_recv_destroy"),
                connection_count: load!("NDIlib_recv_get_no_connections"),
                sync_create: load!("NDIlib_framesync_create"),
                sync_destroy: load!("NDIlib_framesync_destroy"),
                capture_video: load!("NDIlib_framesync_capture_video"),
                free_video: load!("NDIlib_framesync_free_video"),
                capture_audio: load!("NDIlib_framesync_capture_audio"),
                free_audio: load!("NDIlib_framesync_free_audio"),
                _library: library,
            };
            if !initialize() {
                return Err(());
            }
            Ok(api)
        }
    }
}

fn runtime_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
    for version in [6, 5] {
        if let Some(root) = env::var_os(format!("NDI_RUNTIME_DIR_V{version}")) {
            paths.push(PathBuf::from(root).join(DLL_NAME));
        }
        if let Some(root) = &program_files {
            let ndi = root.join("NDI");
            let runtime = ndi.join(format!("NDI {version} Runtime"));
            paths.push(runtime.join(DLL_NAME));
            paths.push(runtime.join(format!("v{version}")).join(DLL_NAME));
            paths.push(
                ndi.join(format!("NDI {version} SDK"))
                    .join("Bin")
                    .join("x64")
                    .join(DLL_NAME),
            );
        }
    }
    paths
}

fn installed_api() -> Result<&'static Api, String> {
    // One SDK initialization per desktop process, with an independent video
    // and audio receiver per source. A failed lookup can be retried.
    static API: OnceLock<Api> = OnceLock::new();
    static LOADING: Mutex<()> = Mutex::new(());
    if let Some(api) = API.get() {
        return Ok(api);
    }
    let _guard = LOADING.lock().map_err(|_| "NDI Runtime could not start.")?;
    if let Some(api) = API.get() {
        return Ok(api);
    }
    let mut found = false;
    for path in runtime_paths() {
        if !path.is_absolute() || !path.is_file() {
            continue;
        }
        found = true;
        if let Ok(api) = Api::load(&path) {
            return Ok(API.get_or_init(|| api));
        }
    }
    Err(if found {
        "The installed NDI Runtime could not start. Check the 64-bit NDI Runtime."
    } else {
        "Install the 64-bit NDI Runtime on this CG Control computer for direct preview."
    }
    .into())
}

struct Handle {
    value: Instance,
    destroy: Destroy,
}

impl Handle {
    fn new(value: Instance, destroy: Destroy, error: &str) -> Result<Self, String> {
        if value.is_null() {
            return Err(error.into());
        }
        Ok(Self { value, destroy })
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { (self.destroy)(self.value) };
    }
}

fn discover(
    api: &Api,
    sender: &str,
    stop: &AtomicBool,
    emit: &mut impl FnMut(u8, Vec<u8>) -> bool,
) -> Result<Option<Handle>, String> {
    let finder = Handle::new(
        unsafe { (api.find_create)(ptr::null()) },
        api.find_destroy,
        "NDI discovery could not start.",
    )?;
    let mut reported_unavailable = false;
    while !stop.load(Ordering::Acquire) {
        let mut count = 0_u32;
        let sources = unsafe { (api.find_sources)(finder.value, &mut count) };
        if !sources.is_null() && count > 0 {
            let active = unsafe { slice::from_raw_parts(sources, count as usize) };
            for source in active {
                if source.name.is_null()
                    || unsafe { CStr::from_ptr(source.name).to_bytes() } != sender.as_bytes()
                {
                    continue;
                }
                let settings = ReceiverSettings {
                    source: *source,
                    color_format: RECEIVER_COLOR_RGBX_RGBA,
                    bandwidth: RECEIVER_BANDWIDTH_PREVIEW,
                    allow_video_fields: false,
                    name: c"APASAI CG Preview".as_ptr(),
                };
                let receiver = Handle::new(
                    unsafe { (api.recv_create)(&settings) },
                    api.recv_destroy,
                    "The NDI receiver could not start.",
                )?;
                return Ok(Some(receiver));
            }
        }
        if !reported_unavailable {
            reported_unavailable = true;
            if !emit(NO_SIGNAL, Vec::new()) {
                return Ok(None);
            }
        }
        unsafe { (api.find_wait)(finder.value, 250) };
    }
    Ok(None)
}

fn preview_size(width: usize, height: usize, aspect: f32) -> (usize, usize) {
    let display_aspect = if aspect.is_finite() && (0.1..=10.0).contains(&aspect) {
        f64::from(aspect)
    } else {
        width as f64 / height as f64
    };
    let height = (width as f64 / display_aspect)
        .min(360.0)
        .min(640.0 / display_aspect);
    let width = (height * display_aspect).round().clamp(1.0, 640.0);
    (width as usize, height.round().clamp(1.0, 360.0) as usize)
}

fn encode_video(frame: &VideoFrame, rgb: &mut Vec<u8>) -> Result<Option<Vec<u8>>, String> {
    if frame.data.is_null() || !matches!(frame.fourcc, RGBX | RGBA) {
        return Ok(None);
    }
    let width = frame.width as usize;
    let height = frame.height as usize;
    let stride = frame.line_stride as usize;
    if !(1..=8192).contains(&width)
        || !(1..=8192).contains(&height)
        || !(width * 4..=36_864).contains(&stride)
    {
        return Ok(None);
    }
    let pixels = unsafe { slice::from_raw_parts(frame.data, (height - 1) * stride + width * 4) };
    let (out_width, out_height) = preview_size(width, height, frame.aspect);
    rgb.resize(out_width * out_height * 3, 0);
    for (y, row) in rgb.chunks_exact_mut(out_width * 3).enumerate() {
        let source_y = (y * height + height / 2) / out_height * stride;
        for (x, pixel) in row.chunks_exact_mut(3).enumerate() {
            let source_x = (x * width + width / 2) / out_width * 4;
            pixel.copy_from_slice(&pixels[source_y + source_x..source_y + source_x + 3]);
        }
    }
    let mut jpg = Vec::new();
    Encoder::new(&mut jpg, 76)
        .encode(rgb, out_width as u16, out_height as u16, ColorType::Rgb)
        .map_err(|_| "Could not encode the NDI preview picture.")?;
    Ok(Some(jpg))
}

fn pcm_sample(sample: f32) -> [u8; 2] {
    // NDI's nominal level (1.0) leaves 20 dB of headroom in the PCM monitor.
    let peak = (sample * 0.1).clamp(-1.0, 1.0);
    ((peak * f32::from(i16::MAX)).round() as i16).to_le_bytes()
}

fn encode_audio(frame: &AudioFrame) -> Option<Vec<u8>> {
    let bytes_per_channel = AUDIO_SAMPLES * 4;
    if frame.data.is_null()
        || frame.channels != AUDIO_CHANNELS
        || frame.sample_rate != AUDIO_RATE
        || frame.samples != AUDIO_SAMPLES
        || frame.channel_stride < bytes_per_channel
        || frame.channel_stride > 1_048_576
        || frame.channel_stride % 4 != 0
    {
        return None;
    }
    let samples = AUDIO_SAMPLES as usize;
    let left = unsafe { slice::from_raw_parts(frame.data, samples) };
    let right = unsafe {
        slice::from_raw_parts(frame.data.add(frame.channel_stride as usize / 4), samples)
    };
    let mut pcm = Vec::with_capacity(samples * 4);
    for (&left, &right) in left.iter().zip(right) {
        pcm.extend_from_slice(&pcm_sample(left));
        pcm.extend_from_slice(&pcm_sample(right));
    }
    Some(pcm)
}

pub fn run(
    sender: &str,
    stop: &AtomicBool,
    mut emit: impl FnMut(u8, Vec<u8>) -> bool,
) -> Result<(), String> {
    let api = installed_api()?;
    let Some(receiver) = discover(api, sender, stop, &mut emit)? else {
        return Ok(());
    };
    let sync = Handle::new(
        unsafe { (api.sync_create)(receiver.value) },
        api.sync_destroy,
        "NDI audio/video synchronization could not start.",
    )?;
    let mut deadline = Instant::now();
    let mut rgb = Vec::new();
    let mut was_connected = None;
    while !stop.load(Ordering::Acquire) {
        let connected = unsafe { (api.connection_count)(receiver.value) } > 0;
        if !connected && was_connected != Some(false) && !emit(NO_SIGNAL, Vec::new()) {
            return Ok(());
        }
        was_connected = Some(connected);
        if connected {
            let mut video = VideoFrame::default();
            unsafe { (api.capture_video)(sync.value, &mut video, PROGRESSIVE) };
            let picture = encode_video(&video, &mut rgb);
            unsafe { (api.free_video)(sync.value, &mut video) };
            if let Some(jpeg) = picture? {
                if !emit(JPEG, jpeg) {
                    return Ok(());
                }
            }

            let mut audio = AudioFrame::default();
            unsafe {
                (api.capture_audio)(
                    sync.value,
                    &mut audio,
                    AUDIO_RATE,
                    AUDIO_CHANNELS,
                    AUDIO_SAMPLES,
                )
            };
            let pcm = encode_audio(&audio);
            unsafe { (api.free_audio)(sync.value, &mut audio) };
            if let Some(pcm) = pcm {
                if !emit(PCM, pcm) {
                    return Ok(());
                }
            }
        }
        deadline += FRAME_PERIOD;
        let now = Instant::now();
        if deadline <= now {
            // Do not burst old A/V after the worker loses a time slot.
            deadline = now + FRAME_PERIOD;
        }
        thread::sleep(deadline - now);
    }
    // Drop order is important: NDI frame sync before its receiver.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::mem::{offset_of, size_of};

    #[test]
    fn ndi_v5_v6_abi_matches_win64_c_alignment() {
        assert_eq!(size_of::<Source>(), 16);
        assert_eq!(size_of::<ReceiverSettings>(), 40);
        assert_eq!(offset_of!(ReceiverSettings, name), 32);
        assert_eq!(size_of::<VideoFrame>(), 72);
        assert_eq!(offset_of!(VideoFrame, data), 40);
        assert_eq!(size_of::<AudioFrame>(), 56);
        assert_eq!(offset_of!(AudioFrame, data), 24);
    }

    #[test]
    fn jpeg_preserves_display_aspect_in_bounds() {
        assert_eq!(preview_size(1920, 1080, 16.0 / 9.0), (640, 360));
        assert_eq!(preview_size(720, 576, 4.0 / 3.0), (480, 360));
        assert_eq!(preview_size(1080, 1920, f32::NAN), (203, 360));
        assert_eq!(preview_size(320, 180, f32::NAN), (320, 180));
    }

    #[test]
    fn audio_interleaves_two_channels_with_headroom() {
        let stride = AUDIO_SAMPLES as usize;
        let mut raw = vec![0.0_f32; stride * 2];
        raw[0] = 1.0;
        raw[stride] = -2.0;
        let frame = AudioFrame {
            sample_rate: AUDIO_RATE,
            channels: AUDIO_CHANNELS,
            samples: AUDIO_SAMPLES,
            data: raw.as_mut_ptr(),
            channel_stride: AUDIO_SAMPLES * 4,
            ..Default::default()
        };
        let pcm = encode_audio(&frame).unwrap();
        assert_eq!(pcm.len(), stride * 4);
        assert_eq!(i16::from_le_bytes([pcm[0], pcm[1]]), 3277);
        assert_eq!(i16::from_le_bytes([pcm[2], pcm[3]]), -6553);
        assert!(pcm[4..].iter().all(|&value| value == 0));
    }

    #[test]
    fn bad_frame_strides_are_rejected_before_read() {
        let mut dummy = [0_u8; 4];
        let frame = VideoFrame {
            width: 320,
            height: 180,
            fourcc: RGBX,
            data: dummy.as_mut_ptr(),
            line_stride: 4,
            ..Default::default()
        };
        assert!(encode_video(&frame, &mut Vec::new()).unwrap().is_none());
    }
}
