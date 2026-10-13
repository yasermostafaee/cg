# Tasks — the sign-in gate's way out of a wrong station (B-320, B-321; `SIGNIN-ESCAPE-01`)

Lane: **FULL** — a persisted key (`cg.runtime.station.v1`, forgotten from the gate), a surface that decides
what an operator can do, and the check's answer on the path to a sign-in.

## 0. Reproduced first, then fixed

- [x] 0.1 Read at `dev` `bf011d79`, then confirmed by RUNNING: `tests/e2e/sign-in-gate-escape.spec.ts`
      against the unchanged build (the built console as CG Control's own page, a real CG Bridge CLI in
      `auth: playout` whose Playout is its own loopback with nothing listening, reached at `192.0.2.93`).
      It went red at both faults: the line read `127.0.0.2 answers, but nothing listens on port 56466.`
      under a card reading `http://192.0.2.93:56466`, and the gate had no `Set up again`.
- [x] 0.2 The same state on the INSTALLED apps, unfixed: the release acceptance's `stuck-station` phase on a
      reproduction branch at `bf011d79` (`wip/signin-escape-repro`, `desktop.yml` trimmed to `installers`
      and `acceptance-fresh`), dispatched as run 38065020101. It reproduced the owner's gate exactly:
      `install` 27/27, `drive` 26/26 and `uninstall` 21/21 passed; `stuck-station` failed 10/22. The card read
      `http://10.1.0.108:8080`, the line read `127.0.0.1 answers, but nothing listens on port 8080.`, and the
      gate had no `Set up again` —
      https://github.com/yasermostafaee/cg/actions/runs/38065020101

## 1. B-320 — the gate's way back to Set up

- [x] 1.1 `SetUpAgain` (`renderer/features/shell/`): the one control the banner and the gate share. It is
      present only where `setup.canSetPlayoutAddress()`, calls `forgetStation()` and then reloads on purpose,
      uses the `ghost` variant, and has no confirm and no prose.
- [x] 1.2 `ConnectionBanner` renders it instead of its own copy; `SignInOverlay` renders it in the foot
      under `Sign in`, never locked with the fields; `controls.css` spaces a second control in the foot.
- [x] 1.3 `signInOverlay.dom.test.ts` — six tests: the owner's state inside CG Control (the fields still
      locked; pressing forgets and reloads, with no check and no sign-in sent); offered whatever the check
      says; the banner's own control (`ghost`, no style, no prose); a store that will not forget does not
      reload; signing in is unchanged beside it; a browser has none. `connectionBannerSetUpAgain.dom.test.ts`
      still passes unchanged.
- [x] 1.4 `tests/e2e/sign-in-gate-escape.spec.ts` — the owner's state end to end in Chromium: the gate, the
      control under `Sign in` and inside the card (measured), Tab past it staying on the card, then the Set up
      page with the record gone, and a good address (`192.0.2.32`, a second CG Bridge with a Playout that
      answers) connecting to a gate whose check passes. Green locally (Windows; not a discharge).
- [x] 1.5 The release acceptance's `stuck-station` phase (`acceptance-fresh`, between `drive` and
      `uninstall`): the record names the installed CG Bridge at the runner's LAN address, no session is held,
      and the fake Playout is offline on its port. Then the gate → `Set up again` → Set up → the Playout back
      online → `127.0.0.1` → Connect → a passing check → signed in. `acceptance-station.mjs` gains
      `/playout/offline` and `/playout/online`.
- [x] 1.6 Discharged on `f1440540`. The Linux `e2e` job RAN (from its log: runtime 337 passed, 2 skipped;
      `sign-in-gate-escape.spec.ts` passed) —
      https://github.com/yasermostafaee/cg/actions/runs/38066342564/job/114254688376 — and the whole Desktop run
      was green, with `acceptance-fresh`'s `stuck-station` at 21/21 on the installed apps —
      https://github.com/yasermostafaee/cg/actions/runs/38066342591/job/114256848783

## 2. B-321 — the answer in the name the console was given

- [x] 2.1 Why the line names the loopback: the console asks by CG Bridge's name (`playoutAsBridgeNamesIt`,
      `B-317`) and showed CG Bridge's answer as it came back. The fix is the console's. No CG Bridge change,
      so nothing is filed. It is not in `decidingLine`, which only picks a line: first-run's full check meets
      the same mismatch through the same rename.
- [x] 2.2 `checkByBridgeName` (`platform/checkAt.ts`): the rename and its reverse in one function, used by
      both places a check is asked (`WebSocketRuntime.setup.check` on the console's own socket,
      `checkOnItsOwnSocket`). `linesInTheGivenName` renames only the `api`, `cors`, `playout-version` and
      `amcp` lines, the host only as a whole name, and never a status.
- [x] 2.3 Unit tests (`checkAt.test.ts`), five: the owner's line and the `amcp` line renamed, with the `route`
      line and every status kept; a URL in a line; only the whole name (`127.0.0.10`, `10.127.0.0.1` left
      alone); a check asked as given returned untouched; and the second door (a check's own socket).
      Ablation (the reverse removed from `checkByBridgeName`) reds both door tests.
- [x] 2.4 The e2e asserts the gate's line names the card's host
      (`192.0.2.93 answers, but nothing listens on port …`), and so does the `stuck-station` phase.
- [x] 2.5 Discharged on `3f80018c`. The Linux `e2e` job RAN (from its log: runtime 337 passed, 2 skipped;
      the spec, now with B-321's assertion, passed) —
      https://github.com/yasermostafaee/cg/actions/runs/38068568919/job/114261164326 — and the whole Desktop run
      was green, with `stuck-station` at 22/22 on the installed apps. Its line read
      `10.1.0.11 answers, but nothing listens on port 8080.` under `http://10.1.0.11:8080` —
      https://github.com/yasermostafaee/cg/actions/runs/38068568896/job/114263285031

## 3. Report

- [x] 3.1 `Claude outputs/REPORT-SIGNIN-ESCAPE-01-v2-2026-10-10.md`, with before/after pictures and the
      owner's one check (H1).
- [ ] 3.2 The owner's H1 on his own PC, on a CI build of `3f80018c` (not a release).
