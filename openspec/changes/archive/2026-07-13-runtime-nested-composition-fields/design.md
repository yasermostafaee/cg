# Design — nested-composition fields reach the operator Inspector (B-067)

## 1. Diagnosis: where the fields were dropped

One line, at import:

```ts
// apps/runtime/src/renderer/features/library/templateDelivery.ts (pre-fix)
const template: TemplateInfo = {
  templateId: manifest.id,
  templateType: scene.templateType,
  fields: scene.fields ?? [], // ← ROOT fields only
};
```

For a D-119 starter `scene.fields` is **`[]`**, so this faithfully copied emptiness into
`TemplateInfo`, and the Inspector rendered **"No fields."** The Inspector was an innocent
victim — it had nothing to render. Two independent steps conspire to empty that array:

1. `migrateGlobalFieldsToCompositions` relocates every field to the composition that owns
   its **bound element**. A starter's bindings target elements inside the graphic comp
   (`comp-title-card`), so the fields move there and the scene root is emptied
   (`composition-fields.ts` returns `fields: []`).
2. The Designer exports the **entry** composition scoped (`scopeSceneToComposition`), and
   the entry comp is the full-frame **positioning** comp (`comp-title`) — whose own
   `fields` is `[]`, because the fields live one level down.

So the package is correct and the renderer is correct; only the Runtime's _view_ of the
package was wrong. Long-standing: the root-only line dates to #236 (B-038 Phase 2), well
before D-119 starters existed.

**The package already disagreed with itself.** `@cg/vcg-format`'s GDD exporter builds its
property list from `aggregateCompositionFields(scene, scene)` (`gdd.ts`), so the `.vcg`'s
own embedded GDD manifest advertised the nested fields correctly while `TemplateInfo`
claimed there were none. The fix makes them agree.

## 2. The address was never missing — only unexpressible

The decisive recon question was whether presenting nested fields requires **inventing**
an address (a product decision: how to disambiguate, how to key, what to label). It does
not. The composition instance's stable `name` is already the canonical namespace, and the
value shape is already a nested object `{ instanceName: { fieldId: value } }`:

| Hop                      | Already speaks the nested address                                    |
| ------------------------ | -------------------------------------------------------------------- |
| GDD manifest             | `gdd.ts` emits a nested `type: 'object'` property per group          |
| Template render          | `bindings.ts` resolves a nested binding via `values[child.name]`     |
| `window.update`          | plain `JSON.parse` — accepts nesting, no flattening                  |
| CG ADD / CG UPDATE data  | `CommandBuilder.serialize()` is `JSON.stringify` — depth-transparent |
| Designer preview         | already drives nested values end-to-end                              |
| amcp-mock `decodeCgData` | string-level only — tolerant of any value shape                      |

Two consequences that shaped the fix:

- **No AMCP/wire change.** ADR-0006 escaping operates on the JSON _string_; object depth
  is irrelevant to it. The nested payload rides the existing data argument untouched.
- **Same-name collisions are already solved.** Two fields with the same id in different
  compositions never collide, because each is addressed within its own parent-unique
  instance namespace. That is what made the presentation question mechanical rather than a
  product decision — grouping is not a style choice, it is the addressing.

The one thing that genuinely could not express the address was the Runtime's own value
container: `FieldValuesSchema` was a flat `z.record(string, FieldValue)`, so a nested
payload was **rejected by Zod at the IPC boundary** (it gates `stack.load`,
`stack.update`, `Intent`, `StackItemState`, and the journal). That is a plumbing gap, not
an identity gap.

## 3. The fix

1. **Aggregate at import.** `templateDelivery` calls the EXISTING collector
   `aggregateCompositionFields(scene, scene)` — the same one the GDD exporter uses. **No
   new collector was written**; reusing it is what guarantees `TemplateInfo` and the GDD
   can no longer disagree.
