# Tasks — video plays in the preview and in PVW (B-136 / B-137)

## 1. B-136 — the Runtime page had no `media-src`

- [x] 1.1 **TEST FIRST.** `apps/runtime/tests/e2e/pvw-video.spec.ts`: put a video-bearing retained
      page ON PVW and assert the `<video>` in the rehearsal frame actually decodes
      (`readyState >= HAVE_METADATA`), plus a NEGATIVE assertion that no `securitypolicyviolation`
      naming `media-src` / `default-src` was recorded. An E2E because jsdom does not enforce CSP at
      all — only a real browser can observe this.
- [x] 1.2 **Confirmed RED first, for the diagnosed reason.** Pre-fix the video never left
      `readyState 0`, and Chromium named the mechanism verbatim: _"Loading media from
      'data:video/webm;base64,…' violates the following Content Security Policy directive:
      default-src 'self'. Note that 'media-src' was not explicitly set, so 'default-src' is used as
      a fallback. The action has been blocked."_
      🔴 This is the runtime confirmation B-136 asked the owner to obtain at the machine. The
      mechanism is OBSERVED, not inferred.
- [x] 1.3 `apps/runtime/index.html`: add `media-src 'self' data:`. No other directive touched.
      Deliberately NARROWER than the Designer's (`'self' blob: data:`) — nothing in `apps/runtime`
      creates an object URL, so `blob:` would widen the policy past the need. Reasoned in a comment
      beside the directive so the omission does not read as an oversight.
- [x] 1.4 Re-verified after the fix: the spec passes, and the FINAL spec was re-run against a build
      with the directive removed, to confirm it still fails there. A test that only ever ran green
      after the fix proves nothing.

## 2. B-136 rider — the `.cgproj` availability question (gates [[D-150]]'s archive)

- [x] 2.1 **ANSWERED: YES — a video asset survives a `.cgproj` save → reopen.**
      `apps/designer/tests/project-package-restart.test.ts` gains a VIDEO case against a workspace
      holding NONE of the bytes: it is still LISTED, its `kind` is still `video`, its `assetId` is
      STABLE (so a placed element still resolves), its BYTES read back identical, and its D-128
      `provenance` survives. The existing restart cases covered images and fonts only, which is why
      this gap could sit open.
- [x] 2.2 **[[D-150]] is CLEARED as a cause of B-136.** It changed asset AVAILABILITY, which no diff
      could speak to — this test can. Asserted rather than argued from the code being kind-agnostic:
      "the code looks generic" is not evidence that a format round trip preserves a kind.
- [x] 2.3 The IMG-only unresolved-asset leg is filed as [[B-138]] and NOT fixed here — see that item
      for why: it needs a product decision about what a missing video should SHOW, and its code lives
      inside a generated `<script>` string, so its test is an E2E rather than a unit test. Neither is
      confined to the one branch, which was the stated bar.

## 3. B-137 — the driver commanded an orphan

- [x] 3.1 **TEST FIRST.** `apps/designer/tests/e2e/video-preview-rebuild.spec.ts`: a Preview-MODAL
      E2E — play, post a rebuild with the owner's own gesture (a ticker's `cycle seam` in the modal's
      session timing controls), play again, assert the VISIBLE `video[data-cg-element-id]` is
      `!paused` with an ADVANCING `currentTime`, sampled over a real interval. Existing coverage
      missed exactly this: `video-import.spec.ts:229-259` pins the transplant against the CANVAS
      iframe, which never plays, and asserts node identity and `currentTime` — never `!paused` after
      a rebuild.
- [x] 3.2 **Confirmed RED first.** Pre-fix: plays before the rebuild (advancing), `paused === true`
      after it, on the ATTACHED node, frozen at the identical `currentTime`. This is the first live
      observation of a mechanism that until now was only code-derived.
- [x] 3.3 `runtime.ts`: replace the captured `let media = v.container` binding with a `live()`
      resolver that re-queries by `data-cg-element-id` when `media.isConnected === false`. EVERY
      handle member reads through it — a half-applied resolver would leave the same class of bug on
      the other legs — and `recover()` rebuilds the node that is on screen rather than an orphan.
      Follows `recover()`'s existing re-pointing precedent instead of inventing a second mechanism.
