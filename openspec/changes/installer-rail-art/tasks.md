## 1. The art, per product (`tools/setup-ui`)

- [x] 1.1 `src/rail_art.rs`: the three scenes as data, `rail_art(product)`, one display list; `ui/gfx.rs`
      executes it; the window and the developer preview give `Frame` the product
- [x] 1.2 CG Control unchanged: its list is `0.11.3`'s `splash_scene`, call for call; its nine preview
      pictures (every page, Welcome at 150 % and 200 %) byte-identical before and after
- [x] 1.3 CG Designer: its splash's grid, motion path and keyframes
- [x] 1.4 CG Bridge: its own scene, below its fifth step
- [x] 1.5 Before/after preview diff: Designer's and Bridge's pictures change only inside the art's footprint
      (x 20..211, y 380..459 at 100 %)

## 2. Tests (`cargo test -p cg-setup`, no GPU)

- [x] 2.1 `rail_art::tests` — each product draws its own scene and no shape of CG Control's; CG Control's
      list equals `0.11.3`'s; CG Control's and CG Designer's shapes are exactly their splashes' (read from
      `apps/runtime/index.html` and `apps/designer/index.html`); every ink is one of the splash scene's
      three; every scene clears the last step and Help
- [x] 2.2 Positive controls, each restored: CG Designer dispatched to CG Control's scene reddens two tests; a
      one-unit drift in CG Control's table reddens two; CG Bridge on CG Control's scene reddens the dispatch
      and the clearance tests (`top 390.4`)
- [x] 2.3 72 passed locally (a scratchpad GNU toolchain; CI builds with MSVC)
- [x] 2.4 `Test CG Setup` RAN green in CI on `813123a6` (`cargo test -p cg-setup`: 72 passed, read from the job
      log): https://github.com/yasermostafaee/cg/actions/runs/37615205779 (job 112771758035)

## 3. Pictures

- [x] 3.1 `desktop.yml` `installers`: `Render CG Setup's pages (each rail's art)` → artifact `setup-rail-art`
      (rehearsed locally: 31 pictures; a missing tile fails the step)
- [x] 3.2 The run on `813123a6`: the render step RAN green (`setup-rail-art` uploaded, 31 pictures), and
      `setup-window-windows-2022` / `-2025` RAN green and were read (each Welcome's rail its own art):
      https://github.com/yasermostafaee/cg/actions/runs/37615205779
- [x] 3.3 Every installer's rail before (the owner's picture 2 of `0.11.3`) and after (the three Welcome renders,
      and the guide's pictures 1–3 from the `0.11.4` build), in the release report (`Claude outputs/`, untracked)

## 4. Archive

- [ ] 4.1 On the owner's word: archive, `P-067` → `[x]`
