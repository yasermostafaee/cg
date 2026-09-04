# Tasks — the surfaces that would not say (RUNTIME-FIX-0904)

## 0. Premises (session `RUNTIME-FIX-0904`, 2026-09-04, tip `24e13a01`)

- [x] 0.1 Tip `24e13a01` == `origin/dev` (expected by the brief); `pnpm install` up to date.
- [x] 0.2 The plant was NOT connected to. Every measurement below is a read of this host —
      which is the bridge host, `192.168.21.93` — or of CasparCG's source.

## 1. The one question — does LOAD reach the wire? (diagnosis, no code)

- [x] 1.1 Traced: `fixedSlotLoad.ts:36` → `loadFixed` → `#loadOnto(listOnly = true)` →
      `reachable = false` → no adopt-`CLEAR`, no `CG ADD`, return `{ accepted: true }`. LOAD is
      bridge-local. `stack.load` (the pre-rolling dynamic path) has no renderer caller.
- [x] 1.2 Traced the take: refusals that touch nothing → `#sendAdd` (`MIXER … VOLUME 0`, then
      `CG … ADD 0 "<url>?cw=…&ch=…" 0 "<data>"`) → `MIXER … VOLUME 1` → plate seating (plate rows
      only) → `CG … PLAY 0`. `MIXER` never 404s, so `amcp-404` on a take is the ADD.
- [x] 1.3 🔴 The prediction ("load sends CG ADD") FAILED. The dialog sentence describes the
      take-time ADD, correctly; the inference about WHEN was the error. No product text
      corrected; the stale "pre-roll it" comment in `fixedSlotLoad.ts` fixed.
- [x] 1.4 The exchange is printed nowhere — the bridge has no wire trace and the record kept only
      the code. Filed and closed as `B-209` (§3).

## 2. What makes `.114` answer 404 (diagnosis; the measurement handed off)

- [x] 2.1 The real audit record (this host): same template, same layer, same bridge process —
      `take … ok` at `11:35:34Z` (ADD + PLAY accepted), first `amcp-404` at `11:37:32Z`, then
      thirteen more. No bridge restart between; no `set-config` today.
- [x] 2.2 CasparCG `69e8ad5` read: a URL `CG ADD` returns 404 only when no html cg producer is
      registered in the server process. Reachability yields `202` + no graphic — the dialog's
      claim stands; not the cause.
- [x] 2.3 ⇒ the server process answering at `192.168.21.114:5250` changed between `11:36:44Z` and
      `11:37:32Z` and the one answering now has no html producer. Filed as `B-214` with the
      one-line log search for the playout machine (window named).
- [x] 2.4 This side verified: all three templates `200` on the live ephemeral port `64373`;
      node.exe allowed inbound on the domain profile.

## 3. `B-209` — the refused command is recorded beside its code

- [x] 3.1 `AuditEntrySchema.command` (max 256, optional).
- [x] 3.2 `summarizeWireLine` in `command-builder.ts`; `#send` returns `command` on a non-ok
      answer and on a throw; carried out through `#sendAdd`, `#takeImpl` (ADD and PLAY),
      `#updateImpl`, `#stopItemImpl`, `#nextItemImpl`, `#outImpl`; `auditVerdict` copies it.
- [x] 3.3 🔴 Red first, measured: `audit-command.integration.test.ts` 1/3 red on the current
      tree (`expected undefined to be defined` on `take.command`), the two absence cases green
      by construction; 3/3 green after. `wire-line-summary.test.ts` 6/6.
- [x] 3.4 The panel shows the command under the ids (`data-audit-command`).

## 4. `B-210` / `B-211` — the audit panel is read in the operator's terms

- [x] 4.1 `auditFormat.ts`: `auditTimeParts` (Intl, browser zone; `12:18:47.561Z` → `15:48:47`
      in `Asia/Tehran`), `shortId`, `placeName` (the table's two naming functions; "not a row"
      outside the bank), `templateName` (through `templateDisplayName`).
- [x] 4.2 `AuditPanel`: local time to the second, the date as a band where it changes, names
      first, ids beneath — shortened, full in the title, copy button (local confirm, not the
      toast). The console-name caveat byte-identical (pinned).
- [x] 4.3 `MockRuntime` audit entries carry the slot (parity), so the offline log names rows.
- [x] 4.4 Tests: `auditFormat.test.ts` 13/13, `auditPanel.legibility.dom.test.ts` 11/11,
      `auditPanel.emptyStates.dom.test.ts` 8/8 (stub widened).

