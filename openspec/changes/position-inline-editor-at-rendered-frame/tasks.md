# Tasks

- [x] 1.1 Register B-419 and reuse the Canvas hit-testing pose for inline text editing.
- [x] 1.2 Reproduce the editor offset in Chromium with a keyframed Y position.
- [x] 2.1 Chromium measured a 104.9 px vertical offset before the fix. At frames 18 and 35
      after the fix the editor aligned within 1 px and the edited text rendered at both frames.
- [x] 2.2 The pre-push gate on `7cfe2b65` passed 103 uncached tasks and 165 strict OpenSpec
      checks (`gate-20261109T004904Z-20004.log`). Chromium passed the built-app regression.
- [ ] 2.3 Read the carrying commit's Linux E2E result.
