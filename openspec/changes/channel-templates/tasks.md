# channel-templates — tasks (`R-074`, `CHANNEL-TEMPLATES-01`)

## 0. Establish

- [x] 0.1 How templates are stored, served and referenced; every list/import/re-import/delete path and
      where each checks role and channel; what re-import did to rows, pages and Source defaults; the
      in-use gate; station-wide assumptions (`design.md` §0).

## 1. Schema (`@cg/shared-ipc`)

- [x] 1.1 `templates.get` / `list` / `import` / `remove` gain an optional top-level `channel`;
      `templates.changed` keeps its payload (the station-wide reading).

## 2. Bridge

- [x] 2.1 `TemplateRegistry`: versions keyed by content (`templateVersionId`), per-channel lists, holds
      (persisted in `template-channels.json`), pins (in memory), collection when nothing keeps a
      version, serve keys (bare while free, `<id>~<version>` beside a second version), the one-time
      copy (`migrate`).
- [x] 2.2 `CasparRuntime`: every template read resolves through the row's channel; `#sendAdd` serves the
      channel's version, pins it in flight and holds it once landed; import/re-import/remove per channel
      (channel-less = station-wide); re-delivery per channel (channel-less = restore only); tombstones per
      channel; the copy at boot and at the first declaration.
- [x] 2.3 `bridge.ts`: routes pass the channel; `channelsForRequest` — reads exempt from the grant, a
      channel-less import/remove judged on its footprint; the lock's re-delivery check asks the named
      channel.
- [x] 2.4 Tests: `template-registry.test.ts` (rewritten to the per-channel contract), `-siblings`,
      `template-http-server.test.ts` (a held version keeps its path beside the new one),
      `channel-templates.integration.test.ts` (§2 of the prompt: the CH 2 operator + fence control, one
      stored file, delete, on-air byte-for-byte, migration), census updated
      (`station-channel-fence`), `lock-scope` / `template-persistence` re-delivery cases name their
      channel (+ the channel-less no-replace control), `fixed-layers-load` precedence kept.

## 3. Console

- [x] 3.1 Bridge contract, `WebSocketRuntime` (channel pass-through; re-delivery names each record's
      channel and skips channels the principal does not hold), `LibraryStore` (per-channel records beside
      the pre-change ones), `MockRuntime` + its adapter (per-channel lists, lazy one-time copy).
- [x] 3.2 The picker: its row's channel's list, import and removal; `Remove <name> from CH n`; the confirm
      names the channel; usage counts that channel's rows; `Nothing on CH n yet`.
- [x] 3.3 `useTemplateIndex` per (channel, template) and its readers (rows, Inspector, PVW incl.
      `templates.html(id, channel)`, operator names, orphan banner); `boundChannelOf`.
- [x] 3.4 Source defaults: no template action writes them (`noteAssignmentsCarriedOver`; the removal's
      `forgetTemplateAssignments` is gone); the carried-over notice per channel.
- [x] 3.5 Tests: `templateImportAssignments`, `templatePicker.rowDelete`, `templateRemoval`,
      `templatePicker.dom`/`.library`, `channelSwitch` + `mockSlotParity` fixtures, `fixedSlotLoad`
      (import names the channel), `LibraryStore` (per channel), `reconnect-redelivery` (each record to its
      own channel).
- [x] 3.6 E2E: `channel-templates.spec.ts` (new — each channel's own list, CH 2 starts empty, import /
      re-import / remove on CH 2 leave CH 1); the wording sweep (golden rule 9, two passes) re-pointed
      `live-source-sources`, `modal-frame-chrome`, `picker-chrome`, `ui-polish`, and `source-defaults`
      imports on a channel declared later.
- [x] 3.7 Found after `9a457684`: `LibraryStore.delete(id, channel)` deleted the pre-change record, so a
      removal on CH 2 took the template off CH 1's offline list and CH 1's PVW page in the same browser.
      The record is now hidden on the removing channel only (`removedOn`, persisted) and no longer
      re-delivered; a channel-less removal still deletes it. Test: `LibraryStore` — red on `9a457684`
      (`expected [] to deeply equal [ { templateId: 'lower-third', … } ]`), green with the fix, plus the
      channel-less control.

## 4. Docs

- [x] 4.1 `docs/prd/runtime.md` — `R-074`.
- [x] 4.2 Spec deltas (`runtime-template-library`, `runtime-caspar-bridge`); `operator-surface`'s pending
      removal delta amended in place (header collision).

## 5. Gate and CI

- [ ] 5.1 `pnpm gate` green.
- [ ] 5.2 Pushed to `dev`; `ls-remote` matches.
- [ ] 5.3 CI `ci` + `e2e` COMPLETED and GREEN on the pushed commit, both jobs RAN — run URL:
- [ ] 5.4 Installer workflow COMPLETED and GREEN, the job RAN — run URL:
