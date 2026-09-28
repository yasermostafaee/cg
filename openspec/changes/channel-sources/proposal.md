# channel-sources — each channel keeps its own Source defaults; a no-band take refusal is a row line (`R-072`)

Prompt: `CHANNEL-SOURCES-01` (v1), 2026-09-28.

## Why

The owner's check on `pnpm dev:station --fake` (2026-09-28):

1. A take of `Bed 59` was refused three times with a banner across the top of the console: _"this template has
   2 live plate(s), but no Live Source layer band is declared on this installation — there is nowhere to put a
   producer. …"_
2. Changing Source defaults on channel 2 also changed them on channel 1.

The owner decided (2026-09-28):

1. No hand-declared band before a take — the effective band is the declared one, or else the layer map's
   plate band, 60–79.
2. Source defaults belong to a channel. Nothing on air changes: on first load, today's station-wide defaults
   become every declared channel's own copy. A channel added later starts from a copy of the template's current
   defaults.
3. If a take can still be refused for having no band, the refusal is `FIELD-FIXES-01`'s row line — on its row, in
   that channel's view only — never a console-wide banner.

## What changes

- **Decision 2 — built.** A Source default carries its channel. The store is keyed (channel, template, plate);
  every reader asks `assignmentsOnChannel` — the take, the look switch, the swap, the restore, the Inspector's
  `Default (…)`, the Source defaults dialog, PVW. The bridge copies the station-wide defaults to every declared
  channel on the first load of its file and rewrites the file; a second load copies nothing. A channel declared
  later (`fixedLayers.set-banks` / `set-config`, first-run or Station setup → Change channel…) starts from a copy
  of the template's defaults on the lowest channel that holds them. The dialog edits the channel of the row it
  was opened from, and its title names it: `Source defaults · CH n`.
- **Decision 3 — built.** A take refused for having no band is recorded on its row (`takeRefusal`, code
  `live-source-no-layer-range`) and answered `refusalOnRow`, so the console says one line on the row and in its
  Inspector — `<row>: no live source layer band is declared — nothing was sent.` — and raises no banner.

## What does NOT change, and why

- **Decision 1 — STOPPED**, per the prompt's own hard stop: the design record says the band must be declared, and
  gives a reason. `packages/shared-ipc/src/channels/sources.ts:426`: _"DECLARED, never defaulted …
  applying it automatically would be this project choosing layer numbers for a plant it cannot see, and a
  station whose reservation already sits inside the band would then fail to boot on upgrade."_ The same decision
  is recorded in `openspec/changes/live-source-multibox/tasks.md` note 4 (line 935) and `design.md:237`, and was
  re-affirmed by the 2026-09-14 re-band (`sources.ts:446`, _"offered in the editor and never applied on its
  own"_). The owner decides; until then a station with no band still refuses a take — now as one row line.
- The wire of a take, its order, `LOOK-SWITCH-01`'s pre-seat and `FIELD-FIXES-01-A` are unchanged. Our layers
  stay 50–99.
- Whether the Playout assigns inputs to channels is not in this change (asked separately).

## Impact

- `@cg/shared-ipc` `channels/sources.ts` — `TemplateSourceAssignmentSchema.channel` (optional; an entry without it
  is station-wide and answers only where a channel has no entry of its own), `assignmentsOnChannel`,
  `migrateAssignmentsToChannels`, `copyAssignmentsToChannel`, `withChannelDefaults`; `assignedSourceId`,
  `unassignedPlateIds`, `assignmentInForce` and `PlateSourceResolution` take the channel. A persisted file's shape
  changes (an added optional field) and is rewritten once.
- `tools/caspar-bridge` — `caspar-runtime.ts` (readers by channel, the copy on a joining channel, the no-band
  refusal on the row), `bridge.ts` (the first-load copy, persisted; the copy persisted after `set-banks` /
  `set-config`), `live-look-bindings.ts`.
- `apps/runtime` — the Inspector, Look inputs, Source defaults dialog and link, the swap dialog, the template
  picker's `Needs a source`, the Layers table, PVW, `applyDraft`, the offline mock (parity), `takeRefusalLine`.
