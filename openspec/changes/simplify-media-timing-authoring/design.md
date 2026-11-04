# Design — simplify media timing authoring

## Decisions

### 1. Do not remove the manual phase model

The simplification is an authoring-surface change, not a schema migration. Existing projects may
carry manual Video/Lottie phase values or bodymovin marker phases. Those values remain readable,
editable and playable, and the existing **Detach — edit as manual** path remains available. Only the
button that invents a new manual seed for a phase-less clip is removed.

### 2. Follow is the only new timing path for a phase-less clip

A phase-less clip cannot prove where its visual intro or outro begins. Seeding the midpoint therefore
looks authoritative without being authored truth. Follow composition stores a relationship instead:
the clip's timing follows the composition lifecycle, with a read-only derived hold boundary.

### 3. Composition Playback owns Freeze and the effective middle range

The owner's clarified furniture case is an animated middle, not only a static held frame. Follow is
composition-owned: it does not inspect or trust media markers/manual phases. The composition's
entrance and exit durations map the clip into the composition lifecycle, and the interval between
Content start and Out point is the effective Middle.

Playback authors **Freeze** or **Loop middle** once for the composition. Freeze maps every element's
held picture from the composition Out point; Content start is not a second Freeze anchor. Loop middle
uses `[Content start -> Out point]` and D-187's repeat-participant policy. This derivation stays
runtime-owned, so moving either boundary re-derives every media position instead of persisting stale
clip times.

`holdAt` remains schema-readable for old documents but is ignored by Follow. The superseded Video
`freezeAtMs` value is likewise inert. The Inspector removes editable Set hold time/frame and Freeze
frame actions and shows the Out-point-derived hold read-only. Manual and marker phases still work
when the element is not following the composition.

For Video and an imported PNG sequence (which is stored as a Video asset), the Inspector may show
the effective hold in both milliseconds/seconds and conformed-frame space. Frame numbering uses the
composition rate rather than the picked file's native fps or pre-conversion frame count.

The element Inspector does not duplicate **On hold**, a Freeze-frame value or **drives hold**.
Operators choose Hold behaviour, repeat participants and hold-driving content once from the
composition Playback section.

### 4. Information and errors are visually distinct

Phase mapping and accepted seams are teaching, not permanent Inspector prose, so they move behind the
hold row's information icon. States that require corrective author action remain visible warnings.

## Non-goals

- Removing manual fields from old projects.
- Removing legacy phase/hold fields from the schema or rewriting stored documents.
- Automatically adding or rewriting phase data while rendering the Inspector.
