# Tasks — ui-polish-01

Lanes: A, B, F FAST (visual only); C, D, E, G FULL (a destructive-action surface; the import path;
the channel set; an IPC schema, a poll constant and the fake Playout).

## A. Channel tabs (fast)

- [x] A.1 `TabStrip` outer level by class (`.cg-tab-strip--outer`, `.cg-tab--outer`); tokens in
      `theme.ts`; the dead inline style objects removed.
- [x] A.2 Arrow / Home / End move focus between tabs; Enter/Space selects.
- [x] A.3 e2e: active vs inactive fill and ink differ, no underline, switching moves it; arrows; a
      screenshot. `ui-polish.spec.ts` A — first green at `200b64fd`:
      https://github.com/yasermostafaee/cg/actions/runs/36277764184 (E2E step ran).

## B. Picker divider (fast)

- [x] B.1 `.cg-tpl-body` fills the modal body.
- [x] B.2 e2e: aside height = layout height, one template and many. Green at `200b64fd`:
      https://github.com/yasermostafaee/cg/actions/runs/36277764184.

## F. Pass green (fast)

- [x] F.1 `checkPass` token; the pass icon only; the comment at `ConnectionCheckList.tsx` and
      `design.md` §29 updated.
- [x] F.2 Test: pass icon = `checkPass` ≠ `onAir`, text unchanged; fail still the error ink.
- [x] F.3 The two greens measured side by side (contrast, hue distance), in the report.

## C. Retire `Manage` (full)

- [x] C.1 A delete icon on each picker row, through the same path, gate, refusal and confirmation.
- [x] C.2 `Manage`, its view, strings and tests removed; each function's new home listed.
- [x] C.3 Tests: delete of an unused template; the in-use refusal; select / double-click never
      delete; `Manage` gone.
- [x] C.4 The pending `runtime-redesign-programme` requirement amended in place. C green at `252a38e8`:
      https://github.com/yasermostafaee/cg/actions/runs/36278636975.

## D. Retire the Import dialog (full)

- [x] D.1 `Import a .vcg` opens the chooser; a good file lands selected; a bad one gives one line.
- [x] D.2 A `.vcg` dropped on the list imports.
- [x] D.3 The Import dialog and its dead code removed; the e2e `importVcg` fixture follows.
- [x] D.4 The RUNTIME-REPAIR-05 "two dialogs" decision recorded as reversed where it lives. D green at
      `59ab6617`: https://github.com/yasermostafaee/cg/actions/runs/36279775279.

## E. Channel checkboxes (full)

- [x] E.1 `ui/Checkbox.tsx`; `ChannelStep` rows with checkboxes.
- [x] E.2 Tests: both surfaces, two checked → `Use these channels`, Space toggles; controls. E's first
      run was RED (https://github.com/yasermostafaee/cg/actions/runs/36280505755 — a test locator, fixed in
      `be36ca34`); green at `b0f53bcb`: https://github.com/yasermostafaee/cg/actions/runs/36282476733.

## G. Output state (full)

- [x] G.1 Bridge: `CATALOGUE_POLL_MS` → 5 s; `output` / `playlist` parsed and published; the
      on-demand read; the fake Playout's states and hooks.
- [x] G.2 `StationChannelsSchema` row: optional `output`, `playlist`.
- [x] G.3 The dot before every channel name; the PROGRAM head; the playlist tag; `unlicensed`.
- [x] G.4 `docs/integration/playout/` — the V13-STATE response copied in.
- [x] G.5 Tests per §2 G.

## Gate and discharge

- [x] Z.1 `pnpm gate` green; `pnpm openspec validate --all --strict`.
- [x] Z.2 Linux `e2e` run URL, job confirmed RAN — every item, at `85017e07`: https://github.com/yasermostafaee/cg/actions/runs/36282970073 (E2E step success).
- [x] Z.3 Installer run URL, jobs confirmed RAN — `85017e07`: https://github.com/yasermostafaee/cg/actions/runs/36282970110 (Installers + Installer smoke, both success).
