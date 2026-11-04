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
- [x] 2.6 Derive a nested composition's visible namespace label from its current composition name
      while retaining the insertion-time instance name as its stable payload namespace.
- [x] 2.7 Expose complete clipped values on hover and let a focused Title span the adjacent
      Type / binding column without moving Actions.
- [x] 2.8 Use one fixed Bind/Unbind toggle with explicit link/unlink glyphs, violet Bind states and a
      red Unbind hover, plus a violet shadowed editing-surround frame, clear link-badged cursor and
      compatible-family instruction and target outline that follows effective element geometry.

## 3. Verification

- [x] 3.1 Add DOM tests for tab persistence, root/nested rows, recursive empty filtering and actions.
- [x] 3.2 Add Designer Playwright coverage for the visible tab flow and compact empty state.
- [ ] 3.3 Run targeted tests, the local Designer E2E lane and the full repository gate.
- [ ] 3.4 Record a successful Linux CI E2E job because this changes what renders in the Designer.
- [x] 3.5 Cover composition rename, complete long-value disclosure and focused Title width.
- [x] 3.6 Cover the fixed Bind/Unbind toggle and its violet states, Bind cursor state, compatible
      hover outline, editing-surround Bind frame, field-type compatibility hint and cleanup after
      commit.
