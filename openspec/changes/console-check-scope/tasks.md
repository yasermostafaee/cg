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

- [ ] 6.1 Full gate green; the Linux `e2e` RAN green on the commit (run URL here)
- [ ] 6.2 Before/after pictures of the check, the banner and the layer list's wait

## 7. Release `0.11.4`

- [ ] 7.1 Version `0.11.4` (`release-version.mjs --set`); `P-031` floor → `0.11.4`
- [ ] 7.2 Clean-Windows acceptance: fresh, and upgrades from `0.10.0`, `0.11.0` … `0.11.3`; the Installed-apps row;
      silent paths and exit codes unchanged
- [ ] 7.3 The guide `0.11.4` and its pictures
- [ ] 7.4 Tag, the draft "APASAI CG 0.11.4" (five files, read back, sums checked); `v0.11.3` retitled
- [ ] 7.5 The Playout letter and `CG-BRIDGE-FOR-PLAYOUT-0.11.4.md`
