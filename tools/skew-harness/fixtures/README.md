# Fixtures — what is committed here, and what deliberately is not

## The owner's own template is NOT in the repo

`fixtures/owner/` holds the files the owner dropped in on 2026-08-31 so this harness could
reproduce **his** case rather than an approximation of it:

| file             | what it is                                                  |
| ---------------- | ----------------------------------------------------------- |
| `3-ghab.cgproj`  | the Designer project                                        |
| `3-ghab.vcg`     | the export — the package the runtime actually serves        |
| `omumi.mp4_…jpg` | the full-frame image the template carries on its root layer |

They are **gitignored**, on the same footing as `evidence/**`'s recordings, and the decision is
deliberate rather than incidental:

- **They are binary and undiffable.** `geometry.ts`'s own header is written against exactly this:
  _"A hand-drawn `.vcg` would put those numbers in a binary nobody can diff, and the probe
  placement — the whole soundness of `k` — would stop being checkable."_ Committing his export
  would put the discriminating fixture back inside a zip.
- **One of them is a photograph of a person.** 240 KB of someone's picture is not the repo's to
  redistribute, and no measurement needs it.
- **They are re-exportable.** The owner can produce them again from his Designer at any time; a
  copy here would age into a stale duplicate of a file he keeps editing.
- **Nothing in the gate reads them.** Every test and every sweep runs off the committed shape
  below, so a checkout without this folder is complete.

## What IS committed: the SHAPE, at his measurements

The discriminating property is not his pixels — it is that **`look-1` is a single 1920×1080
plate**, so every switch into or out of it opens or closes a FULL-FRAME hole. That shape lives in
`src/geometry.ts` as `GHAB_FIXTURE`, built by the same code path as every other fixture here, with
the rects read out of his `template.json`:

| look                | plates                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `look-1` (`comp-2`) | `l1` at `0, 0, 1920 × 1080`                                                                                  |
| `look-2` (`comp-3`) | `l1` at `23, 301, 916 × 515.27`; `l2` at `984, 301, 916 × 515.27`                                            |
| `look-3` (`comp-4`) | `l1` at `23, 301, 916 × 515.27`; `l2` at `1007.7, 23, 891.7 × 501.6`; `l3` at `1007.7, 558.6, 891.7 × 501.6` |

The harness's fixture takes `look-1` and `look-2` — the pair the owner is asked to switch between
in the visual check — and rounds the box heights to the pixel the mask is expressed in. `look-3`
is not built: it adds a third plate and no new geometry class, and every look here is entered by
the measurement rather than merely present.

Two differences from his file, both deliberate and both stated so a reader is not misled:

- his root backdrop is a full-frame **JPG**; the harness's is a painted rect. The geometry the
  mask is computed from is identical; the page's paint cost is not, and that axis has its own
  control (`--background video`).
- his plates are `contain` with a declared 16:9 aspect and the harness's are `cover`. Under
  `cover` the hole IS the box, which is what lets a probe inside a box be looking at picture
  rather than at letterbox margin (`scene.ts`).

## If you want to run against his actual export

Nothing here does that today. The harness builds its scene in `scene.ts` and serves it through the
bridge's own template server; pointing it at a `.vcg` would need the package unpacked and its
`liveSources` carrier read instead of derived. That is a bigger seam than any measurement so far
has needed, and it would make every run depend on a file the repo does not have.
