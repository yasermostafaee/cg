## 1. Root cause and fix

- [x] Reproduce the owner's `cr.vcg` at rest and distinguish the Sequence clip from stage bounds.
- [x] Verify the old exported runtime clips synthetic Persian ink and the corrected page preserves
      it at rest while retaining vertical Push clipping in Chromium.
- [x] Verify the supplied cr.vcg through the CG Control page generator in Windows Chromium.
      The corrected baseline eliminates 635 cropped lower-edge ink pixels.
- [ ] Record the carrying Linux Playwright result and the target engine check.
