# Design — shared font library (D-126)

## Decisions

### One Shared Library surface, separate typed stores

The owner chose one Shared Library panel. Its add menu offers **Image** and **Font**, and the panel can
filter/view both kinds. Storage remains typed and separate (`shared/images` and `shared/fonts`) so an
asset of one kind cannot be resolved through the other kind's API.

Shared fonts reuse `AssetMeta` and the existing `asset-<assetId>` family convention. No second font
encoding or font-reference schema is introduced.

### Two-source resolution everywhere

Project fonts remain in the per-project `AssetStore`. Shared fonts live in a project-independent
`SharedFontStore`. For an `asset-<assetId>` family, every consumer resolves project first and shared
second (ids are globally generated, so a collision is not expected; project-first preserves existing
documents). The same resolver rule applies to:

1. the editor document's `FontFaceSet`;
2. the Canvas and Preview iframe asset URL map;
3. `.vcg` preflight and font packaging;
4. single-file HTML font inlining.

### Scene references, not copied bytes

Selecting a shared font adds the normal scene-level font reference. It does not copy the bytes into the
project asset store. Each export reads the shared bytes and packages its own self-contained copy.

### Removal

Removing a shared font removes only the library index entry and revokes its current blob URL. Already
exported files remain valid. An open scene that still references the family falls back and export
preflight reports the unresolved font through the existing warning path.

## Risks and controls

- **Preview works but export fails:** tests cover Canvas/Preview URL merge plus both exporters.
- **Wrong kind accepted:** picker validation and store tests reject non-font selections before write.
- **Shared font disappears on project switch:** the shared store and its URL cache are never cleared by
  `assets.onCleared`.
- **Content-driven crawl measures fallback glyphs:** Preview loads the `FontFace` before runtime play;
  exports package the bytes and keep the normal runtime font-ready wait.

## Out of scope

Cross-machine synchronization, font subsetting, variable-font axes, and per-project overrides of a
shared font.
