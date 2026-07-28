# designer-zone-styling

## ADDED Requirements

### Requirement: A zoned countdown publishes its active zone at its composition's scope root

The runtime SHALL publish the active zone of a zoned countdown as an attribute on the SCOPE ROOT
of the composition that owns the countdown — the root stage for the scene, or the nested
instance's inner container for a composition instance. The clock driver SHALL own this write,
because it already owns the remaining time and the only per-frame loop.

The write SHALL be LATCHED: the driver SHALL keep the last published key and write ONLY when the
selected zone changes, so a boundary crossing flips the DOM EXACTLY ONCE and a run with four
zones performs three writes over its whole life. The existing ≈1-DOM-write-per-second text
repaint discipline SHALL be unaffected — zone selection is arithmetic over a value the repaint
already computes, and adds no unconditional write.

`reset()` SHALL clear the published zone so a fresh run re-enters at the correct zone rather than
inheriting the previous run's colour, and teardown SHALL remove it so no stale zone survives a
destroyed scope.

#### Scenario: A boundary crossing flips the zone exactly once

- **WHEN** a zoned countdown's remaining time crosses a zone boundary
- **THEN** the scope root's published zone changes exactly once — no flicker at the boundary, no
  repeated writes while the zone holds

#### Scenario: The per-second repaint discipline is unchanged

- **WHEN** a zoned countdown runs for a minute inside one zone
- **THEN** the DOM writes are the ≈60 text repaints only — zero additional zone writes

#### Scenario: A fresh run re-enters at the correct zone

- **WHEN** a composition loops and the countdown resets for a new cycle
- **THEN** the published zone is cleared and re-established from the new run's remaining time, not
  carried over from the previous cycle

### Requirement: Any element can opt into per-zone colour overrides

Every element SHALL accept an optional list of per-zone colour overrides, each naming a zone key
and one or more colourable slots: text colour, background colour, shape fill, shape stroke. A slot
SHALL take either an explicit colour or the ZONE's own colour, so the common case ("follow the
zone") needs no per-element palette and a later palette change reaches every follower. Zone keys
SHALL be unique within an element and each override SHALL set at least one slot.

Slots a given element kind does not own SHALL be INERT rather than an error, and the property each
slot writes SHALL be the SAME property the existing colour binding writes for that kind — so an
element recolours identically whichever mechanism drove it. Elements with no overrides SHALL be
untouched by any zone.

Overrides on an element inside a nested composition SHALL be authored by drilling INTO that
composition, never from a host that instances it — a composition is a shared definition, and
editing it through a host would hide that fact.

#### Scenario: Only opted-in elements react

- **WHEN** a zone becomes active in a composition
- **THEN** every element carrying an override for that zone transitions to its override, and every
  element without one is untouched

#### Scenario: A slot the element kind does not own is inert

- **WHEN** an override sets a shape `stroke` on a text element
- **THEN** the element renders unchanged — no error, no fallback colour

#### Scenario: Nested overrides are authored by drilling in

- **WHEN** the designer configures zone overrides for an element inside a nested composition
- **THEN** they do so by opening that composition, and the change applies to the shared
  definition — the host offers no editing surface for the nested element

### Requirement: The nearest enclosing zoned scope wins, and an unzoned override is inert

Zone state SHALL resolve by NEAREST ENCLOSING ZONED SCOPE. When a host composition and a nested
composition both carry zoned countdowns, each SHALL govern its own subtree: an element inside the
nested composition SHALL follow the NESTED countdown's zone, and an element in the host outside
that instance SHALL follow the host's. Resolution SHALL NOT depend on the order in which style
rules were emitted.

An element inside a nested composition instance with NO zoned countdown of its own SHALL follow
the ENCLOSING composition's active zone — zone state crosses composition-instance boundaries.

When NO enclosing zoned scope is active, every override SHALL be INERT and the element SHALL
render its authored base style. This SHALL be the same resolution path as a matched zone (a
fallback, not a separate branch), and SHALL cover the standalone preview of a composition whose
elements carry overrides, a host with no zoned countdown, and the region above the highest
threshold when no base zone is configured.

A zone key an element overrides but the enclosing countdown never emits SHALL likewise be inert —
a key mismatch SHALL degrade to the authored style, never to an error or an arbitrary colour.

Because that runtime inertness is deliberate and permanent (never fail on air), the DESIGNER
SHALL NOT be silent about the same mismatch: for EVERY zone key an element declares that no
enclosing zoned countdown defines, the Designer SHALL surface a non-blocking authoring warning at
the override that declared it, naming the unmatched key and listing the keys the enclosing
countdown does define. The check SHALL be PER KEY — an element whose keys merely INTERSECT the
countdown's is not thereby clear, since `{warning, dangre}` under a countdown defining
`{warning, danger}` intersects non-emptily while the typo'd half never fires. The warning SHALL
also be raised on the countdown's zones editor when RENAMING a zone key would orphan existing
overrides.

The warning SHALL be non-blocking and SHALL NOT become a validation error: it SHALL never refuse
a save, an export, or a play, and a currently-unmatched key SHALL remain schema-valid. It SHALL
NOT be raised for a composition previewed STANDALONE, where every override is legitimately inert —
that is a supported authoring state, not a mistake. It SHALL be an author-time read only: no
schema field, no runtime branch, no exporter change, and no effect on the compiled stylesheet.

