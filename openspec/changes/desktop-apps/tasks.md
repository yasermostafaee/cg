# Tasks — `desktop-apps` (`DESKTOP-APPS-01` v2 + `DESKTOP-APPS-01-A`)

## 1. Establish, before building (`design.md` §1)

- [x] 1.1 Tauri 2.11; one Cargo workspace; CI-only Rust (no MSVC on the owner's host)
- [x] 1.2 The sidecar: pure-JS tree; one ESM bundle; SEA measured and refused (CJS vs top-level
      `await`); `node.exe` + bundle chosen; no `import.meta.url`/`__dirname` sites
- [x] 1.3 The console served by the bridge on a new loopback listener (5174), never 7911; the
      console's address derivation unchanged (measured with the staged sidecar)
- [x] 1.4 The Designer in Tauri — secure context, OPFS, all three pickers, ffmpeg under the CSP:
      measured in the installed app (https://github.com/yasermostafaee/cg/actions/runs/35864172600,
      again on 35866930187; `design.md` §4). Folder permission after a restart is NOT measurable in
      CI — owed by the owner, §7 step 2 (`P-054` stays conditional on it)
- [x] 1.5 Fonts: the Runtime's CDN link; the Designer already self-hosted (chrome stack: `B-263`)
- [x] 1.6 Persisted paths and the serve host's home

## 2. The bridge as a sidecar

- [x] 2.1 `ConsoleHttpServer` + `--console-dir`/`--console-port` + `/__cg/health`
- [x] 2.2 `--state-home` (census unchanged); `--exit-on-stdin-close`
- [x] 2.3 `scripts/bundle.mjs`, and the bundle started as the shell starts it (test)

## 3. Fonts (`P-001`)

- [x] 3.1 `main.tsx` imports `fonts.css`; the CDN link and `cdn.jsdelivr.net` leave the page and CSP
- [x] 3.2 `fonts-offline.spec.ts` in both apps — absence + control

## 4. The desktop shells and the installers

- [x] 4.1 CG Control shell: sidecar start/wait/navigate, starting page, failure page, lifeline stop,
      leftover stop-and-restart, single instance, _Open bridge log_, shell log + panic hook
- [x] 4.2 Plain paths for the sidecar (`\\?\` measured fatal to Node on run 35856634409)
- [x] 4.3 NSIS per-machine + firewall hooks (add/remove, program-scoped); WebView2 offline installer
- [x] 4.4 CG Designer shell; NSIS per-user; WebView2 offline installer
- [x] 4.5 `.github/workflows/desktop.yml`: build both; smoke both on a second clean runner
- [x] 4.6 The installer smoke green on a run — URL:
      https://github.com/yasermostafaee/cg/actions/runs/35866930187 on `a309c2b2` — job
      `Installer smoke (clean Windows)` completed/success, **35/35**, apps driven at Medium
      integrity (control: install phase reads High), incl. first-run on a fresh install and the door
      moving it to the sign-in without a reload

## 5. First-run (+ `DESKTOP-APPS-01-A`)

- [x] 5.1 A1 — `playout.address`; every endpoint derives from it; the issuer optional
- [x] 5.2 A2/A3 — adoption from the first station-admin; persisted; not-set-up refusal; never
      re-adopted; cleared by an address change
- [x] 5.3 A4 — a loopback `casparHost` resolved to the Playout's host inside the one D4 reader
- [x] 5.4 The one door: `set_playout_address` (capability, remote URL) → the CLI's
      `--set-playout-address` one-shot → restart. Not the control socket.
- [x] 5.5 `--first-run`: the phase on `bridge.capabilities`; no bank until one is declared
- [x] 5.6 `channels.catalogue` (station-admin, grant-filtered, unjoined); `setup.check` (seven lines);
      `setup.route-address`; the three route censuses updated by name
- [x] 5.7 The console: first-run screen (address + check → sign-in → channel → serve address), A5
      fallback prefill; Station setup → Servers Playout card
- [x] 5.8 Tests: bridge A1–A4 + phases + check shapes; console unit; first-run e2e + control

## 5B. `DESKTOP-APPS-01-B` — Playout 2.8.54: the built-in account and AMCP auto-trust

- [x] 5B.1 B1 — AMCP waits for a station-admin: `amcpAwaitsSignIn` on health (never up since
      start, no station-admin yet); a station-admin's first acceptance reads D4 at once with its own
      token (`PlayoutCatalogue.readNow`) and hurries the ONE loop (`ServerSession.retryPromptly`,
      ≤ 500 ms for 30 s); the console's banner says it in one sentence
- [x] 5B.2 B1.4 — every Playout request through `playoutFetch`: no `Origin`, no proxy (measured:
      `NODE_USE_ENV_PROXY=1` sent Node's `fetch` and `jose` to the proxy); the check probes the same
      path
- [x] 5B.3 B2 — the check's AMCP line: `wait` before a station-admin; judged over 30 s after; "The
      Playout did not trust this machine" + likely reasons, then the `secure-ports.ps1` fallback;
      first-run re-checks after the sign-in and shows the channels only then
- [x] 5B.4 B3 — the fake Playout trusts what 2.8.54 trusts (verified token, `station-admin`, no
      `Origin`, not revoked, auto-trust on); the AMCP mock's `admit`; tests with controls
- [x] 5B.5 B4 — `docs/integration/playout/PLAYOUT-2.8.54-CG-FACTS-2026-09-23.md`; ADR 0010's
      amendment (the JWKS is the root of trust; `iss` a constant check); ADR 0011's dependencies;
      the operator guide's password line; `C-042`
- [ ] 5B.6 Linux `e2e` discharged on the commit carrying 5B — run URL (job confirmed RAN):

## 6. Records

- [x] 6.1 ADR 0011; ADR 0010 amendment (the issuer is learned)
- [x] 6.2 Operator guide — _Installing and connecting_
- [x] 6.3 PRD: `P-051`…`P-054`, `R-067`, `R-068`, `B-262`, `B-263`; `P-001` → `[~]`; DEBT item 4
      closed
- [x] 6.4 Linux `e2e` discharged — run URL (job confirmed RAN):
      https://github.com/yasermostafaee/cg/actions/runs/35859184070 on `2a879d08` (carries every
      code commit of this change); job `E2E (Playwright)` completed/success with its `E2E` step RUN
      (https://github.com/yasermostafaee/cg/actions/runs/35859184070/job/107175111226) — Designer
      281 passed, Runtime 252 passed, `first-run.spec.ts` (both tests) and `fonts-offline.spec.ts`
      in both apps among them
- [x] 6.5 Both installer artifact URLs (run 35866930187, the smoke-green build; kept 30 days):
      CG Control — https://github.com/yasermostafaee/cg/actions/runs/35866930187/artifacts/10752882224 ·
      CG Designer — https://github.com/yasermostafaee/cg/actions/runs/35866930187/artifacts/10753781790
      (each with `SHA256SUMS.txt`)
