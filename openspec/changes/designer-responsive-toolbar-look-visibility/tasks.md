## 1. Implementation

- [x] 1.1 Measure compactness from the Canvas viewport and render a labelled overflow menu below the
      narrow threshold.
- [x] 1.2 Keep Select and Hand direct, preserve the wide tool order, and include the multi-frame
      action in the compact menu.
- [x] 1.3 Omit Hide/Show for managed Look instances while keeping Lock aligned and child layers
      unchanged.
- [x] 1.4 Constrain the Look selector shell and align header spacing/control heights across wide,
      medium and minimum supported window widths.
- [x] 1.5 Resolve registered Look compositions by instance reference and apply one semantic icon and
      colour identity in the Compositions panel and Timeline.
- [x] 1.6 Partition Looks below ordinary compositions, move Look lifecycle actions into that section,
      synchronize deletion in both directions, and confirm non-empty group removal.
- [x] 1.7 Keep the Looks header and names neutral, reserve violet for the type icon/accent, use an
      icon-only add action, remove the user-facing default designation, and suppress empty
      explanatory Inspector copy; make Show Look navigate to the group home when needed.
- [x] 1.8 Add a session-only Look selector to Preview and hide recursively empty composition/Look
      namespaces from its Variables panel.
- [x] 1.9 Use the broadcast-facing term Preset in Designer controls while retaining the legacy
      Look schema/API, and keep the selected Preset visible even when the group contains only one.
- [x] 1.10 Name newly created Presets `preset-1`, `preset-2`, … while preserving legacy internal
      `look-N` ids and opening existing projects unchanged.

## 2. Verification

- [x] 2.1 Add and run narrow-width Chromium coverage for containment and menu selection.
- [x] 2.2 Cover truthful root-row controls in the focused responsive Look acceptance test; the
      legacy six-box end-to-end walk remains independently long-running.
- [x] 2.3 Pass Designer typecheck/build and strict OpenSpec validation.
- [ ] 2.4 Pass the full local gate; record Linux E2E only after a safe push.
- [x] 2.5 Cover synchronized deletion, default promotion, group removal confirmation, group-home
      creation and stable Composition-before-Look ordering in focused tests.
- [x] 2.6 Cover the absence of user-facing default badges and the empty Inspector state in focused
      DOM tests; verify the revised hierarchy manually at supported widths.
- [x] 2.7 Cover Preview Look switching in focused DOM and Chromium tests, then rerun Designer
      typecheck/build and strict OpenSpec validation.
- [x] 2.8 Cover the single-Preset Preview state and revised accessible labels, then rerun the
      focused DOM/Chromium checks, Designer build and strict OpenSpec validation.
