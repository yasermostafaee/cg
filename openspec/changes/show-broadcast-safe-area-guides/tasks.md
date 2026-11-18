# Tasks

- [x] Verify guide values against official EBU/SMPTE primary documents.
- [x] Add one pure guide geometry helper and session-only toggles on both normal headers.
- [x] Render non-interactive outlines outside template pages and fit them to active picture bounds.
- [x] Pass 7 geometry and 8 view-store tests, both app typechecks and scoped lint.
- [x] Pass 2 fresh Windows Edge cases through normal entry points: Designer toggle,
      zoom/pan/resize/Fit and PVW empty → delayed page → loaded raster → off, including letterbox.
- [x] Review both screenshots and verify the served template page remains byte-identical,
      both iframes and PGM contain no guides, and no programme command is sent.
- [x] Pass the bounded 18-task dependency/app build and strict OpenSpec validation.
