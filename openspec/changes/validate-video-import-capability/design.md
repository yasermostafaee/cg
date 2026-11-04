# Design — video-import compatibility preflight

## Boundaries

The file extension is an immediate picker/selection gate, not proof of codec support. Codec capability
is proved by the same bundled ffmpeg core that will convert the file; there is no second hard-coded
codec allowlist. The conversion and its browser playthrough verification remain the authoritative
full-file checks because a first-frame probe cannot prove that every later frame is intact.

## Fast compatibility probe

The existing metadata probe remains first. Poster extraction is useful but optional: if the mid-clip
poster fails, a minimal frame-zero decode is attempted. A successful fallback permits the existing
poster-less numeric-crop path. Failure of both decode attempts returns a typed file/decode refusal and
never reaches conversion. A worker/FS exception is still an internal converter failure and does not
label the source unsupported.

## Pixel geometry

Crop coordinates remain in coded source pixels. The modal draws them over a preview stretched to the
source display aspect. For a non-1:1 sample-aspect ratio, conversion crops first, then scales the
cropped width by the same ratio and writes `SAR 1:1`; expected stored dimensions use the identical
rounding rule. Square-pixel sources add no scale/filter stage and retain the existing fast path.
When non-square metadata is known to be wrong, `Pixel dimensions` is a separate explicit recipe:
crop remains in coded pixels, no display-width scale runs, and `setsar=1` prevents metadata from
stretching the WebM again. The choice is stored and included in dedupe.

## QTRLE colour compatibility

The supplied QTRLE/ARGB MOV stores standards-correct green bytes while VLC 3's legacy RV32 path
renders the same bytes purple. No container metadata identifies which look the author intended, so
automatic channel permutation would corrupt valid sources. Only QTRLE+ARGB exposes an explicit
`Standard file colors` / `Match VLC 3 colors` choice. The VLC recipe converts decoded RGBA as
`R←G, G←R, B←A, A←A`; preview and conversion use the same selection, and the mixer runs before
un-premultiply or alpha bleed. Provenance/dedupe distinguish the two byte recipes.

## Copy

The primary help names proven presets rather than promising every codec inside a container:

- transparency: MOV/QuickTime Animation (QTRLE), uncompressed AVI/BGRA, or a numbered PNG sequence;
- no transparency: H.264 MP4/MOV or VP8/VP9 WebM.

The full accepted extension list is secondary. Technical ffmpeg output remains available for support
but is never the only explanation shown to the operator.
