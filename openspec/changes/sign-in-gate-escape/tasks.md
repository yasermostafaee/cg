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
      and `acceptance-fresh`), dispatched as run 38065020101.

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
- [ ] 1.6 Discharged: a completed, green Linux `e2e` job, and `acceptance-fresh` with `stuck-station`
      passing, on the commit that carries it (run URLs here).

## 2. B-321 — the answer in the name the console was given

- [ ] 2.1 Why the line names the loopback: the console asks by CG Bridge's name (`playoutAsBridgeNamesIt`,
      `B-317`) and showed CG Bridge's answer as it came back. The fix is the console's. No CG Bridge change,
      so nothing is filed.
- [ ] 2.2 `checkByBridgeName` (`platform/checkAt.ts`): the rename and its reverse in one function, used by
      both places a check is asked (`WebSocketRuntime.setup.check` on the console's own socket,
      `checkOnItsOwnSocket`).
- [ ] 2.3 Unit tests (`checkAt.test.ts`): the owner's line, a URL in a line, the `route` line kept, a check
      asked as given left alone, and a host that only looks like the asked one left alone.
- [ ] 2.4 The e2e and the `stuck-station` phase assert the gate's line names the card's host.
- [ ] 2.5 Discharged on the commit that carries it (run URLs here).

## 3. Report

- [ ] 3.1 `Claude outputs/REPORT-SIGNIN-ESCAPE-01-v2-2026-10-10.md`, with before/after pictures and the
      owner's one check (H1).
