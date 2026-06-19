# Design — import multi-select + prepend (D-067 follow-up)

UI + bridge-seam change; no schema / store-format change.

## The pick→store split

The old `import()` did pick + decode/store in one opaque await, so the renderer couldn't (a) import more
than one file or (b) show a tile only after a real selection. Splitting it puts the renderer in control:

- `pick(kind?) → File[]` — opens a `<input type=file multiple>`; resolves to the chosen files, or `[]`
  on cancel.
- `store(file, kind?) → { asset | image }` — imports one file (the existing `importFile` path; emits the
  store's `imported` event).

These are plain bridge methods passing browser `File` objects in-process (like `url()`), so there's no
`@cg/shared-ipc` channel change.

## Multi-file loop + ordering

```
const files = await pick(kind);           // [] on cancel → nothing happens
if (!files.length) return;
const items = files.map((file) => ({ file, end: begin() }));  // one tile per file, up front
for (const { file, end } of [...items].reverse()) {           // reverse: see below
  try { await store(file, kind); } catch { /* skip */ } finally { end(); }
}
```

- **Per-file independence:** each `store` is wrapped so a rejection clears only that file's tile (the
  loop continues) — one bad file doesn't abort the batch.
- **Selection order at top:** the hooks PREPEND each imported asset (newest on top). Importing in
  REVERSE selection order therefore lands the batch at the top in forward selection order
  (`store(C)`→prepend, `store(B)`→prepend, `store(A)`→prepend ⇒ `[A, B, C, …]`).
- **Tiles up front:** `begin()` is called for all files before storing, so N files immediately show N
  tiles; each clears as its file settles.

## Prepend / newest-first

`useAssets` / `useSharedImages` prepend on the store's `imported` event and reverse the initial
(oldest→newest) index, so the list is newest-first and a fresh import is at the TOP. The D-068 search
maps over the list order, so filtering is unaffected.

## Decisions

- **Sequential (not concurrent) store loop** — gives deterministic selection order via prepend, and the
  loop still satisfies "the others still import" after a failure. Local imports are fast; the slight loss
  of parallelism is immaterial.
- **`pick` is multi-select for every kind** (image/font/shared) — uniform; the caller decides how many.

## Out of scope

- Real per-byte progress; drag-drop multi-file; concurrent-with-strict-order import.
