## 1. CG Bridge: the check judges only CG Bridge's links (`R-090`, `B-318`, `B-317`)

- [x] 1.1 `connection-check.ts`: no `ports` or `topology` line; every line about CG Bridge's machine says so
- [x] 1.2 The VPN/proxy line: an active proxy (a listener), a tunnel up, or a route through one — named, amber;
      red only for a route to the Playout or CasparCG through the tunnel; planted-state tests
- [x] 1.3 `/health`: `port-refused` with the holder when the OSC bind fails (no new problem code)
- [x] 1.4 `dev-station`'s plan stops promising the topology line

## 2. The console: one address, no dead end (`B-317`)

- [x] 2.1 One resolver for the Set up fields; the check on that CG Bridge (its own socket when it is not the
      console's); `CG Bridge is not answering at <host>:<port>.`
- [x] 2.2 The CG Bridge line names where the check ran; `CG Bridge on a separate server: …`; `Use … (last used)`
- [x] 2.3 `Connect` only after CG Bridge answered there; first-run shows the CG Bridge field; no silent override
- [x] 2.4 Sign in locked only by a line that says it cannot work; the advertised loopback rebased onto CG Bridge's
      host; the check asked by CG Bridge's own name for its loopback Playout (the narrowing unchanged)
- [x] 2.5 The console drops an older CG Bridge's `ports`/`topology`; shows `/health`'s `port-refused` naming the
      host

## 3. CG Bridge on this machine (`R-091`)

- [x] 3.1 CG Control's shell: the `CGBridge` service's state and TCP 5280's holder (ours or not), read-only
- [x] 3.2 `Start CG Bridge` (self-elevated, the service started); `Free the port` for a holder of ours only
- [x] 3.3 Set up's three states and two offers (dom tests)

## 4. Fold the passes (`R-092`)

- [x] 4.1 `ConnectionCheckList`: per group, what needs attention in full, passes as `<group> · n OK`
- [x] 4.2 `Show all` / `Show less`, remembered per viewer (`cg.runtime.check-show-all.v1`, in the census)

## 5. The last prose (`R-093`)

- [x] 5.1 The banner: the state, the address, `Takes are refused until it is back.`; the reachability reasons gone
- [x] 5.2 `Loading the layer list…`: the title only
- [x] 5.3 Absences pinned; swept by string and by component

## 6. Verification

- [x] 6.1 Full gate green (pre-push, `0 cached, 99 total`); the Linux `e2e` RAN green on `813123a6`, which carries
      every part of this change: https://github.com/yasermostafaee/cg/actions/runs/37615205789 (job
      112771815709 — Runtime 336 passed, Designer 303 passed, read from the job log). The shell's own
      `cargo test -p cg-control` (23, `local_bridge` among them) RAN green on Windows in the same commit's Desktop
      run: https://github.com/yasermostafaee/cg/actions/runs/37615205779 (job 112771758035)
- [x] 6.2 Before/after pictures: the owner's own `0.11.3` pictures (before) and Chromium on the built `0.11.4`
      console (after), in the release report (`Claude outputs/`, untracked)

## 7. Release `0.11.4`

- [x] 7.1 Version `0.11.4` (`release-version.mjs --set`); `P-031` floor → `0.11.4` (`6957660a`, `813123a6`)
- [x] 7.2 Clean-Windows acceptance on `813123a6`: fresh, and upgrades from `0.10.0`, `0.11.0`, `0.11.1`, `0.11.2` and
      `0.11.3` (the last with CG Control and CG Designer OPEN), each with the Installed-apps row; silent paths and
      exit codes unchanged: https://github.com/yasermostafaee/cg/actions/runs/37615205779 — every acceptance job
      RAN green
- [x] 7.3 The guide `0.11.4` and its pictures (`6957660a`, `59219d96`; `guide.test.ts` 23/23)
- [x] 7.4 `v0.11.4` (annotated `3ec13cf0`) on `126f1f59`, whose PR and Desktop runs were green with every job RAN
      (https://github.com/yasermostafaee/cg/actions/runs/37621342131,
      https://github.com/yasermostafaee/cg/actions/runs/37621342149); the tag's run repeated every job green and
      opened the DRAFT "APASAI CG 0.11.4" (https://github.com/yasermostafaee/cg/actions/runs/37626202694): five
      files, read back, re-downloaded, all four sums OK; CG Bridge's installer 24,763,738 bytes, SHA-256
      `442f2494…e42c560`. `v0.11.3` retitled "APASAI CG 0.11.3 — superseded, do not use", its tag kept, still a
      draft (read back). Not published.
- [x] 7.5 The Playout letter (`Claude outputs/CG-CONTROL-SEND-0114-2026-10-07.md`, with the hash) and
      `CG-BRIDGE-FOR-PLAYOUT-0.11.4.md` beside it (untracked; the owner sends them)
