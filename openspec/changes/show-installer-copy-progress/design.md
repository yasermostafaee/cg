# Installer copy progress

CG Setup polls planned payload files through attribute-only Windows handles. Recording the
file metadata before starting NSIS avoids counting an old installation as a new write.
Reported bytes are capped per planned file. Existing step evidence and the child exit drive
registration and completion.

NSIS solid LZMA expands a full entry into temporary storage before copying it to the install
directory. Bridge uses non-solid LZMA. The shared Tauri hook uses streaming zlib for the
desktop payload and WebView2; the stock template's `none` option leaves solid mode disabled
before the hook enables compression. Setup samples destination bytes every 25 ms through the
copy step, and posts new UI state only if it changes. The Setup window shows an activity
segment while no reliable byte measure exists.
When Windows reports a partial write, the weighted bar uses those bytes and the page shows
the written and planned size. Reduced-motion mode keeps the activity segment static.
The progress bar exposes an accessible numeric value only during measured progress.
