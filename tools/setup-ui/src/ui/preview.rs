//! The developer's preview: the same painter on a bitmap instead of a window, written to PNG at a
//! given scale. Only a bare `cg-setup.exe` offers it (nothing appended), so no installer can.

use super::gfx::{paint, Device, Frame, Gfx};
use crate::layout::{Scene, WidgetId, WIN_H, WIN_W};
use std::path::Path;
use windows::core::{Interface, Result, HSTRING};
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;
use windows::Win32::Graphics::Imaging::*;
use windows::Win32::System::Com::StructuredStorage::IPropertyBag2;
use windows::Win32::System::Com::{IStream, STGM_CREATE, STGM_WRITE};
use windows::Win32::UI::Shell::SHCreateStreamOnFileEx;

pub struct Shot<'a> {
    pub scene: &'a Scene,
    pub role: &'a str,
    pub tile_png: Option<&'a [u8]>,
    pub focus: Option<WidgetId>,
    pub hover: Option<WidgetId>,
}

pub fn render(g: &Gfx, shot: &Shot, scale: f32, out: &Path) -> Result<()> {
    unsafe {
        let (w, h) = (
            (WIN_W * scale).round() as u32,
            (WIN_H * scale).round() as u32,
        );
        let bitmap =
            g.wic
                .CreateBitmap(w, h, &GUID_WICPixelFormat32bppPBGRA, WICBitmapCacheOnLoad)?;
        let props = D2D1_RENDER_TARGET_PROPERTIES {
            r#type: D2D1_RENDER_TARGET_TYPE_SOFTWARE,
            pixelFormat: D2D1_PIXEL_FORMAT {
                format: DXGI_FORMAT_B8G8R8A8_UNORM,
                alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
            },
            dpiX: 96.0 * scale,
            dpiY: 96.0 * scale,
            usage: D2D1_RENDER_TARGET_USAGE_NONE,
            minLevel: D2D1_FEATURE_LEVEL_DEFAULT,
        };
        let rt = g.d2d.CreateWicBitmapRenderTarget(&bitmap, &props)?;
        rt.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
        let mut dev = Device::default();
        let hover = shot.hover;
        let hover_fn = move |id: WidgetId| if Some(id) == hover { 1.0 } else { 0.0 };
        let frame = Frame {
            scene: shot.scene,
            role: shot.role,
            tile_png: shot.tile_png,
            hover: &hover_fn,
            pressed: None,
            focus: shot.focus,
            focus_visible: shot.focus.is_some(),
            page_t: 1.0,
            step_t: [1.0; crate::model::MAX_STEPS],
            mark_t: 1.0,
            dwm_border: true,
            scale,
        };
        rt.BeginDraw();
        paint(g, &rt, &mut dev, &frame);
        rt.EndDraw(None, None)?;

        let stream: IStream = SHCreateStreamOnFileEx(
            &HSTRING::from(out.as_os_str()),
            (STGM_CREATE | STGM_WRITE).0,
            0,
            true,
            None,
        )?;
        let encoder = g
            .wic
            .CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())?;
        encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
        let mut frame_enc: Option<IWICBitmapFrameEncode> = None;
        let mut bag: Option<IPropertyBag2> = None;
        encoder.CreateNewFrame(&mut frame_enc, &mut bag)?;
        let frame_enc = frame_enc.ok_or_else(windows::core::Error::empty)?;
        frame_enc.Initialize(bag.as_ref())?;
        frame_enc.SetSize(w, h)?;
        let mut fmt = GUID_WICPixelFormat32bppPBGRA;
        frame_enc.SetPixelFormat(&mut fmt)?;
        frame_enc.WriteSource(&bitmap.cast::<IWICBitmapSource>()?, std::ptr::null())?;
        frame_enc.Commit()?;
        encoder.Commit()?;
        Ok(())
    }
}
