# Embed Designer template thumbnails

- [x] Windows Chromium verified that the exported thumbnail preserves transparent pixels as alpha.

- [x] Select the thumbnail frame from the authored Hold start or active playback range.
- [x] Capture the evaluated composition and include the PNG in the normal VCG export.
- [x] Verify the packaged PNG shows the chosen frame and its artwork in fresh Chromium.
      The exported 320×180 PNG contained the animated Hold-start artwork while the
      authoring playhead remained at frame zero. Three book export scenarios also passed.
- [ ] Record the carrying Linux Playwright result.
