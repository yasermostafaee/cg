# A live plate in PVW must LOOK like a live plate, and say which source is behind it

## Why

`docs/prd/runtime.md` **R-049**. In PVW a Live Source region today paints **nothing** — an empty,
fully transparent hole — and that is CORRECT: rehearse renders the retained exported page
**verbatim**, and `live-source-multibox` design.md §12.2 requires that page to paint zero pixels
where a Live Source is, because what fills it on air is a CasparCG layer composited BEHIND the
template. **That decision stands and is not reopened here.**

The problem is what "nothing" reads as. The owner hit it in live testing and reported it plainly:
**in CG Control's PVW you cannot tell a live plate exists at all.** Two questions an operator has
in front of the preview go unanswered:

1. **Is this template fine, or did the page fail to render?** An empty region is
   **indistinguishable from a broken render**, and PVW is the surface where that question is
   supposed to be answerable.
2. **Which source sits behind which plate?** This one is answerable **only here**. The exported
   page knows a plate IDENTIFIER and nothing else, by design (design.md §2z — the author names
   plates for the LAYOUT, the installation names sources for what they ARE). **The Runtime holds
   the join**, so it is the only surface that can show the operator's own source NAME beside the
   author's plate name.

The second question has teeth: an unassigned plate **REFUSES the take** (C-015's empty-mapping
acceptance). PVW is therefore the operator's last chance to see an unbound plate before air, and
today it shows them a transparent hole.

## What Changes

The **Runtime draws a labelled placeholder OVER the rehearse frame**, per live plate. Nothing about
what is rendered changes.

- **No `.vcg` change, no exporter change, no third render mode.** The placeholders are an overlay
  the Runtime composites on top; the page beneath is untouched and `buildScene`'s
  `mode: 'author' | 'output'` seam (design.md §9) stays UNUSED and available for a real `'rehearse'`
  mode if one is ever wanted.
- **ONE set of colour bars, reused, not a second table.** `smpteBarsGradient()` / `SMPTE_BARS` —
  the 75 %-amplitude bars D-137 phase 1 built for `'author'` mode — become exported from
  `@cg/template-runtime`. The function body is unchanged; it already carries the B-066 lesson
  (explicit PAIRED gradient stops, because double-position stops shipped in Chromium 72 and
  CasparCG's CEF is baseline 71) and a hand-written second table would very likely lose it.
- **TWO states, distinguishable across the room without reading a word** — because they demand
  different operator actions. ASSIGNED is full-colour bars carrying the plate name and the source
  name; UNASSIGNED is a DESATURATED variant with an amber frame and an explicit
  **"no source assigned"**.
- **Unmistakably NOT a preview.** A browser cannot display SDI or NDI. A placeholder that reads as
  a picture would be WORSE than the blank region it replaces — it converts "I can't see it" into "I
  saw it and it was fine" — so every placeholder carries hazard striping and the word PLACEHOLDER,
  and no state of it can be mistaken for an incoming feed.
- **ONE fit scale, shared with the frames it sits over.** The overlay rides the same raster-sized
  box and the same `translate(-50%,-50%) scale(fit)` the iframes use, emitted from ONE helper. The
  scene-pixel → raster-pixel half of the chain reuses `outputScale` / `outputLetterbox` /
  `outputTranslate` from `@cg/template-runtime` — the page's OWN arithmetic — rather than a second
  copy of it.

## Impact

- `packages/template-runtime` — two symbols exported (bodies unchanged) plus a `./scene-builder`
  subpath so the entry index's export table, which IS the inlined on-air bundle's export table,
  does not grow. **Measured: the exported page's runtime bundle is byte-identical**; re-exporting
  from the entry index instead would have cost +121 bytes in every `.vcg`.
- `apps/runtime` — a new pure `livePlateOverlay` module, a `LivePlateOverlay` component, a shared
  `frameBox` geometry helper, and the data path that carries each template's `liveSources` block
  and its APPLIED plate→source names to PVW.
- No bridge change, no wire change, no schema change.