## 5. `B-212` — the in-use refusal names where, and offers the way there

- [x] 5.1 `@cg/shared-ipc`: `TemplateReferenceSchema`, `templates.remove` → `references?`,
      `describeTemplateReferences` / `describeReferencePlace` / `referenceRowName` — ONE wording
      for the bridge, the mock and the offline library path; Remove All not mentioned.
- [x] 5.2 Bridge `templateRemove`, `MockRuntime.templateRemove`, `LibraryStore.remove(id,
references, bank)`, `WebSocketRuntime.#references`.
- [x] 5.3 Picker: a line per reference — "Show <row>" (closes, `requestRowFocus`) or a
      confirm-gated "Remove item" (`stack.remove` for that one id). `rowFocus.ts` +
      `LayersPanel` effect (scroll, focus, select).
- [x] 5.4 ⚠ Why the two items were invisible: refused `wrong-bank` loads left slotless `error`
      items, retained, restored by `#slotForRestore` → `#allocate()` onto the `custom` range
      60–69. Filed as `B-215`, NOT fixed (restore is outside the boundary).
- [x] 5.5 Tests: `template-references.test.ts` 7/7, `template-remove-references.test.ts` 5/5,
      `templateRemoval.dom.test.ts` 10/10, `LibraryStore.test.ts` 7/7, `reconnect-redelivery`
      4/4, `runtime-channels` 35/35.

## 6. `B-213` — the tally says what it counts

- [x] 6.1 Derivation established: `items.filter(isOnAir)` — STOP ALL's predicate, which counts
      `error`; the status itself is ack-derived and OSC-refined, not raw intent. The defect is
      the `error` inclusion under the air colour, not an intent-derived count.
- [x] 6.2 `stack/onAir.ts`: `isOnAirOrUnsettled` (the one renderer spelling; the Server settings
      gate delegates), `airTally`. `LayerTableHeader` renders `(N on air)` and `(N in error)`
      separately; STOP ALL keeps `isOnAir`.
- [x] 6.3 Tests: `onAir.test.ts` 6/6, `layerTableHeader.dom.test.ts` 8/8,
      `layersPanel.unreachableLabels` 4/4 (expectation updated to `(1 on air)`),
      `serverSettingsPanel.dom.test.ts` 15/15.

- [x] 6.4 Owner decision mid-session (2026-09-04): _"use rgb(255 28 28) for errors on dark
      backgrounds"_. `colors.errorText` added to the runtime theme; the tally's `(N in error)`, the
      row's ERROR mark, the status bar's hard failure, the link indicator, the lock overlay's
      refusal, the Inspector's file error and the audit log's `failed` outcome read through it.
      `colors.error` stays the BACKGROUND red for the banners and the toast.

## 7. `C-031` — the boot line names the template count

- [x] 7.1 `CasparRuntime.templateProvenance`, `BridgeHandle.templates`, the CLI's
      `templates: N loaded from <dir> - M skipped …` line beside its siblings.
- [x] 7.2 `templates-boot.integration.test.ts` 3/3 (two records + one unusable file; absent
      directory; embedder).

## 8. Reported, not changed

- [x] 8.1 `C-032` — the ephemeral serve-port default: recommendation recorded (pin by default),
      default unchanged this session.
- [x] 8.2 `medi2` — a NAME on catalog entry `src-du5scb`; assignments, look bindings and frozen
      maps key on the id, so the rename is safe from the Sources dialog and is the owner's.
- [x] 8.3 Not in scope, not implied covered: `UPDATE-INFORCE-02`, `DESIGNER-FIX-0902`, the mixer
      `DEFER` exposure, `B-192` term (b), the `<device>` addressing decision.

## 9. Docs and filing

- [x] 9.1 `docs/prd/bugs-runtime.md` — `B-209` … `B-215`; `docs/prd/caspar.md` — `C-031`,
      `C-032`; `docs/prd/b-number-registry.md` — the session entry, numbers derived from
      headings (highest `B-208`, `C-030`), pointer agrees.

## 10. Gate and evidence

- [ ] 10.1 `pnpm gate` green uncached.
- [ ] 10.2 Linux `gate:e2e` — owed (UI changed). Record the run URL, the `E2E (Playwright)`
      job's conclusion and duration, and that it RAN, here.
