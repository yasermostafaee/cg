# -*- coding: utf-8 -*-
import io

# ---------- runtime.md : R-029, R-042 ----------
p = 'docs/prd/runtime.md'
s = io.open(p, encoding='utf-8').read()

old = "## [ ] R-029 \u2014 cueing a graphic puts its audio on air before the operator takes it \u27e8priority: high\u27e9"
new = "## [~] R-029 \u2014 cueing a graphic puts its audio on air before the operator takes it \u27e8priority: high\u27e9 \u2014 in progress: `openspec/changes/live-source-multibox/` (task 6.5a; CONTAINMENT only \u2014 the head bullet is NOT discharged, see below)"
assert s.count(old) == 1, 'R-029 heading'
s = s.replace(old, new)

anchor = "**Containment options \u2014 recorded, NONE chosen:**"
addition = """**MECHANISM CHOSEN 2026-08-08 \u2014 option 2, bridge-side, inside `live-source-multibox`.** The owner
folded this item, [[R-042]] and [[B-121]] into one wave (`live-source-multibox` design.md \u00a77 and
\u00a712.4): **every producer the bridge creates is created muted; audio is raised only by an explicit,
recorded intent naming the layer.** For `CG ADD` the `MIXER \u2026 VOLUME 0` lands **BEFORE the ADD** on
the wire (an ADD-then-mute is the same leak, shorter \u2014 [[R-042]]). The unmute is not newly built:
`take()` already re-asserts `INTENDED_VOLUME` unconditionally on every take
(`caspar-runtime.ts:1597-1601`), and that re-assert IS the explicit intent.

**Command sources it does NOT cover, stated as this item's third acceptance bullet requires:** the
company's PLAYOUT system sends `CG ADD` / `PLAY` to CasparCG directly, on layers this bridge never
touches. Nothing bridge-side can mute those, and no template-side convention binds a template we did
not author. That is option 3's gap and it remains open by construction.

\ud83d\udd34 **NOT DISCHARGED \u2014 the second acceptance bullet, the head.** _"WHEN that cued item is then taken
THEN its audio is audible, from the start of the audio \u2014 containment must not eat the head."_ A
bridge-side mute cannot deliver this and `live-source-multibox` does not claim it: on 2.5.0 the audio
is **already running** at `CG ADD` (that is the defect), so a mute held from ADD to take unmutes
**mid-stream** \u2014 the head is eaten by however long the operator cued ahead. Closing it needs
**option 1**, gating audio on the template's own `play()` lifecycle and **enforcing that at
export/validate time**, which is a `@cg/template-runtime` + exporter change and is deliberately out
of `live-source-multibox`'s scope. **This item therefore stays `[~]` carrying exactly that residual**
\u2014 read the `[~]` as "the leak is contained", never as "the audio question is answered".

"""
assert s.count(anchor) == 1, 'R-029 anchor'
s = s.replace(anchor, addition + anchor)

old = "## [ ] R-042 \u2014 mute-before-ADD, so LOAD can run during rehearse without a brief audible leak \u27e8priority: medium \u2014 reaches air\u27e9"
new = "## [~] R-042 \u2014 mute-before-ADD, so LOAD can run during rehearse without a brief audible leak \u27e8priority: medium \u2014 reaches air\u27e9 \u2014 in progress: `openspec/changes/live-source-multibox/` (task 6.5b)"
assert s.count(old) == 1, 'R-042 heading'
s = s.replace(old, new)

old = "**DESIGN-FIRST \u2014 implementation needs an OpenSpec change before code.**"
new = """**THE OPENSPEC CHANGE EXISTS \u2014 `openspec/changes/live-source-multibox/`, task 6.5b (2026-08-08).**
The owner folded this item, [[R-029]] and [[B-121]] into one wave, under one rule (design.md \u00a77):
every bridge-created producer is created muted, audio raised only by explicit recorded intent. The
ordering constraint below is carried verbatim into 6.5b, including the requirement that the
`MIXER \u2026 VOLUME` be asserted **on the AMCP trace** rather than by the absence of an error. Nothing
about the item's substance changed; only its home.

**DESIGN-FIRST \u2014 implementation needs an OpenSpec change before code.**"""
assert s.count(old) == 1, 'R-042 design-first'
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='').write(s)

# ---------- bugs-runtime.md : B-121 ----------
p = 'docs/prd/bugs-runtime.md'
s = io.open(p, encoding='utf-8').read()
old = "## [ ] B-121 \u2014 `CG ADD` site 2, the reconnect reconciliation, is not rehearse-guarded, so a bridge blip re-ADDs an UNMUTED producer under a rehearsing row \u27e8priority: high \u2014 reaches air\u27e9"
new = "## [~] B-121 \u2014 `CG ADD` site 2, the reconnect reconciliation, is not rehearse-guarded, so a bridge blip re-ADDs an UNMUTED producer under a rehearsing row \u27e8priority: high \u2014 reaches air\u27e9 \u2014 in progress: `openspec/changes/live-source-multibox/` (task 6.5c, and 6.5d pins all four sites)"
assert s.count(old) == 1, 'B-121 heading'
s = s.replace(old, new)

old = "**Notes:** related to [[R-022]] (the rehearse feature) and to the deferred `mute-before-ADD`"
new = """**FOLDED INTO `live-source-multibox` 2026-08-08 (owner).** This bug, [[R-029]] and [[R-042]] are one
problem under one rule (design.md \u00a77): every bridge-created producer is created muted, audio raised
only by explicit recorded intent. Site 2 is fixed under that rule \u2014 **mute before the re-ADD, or do
not ADD** \u2014 asserted on the wire, since a renderer-only guard is the shape site 1's fix explicitly
rejected. Task **6.5d** additionally pins **all four** sites with one test, so that site 3's
"unchanged and safe" stops being a claim in a table and becomes an assertion; the table above is
otherwise re-derived by the next sweep.

**Notes:** related to [[R-022]] (the rehearse feature) and to the deferred `mute-before-ADD`"""
assert s.count(old) == 1, 'B-121 notes'
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
