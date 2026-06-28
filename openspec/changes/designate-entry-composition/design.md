# Design — designate the main / entry composition (D-115)

## Recon: the current active-on-load model

The "main" is `activeCompositionId === null` (the document) ONLY in the legacy/empty case: on load,
`ensureCompositions` migrates any root layers into a composition and otherwise opens
`compositions[0]` — so with compositions present the active doc is always a comp (never the document),
chosen by LIST ORDER. `activeCompositionId` is a renderer concept (not serialized). Export scopes the
OPEN composition (`scopeSceneToComposition`); the runtime plays the scoped scene's layers.

## Decision: RESOLVE on load, no migration; `entryCompositionId` points at a comp id

`entryCompositionId` is a `compositions[].id`. We do NOT add a "document" sentinel: absent ⇒ fall
back to the first comp (the existing default), which is exactly the prior behavior, so every existing
template is unchanged (no migration). On load, `ensureCompositions` resolves: `entryCompositionId` if
set + still valid, else `compositions[0]`, else null. The PRD's "null ⇒ the main document" maps to
"absent ⇒ fall back to the default". `setEntryComposition(null)` clears the field.

## Decision: export stays "the open composition"; honoring = open-on-load

We do NOT change `editSceneOf` / `activeDocOf` / the export scope. The entry is honored by OPENING it
on load — the operator then exports the open (entry) comp, exactly as today. `entryCompositionId`
round-trips on the Scene (the `.vcg` `template.json`), so a saved/reloaded template reopens on its
main. Auto-switching export to the entry regardless of the open comp is a possible later enhancement,
out of scope here (it would surprise an operator who navigated away).

## Delete handling

`deleteComposition` already falls `activeCompositionId` back to the document when the open comp is
deleted; in the same transaction it now also clears `entryCompositionId` if the deleted comp was the
designated entry — so a dangling pointer never persists.

## Out of scope

- Composition reordering (a separate organizational feature).
- A "document as entry" sentinel (absent = the default fallback covers it).
