## 1. Startup

- [x] 1.1 Remove the cold and warm floors and session marker in both inline pages.
- [x] 1.2 Start CSS loading motion immediately and advance the rail by finished phases.
- [x] 1.3 Begin dismissal at boot completion and keep the backstop and reduced-motion support.

## 2. Verification

- [x] 2.1 Both inline pages animated in Chromium while the entry bundle was held and began
      dismissal in the real boot callback. Reduced-motion and build-stamp cases passed.
- [ ] 2.2 Run the repository gate and strict OpenSpec validation.
- [ ] 2.3 Verify the rebuilt installed apps when installers are requested.
