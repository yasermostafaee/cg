# Tasks — composition Variables tab

## 1. Right-panel ownership

- [x] 1.1 Add an accessible right-panel tab shell with Inspector and Variables.
- [x] 1.2 Keep tab selection stable across canvas/element selection and feed both surfaces the open
      composition.
- [x] 1.3 Remove the Fields section from `InspectorPanel`.

## 2. Compact Variables table

- [x] 2.1 Refactor `FieldsPanel` into compact rows showing key, title, type and binding/actions.
- [x] 2.2 Add one recursive `namespaceHasFields` rule and omit empty nested/Sequence namespaces.
- [x] 2.3 Render one whole-panel empty state and no per-namespace “no fields” messages.
- [x] 2.4 Preserve relabel, bind/rebind, unbind and delete through the existing store actions.
- [x] 2.5 Refine the first implementation into one aligned four-column table (Key, Title,
      Type / binding, Actions), keep every action in its row, and remove the duplicate panel title.

## 3. Verification

- [x] 3.1 Add DOM tests for tab persistence, root/nested rows, recursive empty filtering and actions.
- [x] 3.2 Add Designer Playwright coverage for the visible tab flow and compact empty state.
- [ ] 3.3 Run targeted tests, the local Designer E2E lane and the full repository gate.
- [ ] 3.4 Record a successful Linux CI E2E job because this changes what renders in the Designer.
