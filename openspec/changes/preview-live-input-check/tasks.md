# Tasks — preview-live-input-check (C-023)

## 0. Contract

- [x] 0.1 Supersede the periodic-thumbnail proposal with one live-input check.
- [x] 0.2 Record the read-only findings for 2.12.0, 2.18.1 and 2.18.10, including the old OpenAPI failure.
- [x] 0.3 Record the request to Playout for the wire, ownership, authorization and meter contract.
- [x] 0.4 Adopt the 2.18.12 handoff and record the read-only 2.18.14 and 2.18.15 checks in
      [the integration record](../../../docs/integration/playout/PLAYOUT-CG-RESPONSE-LIVE-PREVIEW-v1.md).
- [x] 0.5 Use the official lease for the one-input MON/PFL workflow and cross-link `add-multibox-audio`.

## 1. Bridge

- [x] 1.1 Define start, status, ticket and stop IPC without upstream identifiers, URLs or credentials.
- [x] 1.2 Validate the exact owner bearer, channel grant, D4 code and current saved D10 input.
- [x] 1.3 Require lease capability v1. Serialize start, recover, renew, replacement and conditional stop.
- [x] 1.4 Relay the authenticated JPEG and optional WAV behind different one-use tickets. Keep PGM independent.
- [x] 1.5 Scope audit and meter to the active channel and owner. Age stale levels to floor.
- [x] 1.6 Exercise the wire through authenticated Bridge routes. Cover unsupported capability, unavailable input,
      wrong channel, air conflict, pending recovery, renewal, ticket isolation, replacement, late close and socket loss.
- [ ] 1.7 Exercise timeout and restart at the station, including a replacement started by the Playout UI.

## 2. CG Control

- [x] 2.1 Add Check input to PVW and Source defaults. The latter preserves the field and the unsaved draft.
- [x] 2.2 Show a decodable picture, honest state, separately labelled meter and opt-in sound. Clear the picture and
      stop sound on a terminal check. Keep audio state local to that check.
- [x] 2.3 Verify both entry points, keyboard/focus return, stale picture and meter, and independent PGM with Playwright.
      `apps/runtime/tests/e2e/live-input-check.spec.ts` passed in local Chrome.
- [x] 2.4 [Linux E2E for `07455d4f`](https://github.com/yasermostafaee/cg/actions/runs/42643491807/job/129250570771)
      completed successfully. 431 Designer, 408 CG Control and 2 Pack Factory tests passed.
      The new live-input check passed on Chromium in the CG Control suite.

## 3. Station acceptance

- [ ] 3.1 On an off-air 2.18.15 channel with a permitted operator, verify physical SDI, NDI and network inputs,
      moving picture, optional sound, preview meter and cleanup.
- [ ] 3.2 Observe PGM and Playlist independently while starting, replacing, failing and stopping preview.
- [ ] 3.3 Exercise two CG consoles and the Playout UI concurrently. Capture replacement, stale close and air priority.
- [ ] 3.4 Measure CPU and network cost with picture only, then with sound. Confirm the renderer accesses Bridge only.
- [x] 3.5 Review the PRD, adopted contract and three deltas. The uncached pre-push gate passed all 103 tasks on
      `07455d4f`. The focused browser rerun also passed all 11 Preview, SourcePicker, rehearsal and PGM tests.

## 4. Station feedback

- [x] 4.1 Reuse the scoped v1 check in Plate inputs, the live-source swap and Station setup → Live sources.
- [x] 4.2 Give the check an empty picture frame while connecting or after losing the picture.
- [x] 4.3 Verify scoped picture, lease cleanup and unchanged source values in all source surfaces.
      The expanded local Chromium live-input-check scenario passed.
- [ ] 4.4 Composite the actual assigned inputs in PVW, including clean Playlist and D11 media.
      Use the 2.18.17 subscription and paired geometry contract. Verify stacking, masks and source lifecycle.
- [ ] 4.5 Replace the per-row Check icon on compatible stations with independently refreshing thumbnails.
      Start on open for visible inputs. Cover correct frame identity, source status, selection, filtering and
      cleanup with at least two distinct sources. Use the 2.18.17 bounded snapshot batch for visible rows.
- [x] 4.6 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42676776212/job/129360266303)
      passed on `40974e03` for the added source surfaces.
- [x] 4.7 Record the 2.18.16 follow-up confirming the same v1 lease, single independent input,
      and the absence of measured geometry, decoded-frame signal status and Playlist master gain.
- [x] 4.8 Reserve a `No signal` thumbnail slot in input lists. The focused Chromium test passed for
      each list, checkable and passive tiles, keyboard activation, and unchanged selection.
- [x] 4.9 Enlarge the Station setup Live sources thumbnail slots and verify their aspect and relative size in Chromium.

## 5. Static media posters

- [x] 5.1 Read the thumbnail by a known D11 item's content fingerprint and return a bounded JPEG.
- [x] 5.2 Show the correct poster for visible Media rows and keep selection available if it is missing.
- [x] 5.3 Chromium verified distinct posters, viewport demand, missing-poster selection and no input check.
- [ ] 5.4 Verify an authenticated Media result with a poster on the target station. The station OpenAPI lists the thumbnail route.
- [x] 5.5 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42701892701/job/129448618037) passed on `88cfa392` for Media posters and live source thumbnail slots.

## 6. Playout 2.18.17 adoption

- [x] 6.1 Verify the [new handoff](../../../docs/integration/playout/source-previews-2.18.17-adoption.md) and station capability boundary.
- [x] 6.2 Implement the authenticated snapshot client and shared picker demand without opening receivers.
- [x] 6.3 Compose independent PVW snapshots inside the authored plate paint order.
- [x] 6.4 Signed Bridge-to-Engine loopback verified distinct live and Playlist frames, channel
      grants, absence handling, exact lease cleanup and no AMCP writes.
- [ ] 6.5 Confirm authenticated PVW and thumbnail pictures on the target station with a compatible Bridge.
- [x] 6.6 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42727985027/job/129538550944)
      passed on `e5474cc1` for composite PVW and source thumbnails.
- [x] 6.7 Chromium verified distinct PVW pictures, foreground and mask pixels, applied source
      changes, removal of a stale image on signal loss, and visible-only thumbnail demand.
