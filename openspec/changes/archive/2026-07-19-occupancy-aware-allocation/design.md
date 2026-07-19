# Design — occupancy-aware layer allocation (C-014)

## The crux: which way allocation fails on a blind tap

**Decision: allocation fails OPEN on silence — a layer with no fresh observation remains
allocatable, exactly as today.** This is deliberately the OPPOSITE direction from R-015's
`clearLayer`, which refuses on silence, and the asymmetry is the point:

- **Clearing** is a destructive act aimed at ONE SPECIFIC layer the operator believes is
  occupied. Refusing on silence costs nothing — if the layer is truly empty there is
  nothing to clear, and if it is invisibly occupied the refusal just saved a feed.
- **Allocating** on silence is how the system functions at all. A blind install (B-094:
  AMCP answers, no OSC — a real and common CasparCG configuration) would otherwise be
  unable to allocate ANY layer: OSC loss would become a total playout outage, a strictly
  worse failure than the risk being managed. Before C-014, EVERY allocation was blind;
  failing open on silence makes nothing worse than the status quo, while failing closed
  would break the product's basic degraded mode.
- On a healthy-OSC install, silence genuinely MEANS empty — B-053: real CasparCG goes
  silent for a cleared layer rather than reporting `empty`, so aged-out entries are the
  empty signal. Fail-open is not merely pragmatic there; it is correct.
- The residual risk (a foreign producer on a blind install's in-range layer gets
  adopt-CLEARed) is exactly the pre-C-014 hole, now confined to installs that provide no
  evidence — and B-094's NO OSC indicator is already telling that operator their install
  is flying blind.

The direction is pinned by a test (`disableOsc` mock; allocation and adopt-CLEAR proceed
as today) so it cannot drift silently.

## The dead wiring: what fits, what deliberately does not

`LayerManager` shipped with purpose-built collision machinery (layer-manager.ts:176-211)
that nothing in the bridge ever called — the C-010 family. Its own docstring names this
change's exact case: "Collision detection: if OSC reports a slot occupied that the
allocator thinks is free, raise `collision` and quarantine the slot until the operator
decides to take ownership (CLEAR) or yields."

**Wired up, as designed:** `quarantine()` (a quarantined slot is excluded from
`allocate()`'s scan — that skip has existed, tested by nothing, since Phase 5) and
`deallocate()` as the release path. The bridge drives them from one reconciliation
routine, fed by the same occupancy sample the R-009 sweep already takes, plus a
point-in-time sample at allocation (the sweep's 5 s cadence alone would leave a TOCTOU
window).

**Deliberately left unwired, said plainly:** `observe()`. Its release contract expects an
explicit `producer: 'empty'` observation, but B-053 established that real CasparCG goes
SILENT for a cleared layer — the explicit-empty world it was designed for does not exist
on the wire. And its resolution story ("until the operator decides to take ownership
(CLEAR)") predates R-015, under which a foreign layer is precisely what the operator can
never CLEAR. So the bridge reconciles quarantine from aged-out occupancy instead of
feeding `observe()` synthetic empties, and `observe()` stays dead rather than contorted.
(The `collision` event is likewise not emitted — nothing listens; the honest signal is
the one-line stderr log per newly quarantined layer, the same pattern as the B-093
restore-refusal log.)

## Decisions

**The predicate is R-015's, verbatim: fresh AND `producer !== 'html'`.** Non-html is
provably not ours (this system only places html producers); unrecognised kinds fail safe
as not-ours; html-occupied layers keep today's behaviour — the adopt-CLEAR of a
dead-session html orphan is R-009/B-039's intended semantics, frozen.

**Skip within the range; refuse only when nothing remains.** A foreign producer on the
range's lowest layer must not block the nine layers above it — allocation takes the next
genuinely-free layer. When the scan exhausts the range, the refusal distinguishes WHY:
`OutOfLayersError` now carries how many in-range slots were quarantined, and `load()` acks
`no-layer-foreign-occupied` when any were (else the plain `no-layer`). The code rides both
the item's reconciler ack AND the `stack.load` response (new optional `errorCode`, the
B-070 pattern), so the Library's Load toast can say "occupied by another system's output"
instead of a generic not-accepted.

**Quarantine lifecycle mirrors the orphan set's.** Reconciled only while the primary
session is healthy (frozen otherwise — absence of knowledge is not knowledge of absence);
released when the foreign observation ages out or reports empty; dropped wholesale on
`setConfig` beside `#adopted`/orphans/owned-occupancy (old-server knowledge). Slots the
bridge owns (`#slots`) or that are pinned are never quarantined — a foreign producer on an
OWNED layer is B-056's territory, untouched.

**No extra guard inside `#adoptLayer`.** The reconciliation runs synchronously at the top
of `#allocate`, microseconds before the adopt-CLEAR, on the same tap. A second sample
between them would read the same data; the remaining race (a video appearing on the wire
in that gap) is beneath the OSC sampling resolution that any check could see.

## Test strategy

Wire-asserting integration tests (`occupancy-aware-allocation.integration.test.ts`), CLEARs
recorded via `setHandler`: foreign `ffmpeg` at the range's lowest layer → allocation skips
to the next layer, NO CLEAR ever targets the foreign coordinate, the video stays on air;
html-occupied lowest layer → allocated + adopt-CLEARed exactly as before; hand-emitted
`decklink` → skipped (fail-safe class); blind tap (`disableOsc`) → allocates the lowest
layer with adopt-CLEAR as today (the pinned crux); fully-foreign range → load refuses
`no-layer-foreign-occupied` with ZERO wire traffic for the range; release → the foreign
producer leaves and the layer allocates again. Mock/socket teardown in `afterEach`; green
isolated and under full parallel `pnpm test`.
