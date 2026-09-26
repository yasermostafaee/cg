# Tasks — ui-polish-01

Lanes: A, B, F FAST (visual only); C, D, E, G FULL (a destructive-action surface; the import path;
the channel set; an IPC schema, a poll constant and the fake Playout).

## A. Channel tabs (fast)

- [ ] A.1 `TabStrip` outer level by class (`.cg-tab-strip--outer`, `.cg-tab--outer`); tokens in
      `theme.ts`; the dead inline style objects removed.
- [ ] A.2 Arrow / Home / End move focus between tabs; Enter/Space selects.
- [ ] A.3 e2e: active vs inactive fill and ink differ, no underline, switching moves it; arrows; a
      screenshot.

## B. Picker divider (fast)

- [ ] B.1 `.cg-tpl-body` fills the modal body.
- [ ] B.2 e2e: aside height = layout height, one template and many.

## F. Pass green (fast)

- [ ] F.1 `checkPass` token; the pass icon only; the comment at `ConnectionCheckList.tsx` and
      `design.md` §29 updated.
- [ ] F.2 Test: pass icon = `checkPass` ≠ `onAir`, text unchanged; fail still the error ink.
- [ ] F.3 The two greens measured side by side (contrast, hue distance), in the report.

## C. Retire `Manage` (full)

- [ ] C.1 A delete icon on each picker row, through the same path, gate, refusal and confirmation.
- [ ] C.2 `Manage`, its view, strings and tests removed; each function's new home listed.
- [ ] C.3 Tests: delete of an unused template; the in-use refusal; select / double-click never
      delete; `Manage` gone.
- [ ] C.4 The pending `runtime-redesign-programme` requirement amended in place.

## D. Retire the Import dialog (full)

- [ ] D.1 `Import a .vcg` opens the chooser; a good file lands selected; a bad one gives one line.
- [ ] D.2 A `.vcg` dropped on the list imports.
- [ ] D.3 The Import dialog and its dead code removed; the e2e `importVcg` fixture follows.
- [ ] D.4 The RUNTIME-REPAIR-05 "two dialogs" decision recorded as reversed where it lives.

## E. Channel checkboxes (full)

- [ ] E.1 `ui/Checkbox.tsx`; `ChannelStep` rows with checkboxes.
- [ ] E.2 Tests: both surfaces, two checked → `Use these channels`, Space toggles; controls.

## G. Output state (full)

- [ ] G.1 Bridge: `CATALOGUE_POLL_MS` → 5 s; `output` / `playlist` parsed and published; the
      on-demand read; the fake Playout's states and hooks.
- [ ] G.2 `StationChannelsSchema` row: optional `output`, `playlist`.
- [ ] G.3 The dot before every channel name; the PROGRAM head; the playlist tag; `unlicensed`.
- [ ] G.4 `docs/integration/playout/` — the V13-STATE response copied in.
- [ ] G.5 Tests per §2 G.

## Gate and discharge

- [ ] Z.1 `pnpm gate` green; `pnpm openspec validate --all --strict`.
- [ ] Z.2 Linux `e2e` run URL, job confirmed RAN.
- [ ] Z.3 Installer run URL, jobs confirmed RAN.
