# Design — composition-owned mixed Hold playback

## 1. One lifecycle cursor is not enough only while Middle loops

Freeze has one clock and one picture boundary: every element and the root cursor park at the
composition Out point. Content start is not used as a Freeze frame. During Loop middle, however,
the root cursor repeats `[Content start -> Out point]` and Preview reports that loop. It must not be
reused as the paint position for every element: an unchecked element may be farther ahead than the
cursor after the first wrap.

Runtime therefore owns two synchronized clocks during Hold:

1. the existing looping composition clock, applied only to checked repeat participants;
2. a once-only local tail clock, applied only to unchecked frame-driven elements from Out point to
   the active end.

Video and Lottie already own local clocks. They gain the same once-to-end Hold resolution instead
of being repainted from the root cursor.

## 2. Exit never replays an unchecked tail

The once-only tail starts at Hold entry and continues across the moment Hold ends. The selected
loop stops at exit, selected participants play their Outro, and unchecked participants remain under
their local tail until it reaches the authored end. The background lifecycle waits for any pending
tail before settling, and the selected Outro renderer never writes unchecked elements. Therefore an
unchecked element cannot jump backwards or replay an Outro it already completed.

An automatic content-driven completion can arrive between two Middle boundaries. In Loop-middle it
requests a graceful boundary exit from the already-running loop clock: the current pass continues to
Out point, paints that boundary once, and the existing Outro path takes ownership from there. It does
not wrap to Content start again. Freeze is already parked at Out point, so completion begins the
same forward Outro without a rewind or element-specific jump. Degenerate/no-clock Middle ranges do
the same. Operator Stop bypasses a pending Loop drain and begins Outro immediately because transport
authority must not wait for an authored loop; it still uses Out point as the exit boundary.

## 3. Pause, reset and teardown own both clocks

Pause and Resume act on the loop clock, native tail clock and media clocks together. A new Play,
hard removal or teardown cancels and settles both clocks so an old tail cannot paint into a later
run. Stop leaves a running tail alive long enough to finish, then settles the composition once.

## 4. Authoring contract

Playback exposes **On hold: Freeze / Loop middle**. Loop middle shows **Repeat during Hold**. Checked
elements repeat; unchecked elements play once to their end. Absent checklist data means every
eligible element is checked, so selecting Loop middle initially preserves the familiar whole-scene
loop. Content drivers are not checklist candidates because their clocks already continue across
Middle wraps.

Freeze does not show the repeat checklist: it derives every held picture from composition Out point.
There is no per-Video Freeze-frame exception. Legacy per-Video/per-Lottie Hold values and a stored
`freezeAtMs` remain schema-tolerated for imports but are ignored. Existing project compatibility was
explicitly waived by the owner; no migration UI is required.

Designer Preview embeds the generated `@cg/template-runtime` bundle from
`@cg/single-file-export`. Starting Designer development therefore rebuilds that package first; a
fresh source implementation must never be hidden behind an older generated Preview bundle.

## 5. Cinegy comparison

Cinegy Title separates its global scene loop from a Plate video's Free Run behaviour. The same
separation is used here: the root cursor describes the scene loop, while an unchecked time-driven
element advances independently. We extend the principle to native keyed animation so mixed scenes
do not rewind unrelated elements.
