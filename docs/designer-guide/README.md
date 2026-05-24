# Designer Guide

The Designer is where templates are built. Output is a single `.vcg` file that the Runtime watches for and plays on air. This guide covers the v1 editing surfaces.

## Layout

Four regions plus a status bar:

- **Library** (left) — Starters, recent projects, and a quick "New project" form. Starters preload a working scene; recent projects open the most-recently-saved `.scene.json`.
- **Tool rail** (between Library and Canvas) — Cursor / text / shape / image tools. Cursor selects + drags; the other three create on click.
- **Canvas** (center) — Live preview iframe with a transparent overlay for selection and creation. Double-click a text element to inline-edit; Shift+Space inserts a ZWNJ at the caret (Persian word-boundary marker).
- **Inspector** (right) — Transform / Style / Animation / Bindings sections appear when an element is selected. The Scene metadata + Fields panel appears when nothing is selected.

## Starters

The Library exposes six starters covering every Phase 3 §5 template type: **Persian Reference Render**, **Logo Bug**, **Lower Third (English)**, **Breaking Ticker**, **Breaking News**, **Fullscreen Title**. Clicking a starter clones its scene with a fresh id — your edits don't mutate the shared starter, and saving lands in a new file.

## Animation

Every element can declare an Entry / Loop / Exit preset. Swapping a preset's kind drops the old kind's parameters and seeds new defaults — the Zod discriminated union doesn't tolerate partial overlap, so the UI never carries stale fields.

| Phase | Kinds                                           |
| ----- | ----------------------------------------------- |
| Entry | none, fade, slide, scale, blur                  |
| Loop  | none, ticker, pulse, breathing                  |
| Exit  | none, fade-out, slide-out, scale-down, blur-out |

The bottom timeline dock visualizes entry/loop/exit blocks against a frames axis. The ticker loop has a runtime implementation (M8.1) — speed is in px/s; direction `ltr` makes the marquee scroll right-to-left, `rtl` left-to-right, both with seamless wrap.

## Fields & bindings

Open the Scene inspector (deselect everything) and the **FIELDS** section appears. Add a field of any type (text, multiline, number, color, boolean, image, select). To bind it to an element on the canvas:

1. Click **Bind from canvas** on the field card.
2. Click the target element.

The resolver picks the most natural binding: text→text, color+shape→fill, color+text→text-color, image+image-element→image, boolean→visible, number→opacity. Unsupported combos (e.g. text field bound to a shape) silently produce no binding — refine via the canvas selection's BINDINGS section.

Bindings support transforms — `persian-digits`, `latin-digits`, `date-fa`, `date-en`, `uppercase`, `lowercase`, `truncate`. A formatter on an inappropriate field type surfaces as a yellow `formatter-mismatch` warning in the Issues panel.

## Pre-flight validation

The Issues panel (bottom, alongside the timeline) runs `export.preflight` on every scene change. Severity policy:

- **error** blocks the export entirely:
  - `unbound-required-field` — required field has no default and no binding
  - `unknown-binding-field` — binding references a fieldId that's not declared
  - `unknown-binding-element` — binding's elementId doesn't exist
  - `missing-asset` — image element references an unknown assetId
- **warning** ships but should be addressed:
  - `formatter-mismatch` — transform applied to incompatible field type
  - `font-no-path` — bundled font without a `bundledPath`
- **info** is advisory:
  - `empty-scene` — no layers

The StatusBar's EXPORT button disables itself while any error-severity issue is present.

## Export

`EXPORT` from the StatusBar produces a `.vcg` at the path you pick. The file is:

- **deterministic** — re-exporting the same scene produces a byte-identical archive
- **integrity-checked** — Merkle hashes; `verify()` catches a single-byte flip
- **self-contained** — bundled `@cg/template-runtime`, assets, and font references all ship inside

Drop the `.vcg` into the Runtime's watched folder. The operator sees it in the Library once verified.

## Persian / RTL

The Persian Reference Render starter is the load-bearing QA template. All five Phase 3 §5 template types ship Persian-friendly defaults; the text-shaping utilities (ZWNJ, digit conversion, Jalali dates) live in `@cg/text-shaping` and are exposed through binding transforms. Per-element `direction: 'rtl'` is recommended for Persian text — the runtime falls back to bidi auto-detect but explicit is more predictable.

## Keyboard

- **Shift+Space** — insert ZWNJ at the text-editor caret
- **Enter** — commit text edit (also commits inspector fields)
- **Escape** — cancel a Bind-from-canvas action

Configurable keybindings land in v1.1.
