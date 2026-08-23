# Design — the authored file-source grant

## 1. Where the flag lives, and why nothing else moves

`TemplateInfo.fields` is `z.array(DynamicFieldSchema)` and `TemplateInfo.groups` is
`CompositionFieldGroupSchema`, whose `aggregate.fields` is the same array
(`packages/shared-ipc/src/channels/templates.ts:207,214`). So a key added to `DynamicField`
travels the whole path for free:

```
Designer scene.compositions[].fields[]
  → packed into template.json          (SceneSchema.parse — pack.ts:68)
  → unpacked                            (SceneSchema.parse — unpack.ts:35)
  → aggregateCompositionFields(scene)   (templateDelivery.ts:167)
  → TemplateInfo.fields / .groups       (templateDelivery.ts:182-183)
  → FieldEditor's `field` prop          (Inspector.tsx:637,639)
```

The `.vcg` MANIFEST's field index (`FieldIndexEntrySchema` — `id`/`type`/`required`) is
deliberately NOT touched: it is a light index the runtime reads to decide whether to open the
rest, and `TemplateInfo` is built from the SCENE, never from that index. Adding the flag there
would create a second copy of one authored fact.

**The flag is on `TextFieldSchema`, `MultilineFieldSchema` and `ListFieldSchema` only.** That is
task 1b's "un-settable rather than silently ignored" taken literally: a `number` field cannot
express the key — TypeScript refuses it and Zod strips it — so there is no state in which a set
flag is being ignored.

## 2. Pre-existing fields default OFF — `P-031` decides it, not taste

The owner asked for `compat-policy` to be checked first. There is no file by that name; the
policy is **`P-031`'s compatibility floor** (`docs/prd/platform.md:1730`), and it is explicit:

> **Until the first client delivery, NO backward compatibility is owed.** … **THE FIRST SHIPPED
> RELEASE BECOMES THE COMPATIBILITY FLOOR, AND THIS POLICY REVERSES AT THAT MOMENT.**

Nothing has shipped, so OFF is not merely available — it is the default the policy names. Three
further reasons, so the choice does not rest on the policy alone:

1. **ON-for-legacy preserves exactly the state being complained about.** Every template in
   existence predates the flag, so ON would mean the control still renders under every label on
   every template, and the fix would appear not to work until each template is re-exported. The
   complaint would survive its own fix.
2. **OFF is the direction the codebase already chose for an authored capability bit.**
   `TemplateInfo.hasNext` (`templates.ts:229`): _"Absent means NO next step: the safe direction.
   An enabled control that can only no-op is the anti-pattern R-021 stage 2b named."_ Same shape,
   same answer.
3. **The cost of being wrong is one checkbox.** A template that genuinely wants file input is
   re-exported with the box ticked — the author is already in the Designer to change anything
   else. There is no data loss and no migration, and (see §3) any attachment the operator had is
   detached durably rather than left dangling.

**What OFF costs, stated plainly:** an operator using FROM FILE today on a template that is not
re-exported loses that control. The feature is 12 days old (R-018 archived 2026-08-11), its
attachments did not even survive a page refresh until `B-113` landed, and the owner is the one
asking for the removal. Named in `tasks.md` 6.2 so it is a stated cost and not a discovery.

## 3. 🔴 The 1d decision — DETACH, and the hazard that shapes HOW

**The decision: detach, durably.** The three options are not equal.

- **Refuse the change** is not implementable across the seam that actually exists. The flag is
  turned off by the AUTHOR, in the Designer, on their machine; the attachment lives in the
  OPERATOR's IndexedDB, on a different machine, possibly weeks later. The Designer holds no
  operator's attachments and cannot refuse on their behalf. "Refuse" would only mean the Designer
  refusing to author, which is refusing the feature.
- **Keep the attachment live and hide the control** is the option the owner already named worst,
  and it is worse than it first looks. It is not simply inert: `restoreFromFileAttachments`
  restores it at every boot and `persist` keeps it, so if the author later flips the flag back ON
  the control returns pre-armed with a file the operator attached and forgot. That defers the
  no-visible-cause failure rather than avoiding it.
- **Detach** ends both. `detachFileSource` already deletes from the store AND from IndexedDB, so
  the existing function is the whole mechanism.

### The hazard: absence of a schema is NOT absence of a grant

`Inspector.tsx:313` starts `info` at `null` and fills it from an async `templates.get`. During
that window — on EVERY selection change — `schema` is null, `hasSchema` is false, and every row
is built by `inferredRows` with `field: null` (`Inspector.tsx:397-403`). A detach that fires on
"this field does not grant" would fire on **every item selection**, for **every field**, and
would destroy the operator's attachments.

That is not hypothetical; it is the exact class this repo has already been burned by twice, and
the essay in `useStackHousekeeping.ts:10-31` is about the same mechanism: state pruned against a
snapshot that had not arrived yet. `pruneDrafts`/`pruneFromFile` answer it with a `StackPruneInput`
whose `{ready: false}` arm makes the mistake unreachable **by type** rather than by discipline.

**This change copies that shape rather than inventing a new one.** `detachUngrantedSources` takes:

```ts
export type FieldGrantSnapshot =
  | { readonly known: false }
  | { readonly known: true; readonly itemId: string; readonly grantedPaths: ReadonlySet<string> };
```

and returns immediately on `known: false`. The Inspector passes `known: true` only when
`info !== null` — a positively loaded template schema. Golden rule 8 restated for a different
axis: silence on the schema channel is evidence that the answer is unavailable, never evidence
that the answer is "no".

**Consequence, accepted and stated:** for a template the registry does not know (the schema-less
fallback), an existing attachment is neither detached nor shown — it sits inert until the schema
is known. That is "keep + hide" for that one case, and it is still the right trade: destroying
operator state on MISSING information is strictly worse than leaving inert state that nothing can
read. Nothing can read it — content reaches a field only through `stageFromFile`/`reloadFromFile`,
which are called only from the control that is not rendering.

**Scope, also stated:** the detach runs when the Inspector is open on that item, which is the one
moment the attachment could become visible or re-armed. An attachment for an item whose Inspector
is never opened survives in IndexedDB, inert, until it is.

### Why one effect per ITEM and not one per field

The granted-path set is computed once per `info` from the same `{fields, groups}` shape the
Inspector renders from, and the whole item is reconciled in one effect in `Inspector`. Per-field
effects would need `hasSchema` drilled through `FieldGroup` into `FieldEditor`, and would give N
independent readers of one fact — which is how the two copies in golden rule 6 come about.

The walk (`grantedFileSourcePaths`) is over `AggregatedFields`, the exact structure `FieldEditor`
and `FieldGroup` traverse, so the paths it produces and the paths the Inspector renders cannot
disagree. Keys are `fieldPathKey` — the same `JSON.stringify(path)` the attachment store already
uses.

## 4. What the operator and the author each see

| Surface                             | Before                          | After                                                  |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------ |
| Designer → Dynamic / Data           | Title, Description, Required, … | …plus **Allow file source** (text/multiline/list only) |
| Runtime Inspector, un-granted field | "From file…" button             | nothing                                                |
| Runtime Inspector, granted field    | "From file…" button             | unchanged, in every respect                            |
| Runtime Inspector, `number` field   | nothing                         | nothing                                                |

The granted field's behaviour is **bit-for-bit today's**: same control, same split defaults, same
delimiter picker, same reload semantics, same list-footer placement. This change moves a gate; it
does not touch the feature behind it.
