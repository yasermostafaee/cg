# Design — Icon pack (D-092)

## Decision: a library (`lucide-react`) behind one local `Icon` wrapper

`lucide-react` is chosen over a hand-rolled SVG set because the roadmap's next
items (D-075 / D-078 / D-080 / D-084) add new buttons that should reuse named
icons rather than each drawing SVG — a library scales with that, gives one
consistent visual language out of the box, and adds no maintenance burden for the
~30 glyphs in use. lucide is ISC-licensed, ships only the icons that are imported
(per-icon named imports are tree-shaken by Vite), and its icons stroke with
`currentColor` by default, which exactly preserves the monochrome / CSS-`color`
behaviour the glyphs relied on.

The `Icon` wrapper (`renderer/ui/Icon.tsx`) is the single seam, alongside
`Button` / `Control` in the same app-local design-system folder (`@cg/ui` stays
tokens-only). It centralizes:

- **`size`** — one square px prop (default 16); call sites pass a size to match
  the surface (e.g. 12–14 for timeline chevrons, 18–22 for the transport).
- **`currentColor`** — lucide already strokes with `currentColor`; the wrapper
  adds nothing that would break it, so an icon takes the text colour of its
  parent exactly like the glyph did.
- **`aria-hidden`** — icons are decorative by default; the interactive parent
  (`Button` / `Control`) already carries the `aria-label` / `title`, so the icon
  must not add a second a11y name.
- **`flipRtl`** (opt-in) — mirrors the icon horizontally **only** under an
  ancestor `[dir="rtl"]`, via a vanilla-extract class (`transform: scaleX(-1)`)
  applied to the lucide `<svg>`. Default is NO mirror, preserving today's
  deliberate behaviour. (No extra DOM attribute: lucide's `LucideProps` doesn't
  type `data-*`, so the E2E targets a known flip call site — the collapsed
  timeline chevron — instead.)

## Which icons mirror under RTL (`flipRtl`)

Only **navigational / directional** icons opt in: the collapse / expand chevron
(`ChevronRight`), the layer context-menu submenu arrow (`ChevronRight`), and the
keyframe-inspector **back** arrow (`ArrowLeft`). Everything else stays unmirrored:

- **Tool identity icons** (ticker `ChevronsLeft`, sequence `ChevronsRight`, …) are
  element-type identities, not navigation — mirroring would change their meaning.
- **Media transport** (`SkipBack` / `StepBack` / `Play` / `StepForward` …) follow
  the universal convention that transport controls do not mirror.
- **Alignment** icons use lucide's text-align set (`TextAlignStart/Center/End`)
  whose orientation already encodes logical start/end; the vertical-align set is
  axis-symmetric. Per the acceptance, these keep today's no-mirror behaviour.

## Glyph → lucide mapping (validated against `lucide-react@1.21.0`)

| Surface                                     | Old glyph                      | lucide                                                    | flipRtl        |
| ------------------------------------------- | ------------------------------ | --------------------------------------------------------- | -------------- |
| Tools: cursor / hand / text                 | `↖` / `✋︎` / `T`               | `MousePointer2` / `Hand` / `Type`                         | —              |
| Tools: ticker / clock / sequence            | `⇇` / `◷` / `⇉`                | `ChevronsLeft` / `Clock` / `ChevronsRight`                | —              |
| Tools: repeater / rect / ellipse / image    | `▤` / `▭` / `○` / `▦`          | `Rows3` / `Square` / `Circle` / `Image`                   | —              |
| H-align start / center / end                | `⫷` / `☰` / `⫸`               | `TextAlignStart` / `TextAlignCenter` / `TextAlignEnd`     | —              |
| V-align top / middle / bottom               | `⤒` / `⇳` / `⤓`                | `AlignVerticalJustifyStart` / `…Center` / `…End`          | —              |
| Transform scale.x / scale.y                 | `↔` / `↕`                      | `MoveHorizontal` / `MoveVertical`                         | —              |
| Transform rotation / opacity                | `↻` / `◑`                      | `RotateCw` / `Contrast`                                   | —              |
| Chevron expanded / collapsed                | `▾` / `▸`                      | `ChevronDown` / `ChevronRight`                            | collapsed: yes |
| Layer-menu submenu                          | `▶`                            | `ChevronRight`                                            | yes            |
| Modal close                                 | `✕`                            | `X`                                                       | —              |
| View-menu check                             | `✓`                            | `Check`                                                   | —              |
| Keyframe-inspector back                     | `←`                            | `ArrowLeft`                                               | yes            |
| Warning / info                              | `⚠` / `ℹ`                      | `TriangleAlert` / `Info`                                  | —              |
| Transport: start / step-back / play / pause | `▶▶`/`◀`/`▶`/`❚❚` (inline SVG) | `SkipBack` / `StepBack` / `Play` / `Pause`                | —              |
| Transport: step-fwd / loop / bounce         | (inline SVG)                   | `StepForward` / `Repeat` / `ArrowLeftRight`               | —              |
| Preview: play / pause / stop / next / reset | `▶` / `⏸` / `■` / `⏭` / `↺`   | `Play` / `Pause` / `Square` / `SkipForward` / `RotateCcw` | —              |

## Explicitly NOT migrated (text, not icons)

- `⌘` / `Ctrl` keyboard-shortcut key labels (ShortcutsModal / Edit menu) — text.
- The mixed-value `—` placeholder in `controls.tsx` / `transform-fields.tsx`.
- Transform axis **letters** `X` / `Y` / `W` / `H` (`transform-fields.tsx`) —
  textual axis labels (the same class as `—`); only the pictographic transform
  glyphs (`↔ ↕ ↻ ◑`) migrate. `FieldMeta.icon` widens from `string` to
  `ReactNode` so a field can carry either a letter (text) or an `<Icon>`.
- `NewProjectModal.tsx` `×` (multiplication) and `≈` (approximately) — math text;
  the file is in the inventory for completeness but has no glyph **icon** to swap.
- The already-bespoke (non-glyph) SVGs — `ElementRow` eye / lock + the per-kind
  `LayerTypeIcon`, the gizmo outline, the easing-curve preview — are intentional
  vector graphics, not glyph icons, and are left as-is (optional per the PRD).

## Beyond the PRD inventory

A repo-wide glyph sweep found a few rendered glyph icons outside the 15-file
inventory:

- **Migrated** — `App.tsx`'s notice/toast close `✕` → `X`. "Close" is an
  enumerated glyph in the PRD's Why, so this is squarely in intent and the icon
  choice is unambiguous.
- **Left as-is (reported for a possible follow-up)** — `canvas/CanvasArea.tsx`
  `⛶` (Fit), `compositions/CompositionActionBar.tsx` `▷` (Preview; its Export
  `⤓` spans are already commented out / non-rendered), and
  `inspector/TextStyleSection.tsx`'s `tT` / `↕` / `VA` typographic chip set.
  These are NOT in the PRD's enumerated glyph list, and the TextStyleSection
  chips are an intentional text-abbreviation cluster (same class as the
  out-of-scope `X` / `Y` / `W` / `H` axis letters), so they are deliberately not
  swapped here to avoid scope-creeping into unlisted files with non-obvious icon
  choices.

## Risk

Low — presentational. The main surface is breadth (15 files). Mitigations: every
lucide name was validated against the installed package's type declarations before
use; accessible labels live on the parent controls (unchanged), so swapping the
glyph child for a decorative `<svg>` does not change any control's a11y name; the
E2E asserts svg-present + no-glyph + `currentColor` + flip behaviour.
