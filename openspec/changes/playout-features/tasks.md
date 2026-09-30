# playout-features — tasks

Every item is FULL LANE (the path to air, the wire, IPC schemas, refusal conditions). Order: D, B, C, A, E.

## 0. Establish and record

- [x] 0.1 The three letters adopted into `docs/integration/playout/` (scanned for credentials first), README rows
- [x] 0.2 `design.md` §0: what the guard refused before this change; the reveal's timing; the backup path;
      the B-292 silence check against a tick error
- [ ] 0.3 PRD: `B-298` filed; `R-075`, `R-076`, `R-077`, `B-286` moved to `[~]`; the loopback AMCP limit filed
      under `R-077`; the registry

## 1. D — the CG license (`R-077`)

- [x] 1.1 Fake Playout: `GET /api/cg/license`, D4 `cgLicensed`, presets licensed / `not_included` / cap 1 / `grace`
- [x] 1.2 Bridge: the license reader (60 s, kept when unreachable, `404` not served); D4 `cgLicensed`; both pushed
- [x] 1.3 Bridge: a take refused where CG is not licensed, with the Playout's message; removals pass
- [x] 1.4 B-292's cause: `Cleared by the Playout: its license`
- [x] 1.5 Console: the strip's mark and title; the admin's grace line; the row's refusal line
- [ ] 1.6 Tests (bridge integration, dom) and gate; pushed; CI read

## 2. B — `ownOutputOf` (`B-298`)

- [x] 2.1 Parse and join; the one predicate; picker title; bridge refusal (take, switch, swap)
- [x] 2.1b `B-299` (found on the way): the binding door asks rule 1 and the loop of NEW bindings only
- [ ] 2.2 Tests; gate; pushed; CI read

## 3. C — the playlist output as a box source (`R-075`)

- [x] 3.1 Parse `playlistOf`; the Inputs tab row, its disabled reasons in words
- [x] 3.2 Always `VOLUME 0`: every wire volume, the bridge's refusal of a raise, the ledger's lock
- [x] 3.3 The guard: every targeted verb outside 50–99 unless own; never layer L; no `NEXT`/`BACKGROUND`/`BUFFER`
- [x] 3.4 The reveal: at least two frames of the channel's rate after `PLAY`; pinned
- [x] 3.5 Console: every audio control disabled with the reason; the locked pill
- [ ] 3.6 Fake Playout lists `pl-` rows (layer 7); tests; e2e; gate; pushed; CI read

## 4. A — the backup's own clip (`B-286`)

- [ ] 4.1 D11 `source`/`fingerprint`; the bound clip keeps its fingerprint
- [ ] 4.2 The backup lookup (the backup Playout's D11 `?fingerprint=`), cached, off the take's path
- [ ] 4.3 `RedundancyAdapter`: a per-server line, journaled for B; a plate refused on B sends B nothing
- [ ] 4.4 The row's line; the renderer
- [ ] 4.5 Tests; gate; pushed; CI read

## 5. E — PGM sound and the VU meter (`R-076`)

- [ ] 5.1 Bridge: the ticketed `/pgm/<n>/audio.wav` relay
- [ ] 5.2 Bridge: the meters stream, read once, relayed per console and per channel
- [ ] 5.3 Console: the audio reader (their method); the speaker toggle, remembered
- [ ] 5.4 Console: the meter (8 bars and the scale) and the loudness badge; stale reads −60
- [ ] 5.5 Fakes: the feed's `/audio.wav`; the fake Playout's meters stream
- [ ] 5.6 Tests; e2e with screenshots; gate; pushed; CI read

## 6. Close

- [ ] 6.1 `pnpm openspec validate --all --strict`; the report
      `Claude outputs/REPORT-PLAYOUT-FEATURES-01-v1-<date>.md`
