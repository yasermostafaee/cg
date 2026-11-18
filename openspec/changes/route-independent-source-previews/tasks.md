# Tasks

## Implementation

- [x] Add optional frame, audio, listen-lease and poster engine metadata to shared IPC.
- [x] Resolve per-source A/B preview reads using independent channel, D10 and D11 identities.
- [x] Partition snapshot/PVW/audio requests and keep each engine's leases and bearer budget separate.
- [x] Route live listening to the same independently resolved source and engine.
- [x] Fence asynchronous live-check and PVW preparation by the latest exact operator intent.
- [x] Keep unavailable/departed A read eligibility separate from programme seating eligibility.
- [x] Add fingerprint-verified native media and poster fallback without programme commands.
- [x] Preserve legacy no-channel poster responses and channel-granted viewer reads on A/B.
- [x] Preserve availability colors and emphasize only the decoded picture's existing A/B badge border.
- [x] Forward compact inherited/default combo thumbnail provenance to its existing A/B badges,
      matching direct bindings and the source-selection modal after decoding.
- [x] Preserve independent media snapshots despite passive PVW absence and add a bounded,
      identity-checked official file poster fallback with real dimensions, provenance and no crop authority.

## Verification

- [x] Pass all 63 bounded Bridge source/audio/media/presence, channel-fence and delayed-intent tests.
- [x] Pass all 498 shared-IPC tests, including separate preview, binding and seating eligibility.
- [x] Add 7 delayed-preparation regressions for replacement, cancellation, cleanup and passive polling.
- [x] Pass 53 poster/media/HTTP/channel-fence cases, including legacy and scoped viewer reads.
- [x] Keep the exact live/mock method inventory current and prove native media stays unsupported in Test mode.
- [x] Prove B-only input reads with both A and B active, mixed-engine PVW, B-owned listen/audio,
      and media/poster fallback with A missing or offline.
- [x] Pass final Bridge and Runtime typechecks, scoped lint and 59 renderer DOM cases after freeze.
- [x] Pass 2 fresh Windows Edge cases for decoded A/B provenance and native Range media playback,
      including local audio and transport controls. The existing badge border is the only emphasis.
- [x] Keep the non-provider badge border transparent while preserving its size and availability
      color; verify computed borders for no picture, unknown availability and identical-image
      A/B/A handoff in a fresh browser. The previous 38% base border fails this regression.
- [x] Integrate with the release fixes, pass the full local gate and push normally: 103/103
      tasks, Runtime 2760, Designer 2026, Bridge 2286 and 220 strict OpenSpec checks on `261b57c8`.
- [x] Record the carrying commit's actual completed green [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44222510030/job/134528154034)
      on `261b57c8ae1840e96a3d10d6540c3094ad529239`; verify the three native 1.2.11 installers.
- [ ] Verify the updated Bridge/Control previews on the target A/B station.
- [x] Cover empty/absent media PVW, once-only poster reads, moving recovery, known-picture
      precedence, owner/Bridge/channel/source cancellation and fingerprint changes in DOM regressions.
- [x] Verify the fallback and moving recovery with real decoded JPEG pixels in a fresh Windows
      Edge browser: one scoped case passes, with zero programme-write commands. All 22 focused DOM
      cases, Runtime typecheck, scoped lint and the 17-task dependency build pass.

## Linux integration evidence

Source `927412a7` passed all 103 local gate tasks (Runtime 2746, Designer 2026, Bridge
2261), formatting, the control-byte scan and 218 strict OpenSpec checks. Its Linux heavy
gate and Docs check passed, but the actual E2E job failed:
https://github.com/yasermostafaee/cg/actions/runs/44211228849/job/134489928764.
Designer passed 461 with 15 skipped; pack E2E passed 2. Runtime passed 384, failed 3,
skipped 2 and left 98 unrun at its 1260-second global deadline. The failures retained
obsolete unavailable-A preview expectations and coupled PVW to a PGM row selection.
Their repairs preserve read-only, binding, programme and permission guards.

Budget diagnosis excludes all retry cost: 404 successful attempts took 1181.233 seconds,
including 171 seconds of repeated successes. The 384 unique healthy cases took 1010.233
seconds; failed/interrupted attempts took 46.5 seconds. The healthy rate over the current
486 runnable tests plus observed suite overhead projects about 21.85 minutes. Runtime's
global ceiling is therefore 26 minutes, Designer stays at 17, and the outer job becomes
49 minutes, preserving its six-minute setup/build margin. Per-test assertions, retries
and coverage are unchanged. This failed run does not discharge the final Linux E2E debt.

Final carrying source `261b57c8ae1840e96a3d10d6540c3094ad529239` completed its actual
Linux E2E job successfully on 2026-11-18, alongside the heavy gate, Docs and required
checks. Runtime passed 486 with 2 skipped; Designer passed 460 plus 1 flaky case that
passed its configured retry, with 15 skipped; pack E2E passed 2. The flaky Designer
case was B-381 Middle-clock hit-test selection in `loop-range.spec.ts`; it is recorded
rather than described as a first-attempt pass. The actual E2E step ran from 02:23:31Z
to 02:55:05Z. The complete log is retained as `cg-ci-261b57c8-e2e.log` in the local
evidence directory.

