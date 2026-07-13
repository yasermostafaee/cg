# designer-shell — delta for rebuild-starter-templates (D-119)

## ADDED Requirements

### Requirement: The starter catalog is the five D-119 Persian broadcast demos

The starter catalog SHALL consist of exactly five starters — `irib-news`,
`ticker`, `logo-bug`, `title`, `sequence`, in that landing order — each a
schema-valid, fully animated Persian (RTL, Vazirmatn) scene with a real
playout lifecycle, and none SHALL carry the "New" badge. Each starter SHALL
follow the two-comp structure: a small on-air footprint composition (recorded
via an `onair:<compId>` scene metadata tag and its own lifecycle/playout)
nested inside a full 1920×1080 composition that is the `entryCompositionId`
and therefore the default preview/export root.

#### Scenario: Only the five D-119 starters appear

- **WHEN** the Landing view lists starters
- **THEN** exactly `irib-news`, `ticker`, `logo-bug`, `title`, `sequence`
  appear, in that order, each with a poster and no "New" badge

#### Scenario: Every starter runs a real playout lifecycle in preview

- **WHEN** any starter's entry composition is previewed and played
- **THEN** it runs entrance → hold → exit per its authored playout mode —
  `manual` starters (`irib-news`, `ticker`) hold on air until the operator's
  stop/out intent and then play their authored exit, `auto-out` starters
  (`title`, `sequence`) self-close after their hold, and the `logo-bug` sting
  re-plays on its loop-cycle cadence (~every 10 s) until stopped

#### Scenario: The composite's panel rotates one state at a time

- **WHEN** the `irib-news` starter plays
- **THEN** its right panel shows exactly one state at a time — the live
  Tehran wall clock, then the live Greenwich wall clock, then the "@IRIBNEWS"
  brand text — rotating on a loop while the headline crawl rolls

#### Scenario: Operator-editable data keys drive the content

- **WHEN** the operator edits a starter's bound data key (a ticker/sequence
  `list` field or a text field) in the preview form
- **THEN** the on-air content updates through the binding (list updates
  reconcile by item id without restarting the crawl/rotation)

### Requirement: A starter's bound text field carries a real Persian default

Every bound TEXT field in a starter SHALL follow the hand-authored binding
shape: the element's base text is a real Persian display value that is ALSO the
field's `default`, and the data key is layered on top via a binding that carries
NO `placeholder` (absent placeholder = the value replaces the full text). A raw
`{{token}}` SHALL NOT appear as any element's authored text. This keeps the
Designer canvas showing broadcast copy, makes the same string the on-air
fallback when the operator sends no value, and lets the Designer's inspector
recognise the binding as the element's Data key (it treats only a
placeholder-less text binding as an element's convenience binding).

#### Scenario: A loaded starter shows real Persian copy, not a raw token

- **WHEN** the operator opens a starter in the Studio
- **THEN** each bound text element shows its Persian default value (e.g. the
  `logo-bug` wordmark shows «شبکه جدید») and no `{{token}}` is visible on the
  canvas

#### Scenario: On air with no operator value, the default renders

- **WHEN** a starter is played with no value for a bound text field
- **THEN** that field's element renders the field's Persian `default`

#### Scenario: An operator value replaces the default on air

- **WHEN** a starter is played with a value for a bound text field
- **THEN** that value replaces the default in the rendered element

### Requirement: Starter asset seeding rewrites every font-bearing element

When a starter ships font assets, the seeding step SHALL rewrite the
placeholder `asset-<key>` font family to the imported `asset-<assetId>` on
EVERY font-bearing element kind — `text`, `ticker`, `clock`, and `sequence`
(recursing through containers) — and on the scene's `fonts` entries, so a
seeded face resolves wherever the scene uses it.

#### Scenario: A ticker element resolves its seeded face

- **WHEN** a starter that ships a Vazirmatn font asset is loaded and its
  scene contains a `ticker`, `clock`, or `sequence` element referencing the
  placeholder family
- **THEN** after seeding, that element's `font.family` is the imported
  `asset-<assetId>` (not the unresolved placeholder)