2. **`TemplateInfo.groups` (additive).** `fields` keeps its meaning (the entry comp's own
   flat fields); `groups` carries the recursive namespaces. Absent/`[]` ⇒ a flat template,
   exactly as before. Only two call sites consumed `TemplateInfo.fields`, so nothing else
   moved.
3. **`FieldValuesSchema` becomes recursive** (`NestedFieldValues`). A strict **superset** —
   every existing flat payload still validates unchanged, which is why the bridge, the
   Reconciler, the journal and the Designer needed no edits (typecheck across all 33
   workspaces confirmed it).
4. **Path-addressed drafts.** `draftStore` addresses a field by `FieldPath`
   (`readonly string[]`) rather than a bare id. A top-level field is a path of length 1, so
   flat behavior is bit-for-bit identical. `buildApplyPayload` **deep-merges** the draft
   onto the applied set — a shallow spread would have replaced a whole namespace object and
   silently dropped that comp's un-edited siblings.
5. **The Inspector renders the group tree**, recursing `groups` into labelled sections
   (`label ?? name`), mirroring the Designer's existing preview form.

### Why the Reconciler did NOT need to change

Its merge is a shallow top-level spread (`{ ...rec.fields, ...intent.fields }`), which
would clobber a namespace's siblings if it ever received a _partial_ nested patch. It never
does: `buildApplyPayload` sends the **complete** field set (applied ∪ drafts), so each
namespace arrives **whole**. Leaving the Reconciler alone keeps B-044 and
reconnect-reconciliation untouched — the smallest blast radius that is still correct. This
is load-bearing: if a future caller ever sends a partial nested patch, the Reconciler must
deep-merge (mirroring `template-runtime`'s `mergeNestedValues`).

### One type had to widen

`CompositionFieldGroup.label` became `string | undefined` rather than `string`. The repo
runs `exactOptionalPropertyTypes`, and this type is now _produced_ by a Zod schema, whose
`.optional()` models an absent key as `string | undefined`. Purely a type-level accommodation.

### Reuse, not reinvention

`aggregateCompositionFields` and `defaultNestedValues` are the Designer's existing
collectors, used as-is. The `isNamespace` predicate (object, not array, no `assetId`) had
been copy-pasted three times (template-runtime, the preview form, the preview modal); it is
now `isFieldNamespace` in `@cg/shared-schema` — one definition, which the widened
`FieldValuesSchema` union also depends on.

## 4. Round-trip proof

Each hop is asserted with a real component, not a mock of it:

1. **Import** — a REAL D-119 starter, packed through the Designer's actual export
   projection, crosses `produceTemplateDelivery`; the delivered `TemplateInfo` exposes the
   nested group. Pre-fix this is RED (`expected 0 to be greater than 0`).
2. **The key is the binding key** — the group's `name` is cross-checked against the
   `composition` element instance name derived **independently** from the scene. That is the
   key `bindings.ts` resolves (`values[child.name]`), so the equality is what makes an edit
   actually reach the graphic.
3. **Seed** — `defaultNestedValues` produces the nested shape `stack.load` ships.
4. **Edit → apply** — staging at `['card','name']` yields
   `{ card: { name: 'خبر فوری', role: <untouched> } }`; the flat top-level key is
   **absent**, and the namespace sibling survives (the deep-merge assertion).
5. **Wire** — the real `CommandBuilder` builds the `CG UPDATE` line, and its data argument
   JSON-parses back to exactly that nested object: the escaping layer carried it verbatim.
6. **Render** — that same nested shape is already proven to render by
   `template-runtime/tests/nested-fields.test.ts` and
   `starter-templates/src/starter-render.test.ts` (which nests a payload by instance name
   and asserts the bound text substitutes).
7. **E2E** — a real starter `.vcg` imported through the operator UI: the group renders
   labelled, its field edits, stages dirty, and applies through the ordinary R-003 Update
   path.

A flat single-composition template is pinned unchanged (regression), and two same-id fields
in two instances are pinned distinct.