- [x] 3.4 `lottieAssetCache.getForScene(scene)`, posted by `PreviewModal`: the map is scoped to the
      scene's own Lottie ids, so deleting the Lottie makes the rebuild-forcing condition FALSE. The
      CANVAS deliberately still uses `getAll()` — it never plays media, so a stale entry there costs
      a redundant rebuild and cannot freeze anything; the asymmetry is documented at the seam so it
      reads as intentional rather than drift.
- [x] 3.5 `play()` rejections are reported once per element, latched, naming the element. The silence
      is why this was invisible for weeks, so the logging is part of the fix — and it is bounded,
      because the path can be re-entered every tick.
- [x] 3.6 Engine-level unit tests (`packages/template-runtime/tests/video-node-rebind.test.ts`): play
      reaches the ATTACHED replacement and NOT the orphan; a node merely MOVED within the document is
      not re-resolved (the cheap path stays cheap); the rejection logs exactly once. Asserted in the
      ENGINE because the fix is host-agnostic — a test reachable only through the Designer would not
      say that.
- [x] 3.7 `apps/designer/tests/lottie-asset-cache-scope.test.ts`: the scoped map carries only the
      scene's ids, and "delete the Lottie → the rebuild-forcing condition goes false" while the cache
      itself legitimately still holds the parsed asset.
- [x] 3.8 Re-verified: every new pin was re-run against the un-fixed source and FAILS there. The
      "merely moved" case passes both ways by design — it is a control, not a regression pin.

## 4. B-137's OPEN QUESTION — closed with evidence

- [x] 4.1 **DISSOLVED, exactly as code review predicted.** The item could not separate (A) "any
      ANIMATING element breaks it" from (B) "only a timeline/lifecycle DRIVER breaks it", because
      every known-good companion was static and every known-bad one was time-driven.
      **EXPERIMENT 2 now lives in the suite as its own test**: a video ALONE — no ticker, no Lottie,
      no animated companion of any kind — plays, and then freezes when a preview TIMING knob rebuilds
      the scene. The companion was never the variable. **The trigger is what forces a REBUILD**,
      which is the third answer code review proposed; (A) and (B) are both dissolved.
- [x] 4.2 The two hypotheses the filing session refuted — autoplay policy, and a stepped /
      deterministic frame driver — STAY REFUTED. Nothing here re-opens them; recorded in the item so
      they are not re-run.

## 5. Docs

- [x] 5.1 `packages/template-runtime/README.md`: the driver's node-binding contract — what the engine
      guarantees to a host that reparents a media node, and the `data-cg-element-id` + `isConnected`
      rule it keys off.
- [x] 5.2 `docs/prd/bugs-designer.md`: B-136 and B-137 to `[~]`, each carrying its observed evidence;
      [[B-138]] filed with its mechanism.
- [x] 5.3 `docs/prd/b-number-registry.md`: `B-138` minted, verified free before the heading was
      written.

## 6. Gate + landing

- [x] 6.1 Full green gate (`pnpm gate`), uncached — `85 successful, 85 total`, `0 cached, 85 total`,
      prettier clean, `openspec validate --all --strict` 48/48.
- [x] 6.2 **LINUX `gate:e2e` — OWED, and DISCHARGED.** This change alters UI/render behaviour, so a
      green Windows run does not discharge it.
      **Run URL: https://github.com/yasermostafaee/cg/actions/runs/31537842955**
      Checked against every condition the rule names, not merely that a run exists: - `status: completed`, `conclusion: success` — not cancelled, not pending. - `headSha f38124089e1c44775fe54834a4ba75d0a61903e0` — the exact commit carrying this change. - **`E2E (Playwright)` job: `completed / success` — it RAN.** A `skipped` `e2e` (the P-029
      classification case) would NOT have discharged this, which is why the job's own conclusion
      is recorded here and not just the run's. - `Lint • Typecheck • Test • Build`: `success` on `ubuntu-latest`.
- [x] 6.3 Local regression check beyond the gate (the gate does not run E2E): the existing video and
      Lottie suites — `video-import.spec.ts`, `video-export.spec.ts`, `lottie-element.spec.ts` —
      pass 12/12 with the driver change in place, including
      `video-import.spec.ts:207` ("a video element is NOT remounted across transform changes"),
      which is the pin most likely to have been disturbed by re-binding the handle.
