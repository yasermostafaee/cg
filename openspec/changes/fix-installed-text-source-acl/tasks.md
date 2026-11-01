# Tasks — installed text-source ACL

Lane: **FULL** — this changes an installed-shell refusal condition and Windows package behavior.

## 1. Contract and fix

- [x] 1.1 Declare the two Designer text-source commands in Tauri's app manifest and grant their
      generated permissions to the bundled Designer window only.
- [x] 1.2 Add a regression contract that requires exact custom-command/capability parity for both
      desktop apps, including correct Turbo inputs.
- [x] 1.3 Extend the installed Designer smoke to prove a packaged text-source command crosses ACL.

## 2. Verification

- [x] 2.1 Strict-validate this change and run targeted release/Designer checks.
- [x] 2.2 Run the full local gate and local E2E lane.
- [x] 2.3 Push the exact fix to `dev` and record a completed green Linux workspace/E2E run.
- [x] 2.4 Build the next matching installer set and record a green Windows installed-app smoke.
