## Decisions

- **Convenience layer, not a new model.** The Data key is sugar over the existing
  scene-level `fields[]`+`bindings[]`. Rationale: that model is already
  implemented, tested, used by starters, and read by the runtime/exporters;
  storing field config on the element would create a second, conflicting system.
  The store owns the sync (`setElementDataKey` / `setElementFieldMeta`):
  create → `addField` + `addBinding`; rename → update field `id` + the matching
  binding's `fieldId`; clear → `removeField` + `removeBindingAt` (find index by
  `fieldId`).
- **Default binding = full-text replace** (`{kind:'text', elementId}`, no
  placeholder), since the Data key binds the whole element's text. The existing
  `{{placeholder}}` path stays available for hand-authored multi-slot text.
- **Field type mapping.** `fieldType:"text"` → field `type:"text"` (or
  `"multiline"` when Multiline is on, kept in sync with the element's `wrap`);
  `fieldType:"number"` → field `type:"number"`.
- **`next()` / steps out of scope.** `runtime.next` stays a safe no-op; a steps
  model is a later change. The preview Next button and `CG NEXT` are no-ops for
  single-step templates.

## Risks

- **Key rename churn.** Renaming a Data key must keep field and binding in sync
  atomically or a dangling binding results — covered by a store test.
- **Persian/RTL values.** `maxLength` truncation is by code points, not bytes;
  keep ZWNJ intact and let the existing text shaping handle direction.
