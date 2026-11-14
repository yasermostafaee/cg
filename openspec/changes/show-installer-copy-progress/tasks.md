## 1. Measurement and presentation

- [x] Reproduce the difference between solid NSIS preparation and destination writes.
- [x] Keep the prior file metadata out of the copy total and observe partial Windows writes.
- [x] Show activity, actual written bytes and a separate successful completion state.
- [x] Verify NSIS 3.11 on a Windows scratch install. A 64 MiB inert payload showed 25%, 50%
      and 75% writes with the Tauri compression hook. Both modes exited 0 and wrote the same hash.
- [x] Build the Windows setup wrapper and run its 80 Rust tests.
- [x] Render the copy state of the shared Setup window to verify its byte text.
- [ ] Verify fresh and upgrade flows for the three packaged installers on clean Windows.
