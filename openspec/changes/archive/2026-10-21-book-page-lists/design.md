# Design — book-page-lists (B-353)

## The rule, and where the mark lives

`isPageListField(field, sequence)` (`@cg/shared-schema/src/page-lists.ts`) is the one answer. The `pages` mark stays
in the schema (CG Control's Inspector and the bridge's record read it through `TemplateInfo`), but it is now a
RECORD of the rule, kept equal to it by:

| Door                                  | Before                            | Now                                        |
| ------------------------------------- | --------------------------------- | ------------------------------------------ |
| `rebuildField` (any meta edit)        | dropped `pages`                   | carries it                                 |
| `setSequenceItems`, text ↔ pictures   | dropped the key and its field     | keeps both, flips the mark                 |
| `setSequenceItems`, mixed/composition | dropped                           | dropped (unchanged: not bindable)          |
| `setElementDataKey`, re-adopt         | kept the orphan's config, no mark | marks it; a book takes its pages           |
| `addBinding` (bind from canvas)       | no mark, empty default            | marks it; an empty book takes its pages    |
| opening a project                     | as stored                         | `migratePageListMarks` (registered)        |
| export / import                       | `pageListsOf` read the mark only  | `withPageLists` before anything is derived |

Why the flip is safe where the drop was chosen: the drop's reason was "a page list and a text list are two different
operator controls". That is true, and it is about CG Control — which reads the surface at import, from the package.
Nothing CG Control stores is reinterpreted by the flip: the next import of the package is a book.

## The automatic page list

`withAutoPageLists` runs on the PACKAGE (export) and on the IMPORTED scene, never on the author's project — a field
the author did not make must not appear in their Fields panel. Its id is `pages-<elementId>` (stable: the element's
id is), suffixed `-2`, `-3` only if a field already has it; its label is the sequence's name, so CG Control names the
row's book in the author's words. Only a sequence the operator steps gets one: a picture sequence that runs by itself
is not a book.

## `advance: auto` on a book

`auto` = dwell timer AND `next()` (`sequence-driver.ts`). A `goTo` restarts the dwell. CG Bridge owns the page number
(`caspar-runtime.ts` `pageTarget`) and sends the ABSOLUTE page on every press in `__cg.page`; the page reports nothing
back. So an auto book turns itself every dwell while CG Control's `1 / 87` stays put, and the next Next sends
"last page CG Control sent + 1" — backwards from the air. That is incoherent in the engine, so per the owner's decision
it is said as a sentence in the Designer's Inspector, and CG Control shows the book bar regardless.

## The generic editor

A list whose items are pictures and that reaches `ListFieldEditor` (a template imported before this change) renders
the pictures' names read only and one sentence — "These are pictures. Import the template again to turn them." — and
stages nothing, so Update cannot replace pages with empty text.