The earlier `b27463da` run also failed the same three obsolete contracts before these
repairs: <https://github.com/yasermostafaee/cg/actions/runs/44215001997/job/134507400173>.
Its Runtime result was 384 passed, 3 failed, 2 skipped and 99 unrun at the global
deadline; Designer passed 461 with 15 skipped and pack passed 2. Its failure log is
retained. The superseded `77dcba4a` run was cancelled only after the final carrying run
was safely queued; that cancelled run is not Linux proof.

At the user's request, all three installers were built before Linux completion from
`77dcba4a4c608a7b38e90f880a57cc77df9eba27`, under `installers/1.2.11/77dcba4a`.
They passed version, packaged blob, icon, guide and SHA-256 checks and were copied to
the authorized Share with their manifest verified again. The later carrying commit
changes only the B-443 E2E fixture: all tracked product/configuration/assets are byte
identical to the native source. The unchanged packages therefore carry the verified
product, without a test-only rebuild. Control installation was verified byte-for-byte
apart from Tauri's expected three-byte `UNK` to `NSS` bundle marker. Updated Bridge
installation and Master/Slave preview recovery on the target station remain pending;
neither Linux nor local fixtures establish station clock or output-audio equality.

## Media poster follow-up, 2026-11-18

The previous installation-pending note records the earlier proof cutoff. Both Bridges and
Control from native build `77dcba4a` have since been installed. Actual Master PVW decoded
three 640x360 pictures; native 4K media with decoded audio advanced from B and after the
return to A. This does not establish that every passive preview is available.

An Engine B application log at 04:02:36Z recorded HTTP 403 for `source-previews` using
the signed-in `cg-bridge` service session; subsequent CG polls received no frames. Valid
operator/administrator subjects can receive pictures. That missing upstream capability is
distinct from occasional pending Playlist preview responses, media playback and PGM roles.
The poster follow-up uses the existing authorized file-poster API and changes no permissions.

- [x] Integrate the reviewed Control-only poster implementation from `bc33f0e2`.
- [x] Pass the integrated full local gate and normal push for this poster follow-up on
      `b7d3cf1ba0dfe78a27163ef904a728060479ddf2`: 103/103 tasks, Runtime 2773, Designer 2026,
      Bridge 2286, formatting, 5260-file control-byte scan and 220 strict OpenSpec checks.
- [x] Record this follow-up's actual completed green carrying [Linux E2E job](https://github.com/yasermostafaee/cg/actions/runs/44238425638/job/134580157090)
      on `b7d3cf1ba0dfe78a27163ef904a728060479ddf2`: Runtime 487 passed/2 skipped,
      Designer 461 passed/15 skipped, pack 2 passed and 26/26 E2E tasks successful, with
      no failed or flaky summary. The heavy job, Docs and required checks also completed
      successfully. The full log is retained as `cg-ci-b7d3cf1b-e2e.log`; the earlier
      `261b57c8` result remains evidence for the previous product rather than this follow-up.
- [x] Verify a new immutable three-installer 1.2.11 bundle under `installers/1.2.11/b7d3cf1b`,
      including embedded engines, icons, two-page guide and SHA-256 manifest read-back after
      the authorized Share copy. The Bridge MJS remains exactly
      `4d4b47701ba2958ef876c59ec1ce84cc65a143e3c63382b1b3b8dcc138e4dfc4`, identical to build 77;
      only Control needs reinstall for this poster change after the prior full bundle.
- [x] Verify the poster in installed Control's actual three-plate PVW through A/B/A:
      A and its return decoded three 640x360 native pictures; B decoded two official static
      file posters at 160x90. The 716 poster is visible, while the Mountains official poster
      is near-black (reference gray range 0..3). These are not moving B PVW video claims.
      Evidence is retained in `installers/1.2.11/evidence-b7d3cf1b/installed-acceptance.json`
      and the corresponding Master/Slave PNGs. The closed combo showed a picture with only
      A's existing badge outlined. Playlist PVW and NDI Check on B still had upstream 403/forbidden.

The actual installed native player separately advanced 3840x2160 video and decoded audio
on A, B and return to A. The ready proxy for the tested Persian clip also advanced 640x360
video/audio on all three roles; `ready-proxy-acceptance.json` and `slave-ready-proxy.png`
retain that evidence. This does not establish every media preview: Mountains proxy B ended
with upstream `mediaPreview.proxyTooLarge` at 04:35:57.5417511Z; A also reached terminal
`mediaPreview.preparationTimedOut` at 04:44:21.965291Z, after about 20 minutes.
The final role was A; no exact A/B content-clock equality or full-A-outage acceptance is claimed.
