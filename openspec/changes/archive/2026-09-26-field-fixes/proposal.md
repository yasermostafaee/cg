# Field fixes from the owner's run of 2026-09-26 (FIELD-FIXES-01, DELTA A)

## Why

On 2026-09-26 the owner took Bed 59 on the Playout at `.111` with two DeckLink plates on a machine
that has no DeckLink card. The take failed, as expected — but the console said only _"CasparCG
refused the command (AMCP 403)"_ in a banner that named no row and no source, and the Inspector said
`ON AIR NOW` for the look that had just been refused. `FIELD-FIXES-01` §0 replayed the take on the
mock (the installed app keeps no AMCP log) and found two things the owner then decided
(`FIELD-FIXES-01-A`): a refused fresh take left its graphic ADDed on its layer, and a take of a row
already on air rolled back — and so cleared — a plate that was working.

The same run surfaced eleven smaller field faults, listed below with the two decisions.

## What changes

1. **Decision 1 — a fresh take airs everything or nothing.** It stops at the first refused plate,
   never sends the graphic's `CG PLAY`, and takes back exactly what it put there — the plates it
   seated and the graphic it added. A graphic whose own `CG PLAY` is refused after its plates were
   seated is undone the same way.
2. **Decision 2 — a take of a row already on air is refused by the bridge**, with nothing sent, for
   every console. So is a take while the row's previous take is unresolved; a slow reply leaves the
   row `unconfirmed`, never `loaded`.
3. **The Rule — a refused `PLAY` never clears a working picture.** After a refusal, a layer is
   cleared only if the refused operation put a producer on it, and never if one of ours was on it
   before. One helper, called by every clean-up site.
4. **A — one mapping from an AMCP refusal to the operator's words**, tailored by what the command was
   for (a DeckLink input refused with 403 or 404; a file that is not there; a channel; a setting;
   a server failure). "AMCP 403" never reaches an operator surface.
5. **The AMCP log** — the installed app, and the dev station, write every AMCP command, its reply
   line and its time to a size-capped, rotating file in the logs folder. No token is ever written.
6. **B — the refusal lives on the row**: one line, naming the row and the source, on that row's
   ERROR state and in its Inspector, in that channel's view; a strip mark elsewhere; no banner. It
   clears when the row is next taken, or cleared.
7. **C — the Inspector's look badge claims air only when the row's own mark does.**
8. **E — CI actions on Node 24.**
9. **F — HTML5 drag and drop works in both installed apps** (`dragDropEnabled: false`).
10. **G — the name appears once, `APASAI CG CONTROL` / `APASAI CG DESIGNER`, with the Apasai logo.**
11. **H — the dev station's PROGRAM monitor shows the picture, and `localhost` lands on `127.0.0.1`.**
12. **I — a new bank shows five rows per band.**
13. **J — one splash, from the window's first frame to ready.**
14. **K — the silence controls are live only when there is a plate to silence.**
15. **L — the Playout's own layers raise no notice; a foreign item in our bands keeps one, dismissible.**

The look switch's hole — a plate the new look needs refused after the page has moved its holes —
is REPORTED and filed (`B-273`), not changed: what it should do is the owner's decision.

## Capabilities

- `runtime-caspar-bridge` — ADDED: the fresh take's all-or-nothing, the one clean-up rule, the refusal
  carried on its row, the on-air take refusal, the unresolved take, the AMCP log.
- `runtime-ui` — ADDED: the refusal's words and where they appear, the look badge, the silence
  controls, the foreign-layer notice, the new bank's rows, the dev station's PROGRAM monitor.
- `desktop-delivery` — ADDED: drag and drop, the window's name and icon, one splash.
- `platform-ci` — ADDED: the workflow actions run on Node 24.

## Impact

- `@cg/shared-schema`: `TakeRefusalSchema`; `StackItemState.takeRefusal` (published, not retained).
- `@cg/caspar-bridge`: `refusal-cleanup.ts`; `#takeImpl`, `#applyLivePlatesUnguarded`, `#published`.
- `@cg/caspar-client`: the Reconciler's take expiry.
- Runtime console, both Tauri shells, `tools/dev-station`, `.github/workflows/*`.
- Not changed: the success path of a take (pinned byte for byte), `silenceAllLivePlates`'s scope,
  `productName`/`identifier`/installer names and every state folder.
