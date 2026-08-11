# Design — the project package

## The package

```
<name>.cgproj                      a deterministic zip (writeZip / readZip, @cg/vcg-format)
├── manifest.json                  ProjectPackageManifest — format: 'cgproj'
├── project.json                   the FULL authoring Scene (editorBackdrop INCLUDED)
└── assets/<kind>/<sha256><.ext>   the bytes, one file per asset
```

The in-package asset path is the SAME layout the workspace already uses
(`AssetStore.#bytesPath`) minus its `projects/<projectId>/` prefix. That is deliberate: the
prefix is what made an asset's location depend on a mutable storage root, and it is exactly the
part the package drops.

## Reads: one entry point, one result type

```ts
readProjectDocument(bytes): ProjectDocument
```

```ts
type ProjectDocument = {
  scene: Scene;
  assets: Map<string, Uint8Array>; // in-package path -> bytes ('' for legacy)
  index: ProjectAssetEntry[];
  form: 'package' | 'legacy-json'; // what was actually read
};
```

**Discrimination is by BYTES, not by a schema field**, because the two forms are not both JSON:
a package starts with the zip local-file header `50 4B 03 04`. Anything else is decoded as UTF-8
and parsed as a scene.

This is the document-level analogue of the `z.preprocess` normalizations already in
`SceneSchema` / `PlayoutSchema`, and it is the same reasoning:

> It runs on EVERY load path, because every load path goes through it.

🔴 It is NOT `migrations.migrate()`. That registry has zero production call sites ([[P-031]]);
`schemaVersion` is written by two places and read back only as `z.literal(1)`, so a document
with any other version fails to parse rather than entering a conversion. A migration registered
there is a conversion that never runs, and would have made B-104 worse: old projects would break
quietly at exactly the moment the registry appeared to save them.

## What happens to a legacy project's bytes — stated, because "safe" is not a feeling

| thing                                          | what happens                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| the `.cg.json` file itself                     | **never opened for write, never deleted.** Read once, in memory. |
| `projects/<id>/assets/**` in the workspace     | **read only.** Bytes are COPIED into the package; nothing moved. |
| `projects/<id>/assets/index.json`              | read only.                                                       |
| the first Save after a conversion              | routes through **Save As** with a `.cgproj` suggested name       |
| an older build opening the original afterwards | works — the file is byte-identical to before                     |

The recovery story an author can actually use: _the old file is still there._ Nothing about
this change can leave them with less than they started with.

Legacy asset adoption is **best-effort by design**. If the workspace no longer holds the bytes
(the B-104 case in its worst form — permission lost, OPFS never held them), the project still
opens with its scene intact and the missing assets are reported rather than silently dropped.
That is strictly better than today, where the same case is silent.

## `initWorkspace()` — the two bare catches become named facts

```ts
type WorkspaceRootKind = 'directory' | 'opfs' | 'memory';
type WorkspaceRootReason =
  | 'connected-folder' //  the author's folder reopened
  | 'opfs' //              the normal sandboxed default
  | 'folder-permission-lost' // remembered folder, permission gone -> DEGRADED
  | 'folder-restore-failed' //  remembered folder, restore threw   -> DEGRADED
  | 'opfs-unavailable' //       no sandboxed store                 -> SESSION-ONLY
  | 'forced-memory' //          ?storage=memory diagnostic         -> SESSION-ONLY
  | 'e2e'; //                   the test harness (not a degradation)
```

`initWorkspace()` returns `{ workspace, root: { kind, label, reason, detail? } }`. Nothing is
swallowed: a throw during folder restore becomes `folder-restore-failed` WITH its message, and a
`null` return becomes `folder-permission-lost` — two different conditions with two different
remedies, which the current single `catch` cannot tell apart.

**Why the reconnect action must live in the UI and not in `initWorkspace()`**: Chromium requires
a user gesture for `requestPermission()`. Boot has no gesture. That is the root cause of B-104's
storage-root leg, so the fix is not to retry harder at boot — it is to surface the state and let
the author's click supply the gesture. `connectDirectory()` already exists for exactly that and
is already gesture-driven.

### `?storage=memory`

A diagnostic override, kept deliberately separate from `CG_E2E` (which stays a non-URL flag).
It is defensible ONLY because of what this change adds alongside it: session-only storage is now
loudly visible, so a URL that engages it cannot produce a silent state. It exists so the
in-memory leg can be exercised by hand — it is the only one with no natural trigger on a healthy
machine.

## Save tiers — the mechanism degrades, the document does not

`handle -> sandboxed path-model -> download`, unchanged in ORDER. What changes is that all three
write the same `.cgproj` bytes. The previous tiering let the fallback tiers write a form that
omitted assets; that is now impossible because there is only one writer.

## Rejected alternatives

- **Make the project literally a `.vcg`.** Rejected: `pack()` strips `editorBackdrop` (B-129) —
  saving through it deletes the author's backdrop every save. It also demands the runtime bundle
  and a broadcast manifest with an integrity root. See the proposal's third section.
- **Keep `.cg.json` and repair the workspace linkage.** Rejected: it cannot fix the field
  report. A JSON file handed to another machine has no assets to lose track of — it never had
  any.
- **An incremental working layer behind `@cg/storage` flushing to the package.** Rejected on
  measurement (45 ms saved on a heavy project) and on principle: it reintroduces two places that
  must agree, which is what B-104 is.
