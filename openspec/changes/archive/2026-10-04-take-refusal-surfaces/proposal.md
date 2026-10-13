# Every take is refused — the surfaces that knew something and did not say it (RUNTIME-FIX-0904)

## Why

On 2026-09-04 the station could not put any graphic to air: fourteen consecutive takes were
refused `amcp-404` while every `import` and `load` before them reported `ok`. The diagnosis
(`B-214`) established from the code that a fixed-row LOAD is list-only and sends nothing, that
the take's `CG ADD` is the first wire contact, and — from the audit record and CasparCG's own
source — that the plant's server had accepted the identical `CG ADD` 118 seconds before the
first refusal, which on build `69e8ad5` can only mean the server process answering at
`192.168.21.114:5250` changed and came up without its html producer.

That diagnosis took a session because six surfaces each knew one fact and withheld it:

- the audit record kept the code and not the **command** it answered, so `amcp-404` could not be
  traced to a verb (`B-209`);
- the audit panel showed **UTC** stamps to the millisecond to a control room at UTC+3:30
  (`B-210`) and **raw UUIDs** where the operator's names were `Bed 1` and `3ghab` (`B-211`);
- the `in-use` refusal said **how many** items held a template and not **where** — the two
  were on dynamic layers no row shows, and the sentence's one concrete remedy was Remove All,
  which the owner reached for (`B-212`);
- the layer table's `State (2)` counted two **refused** rows in the air colour (`B-213`);
- the bridge's boot line named everything but **how many templates** it held (`C-031`).

## What changes

1. **The refused command is recorded beside its code** — `AuditEntry.command`, the AMCP line
   with its payload elided, written by the one `#send` chokepoint and carried out through every
   verb's refusal. The panel shows it.
2. **The audit panel is read in the operator's terms** — local time to the second with the date
   as a band where it changes and the UTC stamp on hover; the row's and the template's NAMES
   first, through the same naming rules the Layers table and the picker use; the ids beneath,
   shortened for display, complete in the title, and copyable. The ids are never deleted, and
   the console-name caveat is untouched.
3. **The `in-use` refusal names each place** — `templates.remove` carries `references` (item
   id and layer), the sentence names a row as the table does or a layer as CasparCG does and
   says when it is not a row, and the picker offers the way there: "Show <row>" scrolls to and
   selects the row; an item on no row gets a confirm-gated removal of that one item. Remove All
   is not mentioned. The bridge, the mock and the offline library path share one spelling.
4. **The tally says what it counts** — `(2 on air)` in the air colour from the on-air-or-unsettled
   predicate, and `(2 in error)` in the error colour, never one number. STOP ALL keeps its own
   predicate; the Server settings gate now reads the same on-air predicate the tally does.
5. **The boot line says how many templates loaded and how many files were skipped.**

## Capabilities

- `runtime-ui` — ADDED: the audit log is read in the operator's terms; the in-use refusal
  names where and offers the way there; the layer table's tally says what it counts.
- `runtime-caspar-bridge` — ADDED: a refused command is recorded beside its code; the boot
  line names the template count.

## Impact

- `@cg/shared-schema`: `AuditEntrySchema.command` (optional). Older records read unchanged.
- `@cg/shared-ipc`: `TemplateReferenceSchema`, `templates.remove` → `references?`,
  `describeTemplateReferences` / `describeReferencePlace` / `referenceRowName`.
- `@cg/caspar-bridge`: `#send` carries the refused line; `templateRemove` carries references;
  `templateProvenance` on the runtime and `templates` on the handle; the CLI's boot line.
- Runtime: `AuditPanel` + `auditFormat.ts`; `useTemplatePicker` + `rowFocus.ts` + the panel's
  focus effect; `LayerTableHeader` tally + `stack/onAir.ts`'s `airTally` / `isOnAirOrUnsettled`;
  `MockRuntime` parity (references, audit slots); `LibraryStore` / `WebSocketRuntime` offline path.
- Not touched, by the prompt's boundary: the refusal path, the mixer, bank fencing, the plant.
  The incident's root cause (`B-214`) and the dynamic-layer restore (`B-215`) are FILED, not
  fixed.
