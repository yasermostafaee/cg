# runtime-caspar-bridge (B-039 — prescriptive playout verbs)

## ADDED Requirements

### Requirement: Playout verbs are chosen from producer state (prescriptive)

The bridge SHALL choose the AMCP playout verb sequence from the **actual per-slot
producer state**, not blindly. It SHALL track, bridge-side, whether a live producer
currently exists on each stack item's slot — independent of the descriptive
`Reconciler` status — and keep that bookkeeping consistent across load / take / out /
remove and across a failover (commands fan out to both servers, so producer
existence is identical on each).

- **load** SHALL issue `CG ADD` only, with the **play-on-load flag OFF** — the
  producer is loaded, NOT playing.
- **take** SHALL issue `CG PLAY`; but WHEN no live producer exists on the slot (e.g.
  a prior out destroyed it) it SHALL FIRST re-issue `CG ADD` (a fresh load), THEN
  `CG PLAY`.
- **out** SHALL exit + `CLEAR` (destroying the producer) and SHALL update the
  producer-existence bookkeeping so a subsequent take re-ADDs. The slot stays
  reserved to the (still-on-stack, idle) item until remove.
- **remove** SHALL fully remove the item (clear + deallocate the layer + drop the
  bookkeeping).

#### Scenario: Load does not auto-play

- **WHEN** the operator loads a template **THEN** the bridge issues `CG ADD` with
  play-on-load OFF and the producer is loaded but NOT playing (nothing on air until
  take)

#### Scenario: Take plays the loaded producer

- **WHEN** a loaded template is taken **THEN** the bridge issues `CG PLAY` and the
  producer plays

#### Scenario: Out destroys the producer

- **WHEN** a playing template is taken out **THEN** the bridge issues `CLEAR`, the
  producer is destroyed, and the bridge records that no producer exists on that slot

#### Scenario: Take after Out re-ADDs then plays

- **WHEN** a template that was taken out is taken again **THEN** the bridge — seeing
  no live producer on the slot — FIRST re-issues `CG ADD` (a fresh load) and THEN
  `CG PLAY`, so the template renders again (it does not `CG PLAY` an empty layer)

#### Scenario: Producer existence drives the choice, not the descriptive status

- **WHEN** the bridge decides between `CG PLAY` and re-ADD-then-`CG PLAY` **THEN** it
  uses its own per-slot producer-existence bookkeeping (not the `Reconciler` status,
  which is descriptive and does not choose verbs)

## MODIFIED Requirements

### Requirement: AMCP command construction sits behind a verifiable seam

The bridge SHALL construct AMCP commands (load / play / update / clear for HTML
producers) behind a small command-construction seam, so the verified sequence is
isolated from the session / queue / reconciler. The sequence is:
`load → CG ADD` **with play-on-load OFF** (loaded, not playing), `take → CG PLAY`
(preceded by a re-issued `CG ADD` when no live producer exists on the slot),
**`update → CG UPDATE`**, `out → CLEAR`. `CG UPDATE` remains the
**hardware-validated** (CasparCG 2.3.2 `4de6d18f`, ADR 0006) way to deliver a
Persian-laden JSON payload to `window.update` intact; the disproven alternatives
(`CALL "update"` never invokes it; `CG INVOKE` delivers an empty param) are not used.
The load/take/out/retake cycle with play-on-load OFF SHALL be re-validated on real
CasparCG before B-039 closes.

#### Scenario: The verified update sequence is applied at the seam

- **WHEN** the bridge updates a playing HTML producer **THEN** it issues the
  hardware-validated `CG UPDATE` via the command-construction seam — established on
  real CasparCG 2.3.2 (ADR 0006) — without changes to `ServerSession` /
  `CommandQueue` / `Reconciler`

#### Scenario: Load is constructed as a non-playing add

- **WHEN** the bridge constructs the load command **THEN** the seam emits
  `CG ADD` with the play-on-load flag OFF, so the producer is loaded without playing
  (the operator's take issues the `CG PLAY`)