Zone changes SHALL be visually smooth — a CSS transition in the 300–500 ms range on the colour
properties involved.

#### Scenario: Host and nested countdowns each govern their own subtree

- **WHEN** both a host and a nested composition have zoned countdowns in different zones
- **THEN** elements inside the nested instance follow the NESTED zone and elements in the host
  outside it follow the HOST zone

#### Scenario: Zone state crosses into a nested instance

- **WHEN** a nested composition instance has no zoned countdown of its own and its host's
  countdown crosses a boundary
- **THEN** opted-in elements INSIDE the nested instance transition to their zone overrides

#### Scenario: Overrides are inert with no enclosing zone

- **WHEN** a composition carrying zone-override elements plays standalone, or under a host with
  no zoned countdown
- **THEN** those overrides are inert and the elements render their authored base styles

#### Scenario: An unmatched zone key is inert at runtime and flagged per key at author time

- **WHEN** an element overrides a zone key the enclosing countdown never emits
- **THEN** the element renders its authored style, and the Designer shows a non-blocking warning
  at the override that declared it, naming the unmatched key and the keys the countdown defines
- **WHEN** an element declares `{warning, dangre}` under a countdown defining `{warning, danger}`
- **THEN** exactly ONE warning is raised, naming `dangre` — a non-empty intersection does NOT
  clear the element

#### Scenario: Renaming a countdown's zone key flags the overrides it orphans

- **WHEN** a zone key is renamed on the countdown's zones editor while elements still override the
  old key
- **THEN** the warning is raised for those overrides at the moment of the rename

#### Scenario: The warning blocks nothing and never fires on a standalone preview

- **WHEN** a scene carrying an unmatched zone key is saved, exported and played
- **THEN** all three succeed — the warning is non-blocking, the key stays schema-valid, and the
  runtime renders the element with its authored style
- **WHEN** a composition carrying zone overrides is previewed STANDALONE (no enclosing countdown
  at all)
- **THEN** no warning is raised — every override is legitimately inert there

#### Scenario: The zone change is a smooth transition

- **WHEN** the active zone changes
- **THEN** each opted-in element transitions its colours smoothly (~300–500 ms) rather than
  cutting

### Requirement: Zone styling is compiled from the scene by the runtime, identically in preview and export

The per-zone styling SHALL be COMPILED FROM THE SCENE BY THE RUNTIME at build time and injected
as a single stylesheet, beside the existing baseline stylesheet and by the same idempotent
mechanism. Neither exporter SHALL be taught about zones: because the single-file export embeds the
scene and boots the same runtime, and the `.vcg` ships that runtime too, both carry byte-identical
rules by construction rather than by parallel implementations kept in sync.

The compiled stylesheet SHALL stay within the CasparCG CEF engine floor — no CSS feature newer
than the declared baseline (this rules out `@scope` and `:is()`/`:where()` specificity control,
and is why nearest-wins is resolved through inherited custom properties rather than through
selector specificity or source order).

The compiled output SHALL NOT embed author-controlled strings in selector or property POSITIONS:
element slots SHALL be keyed by a deterministic per-scene index rather than by element id (ids are
arbitrary strings with no CSS-identifier guarantee), zone keys appearing in selector values SHALL
be escaped, and colours SHALL be schema-validated before reaching a declaration.

#### Scenario: Preview and single-file export behave identically

- **WHEN** the same zoned scene is previewed in the Designer and exported as single-file HTML
- **THEN** both render the same zone rules and the same boundary behaviour, with no
  exporter-specific zone code on either path

#### Scenario: The compiled stylesheet runs on the CEF baseline

- **WHEN** the compiled zone stylesheet is emitted
- **THEN** it uses no CSS feature newer than the declared CasparCG CEF baseline

#### Scenario: Author-controlled strings never reach a selector or property name

- **WHEN** an element id or a zone key contains characters that are not valid in a CSS identifier
- **THEN** the compiled stylesheet is still well-formed — slots are keyed by index and keys are
  escaped — and the styling behaves as authored

### Requirement: The Designer can rehearse zone changes without waiting for real time

The Designer preview SHALL be able to demonstrate zone changes without waiting out the real
countdown. It SHALL provide a session-only TIME-COMPRESSION rehearsal driven through the runtime's
existing injectable clock, so an hour-long countdown replays in a fraction of the time through the
REAL driver, the REAL thresholds, in the real order, with the real transitions — a rehearsal
exercises the same code path that runs on air. It SHALL also provide a static zone selection for
styling work, which forces a chosen zone without running the countdown at all.

Both SHALL be session-only: neither SHALL be persisted to the scene, and neither SHALL reach
either exporter.

#### Scenario: A compressed rehearsal crosses every boundary in order

- **WHEN** the designer rehearses a 60 / 30 / 10-minute zoned countdown at a compression factor
- **THEN** every boundary is crossed in order within the compressed run, each flipping the zone
  once, with the same transitions the real countdown would show

#### Scenario: A static zone selection previews colours without running the clock

- **WHEN** the designer selects a zone in the preview while styling
- **THEN** every opted-in element shows that zone's colours immediately, with no countdown running

#### Scenario: Rehearsal state never persists or exports

- **WHEN** a scene is saved and exported after a rehearsal
- **THEN** neither the compression factor nor the selected preview zone appears in the saved scene
  or in either export
