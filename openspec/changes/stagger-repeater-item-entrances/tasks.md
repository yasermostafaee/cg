# Tasks — stagger Repeater item entrances (D-197)

## 1. Contract

- [x] 1.1 Register D-197 and define compatibility, ordering and lifecycle ownership.
- [x] 1.2 Add the strict `designer-repeater-element` spec delta.

## 2. Schema and authoring

- [x] 2.1 Add backward-compatible entrance, effect-time and item-delay fields to Repeater schema/defaults.
- [x] 2.2 Add compact Repeater Inspector controls using the existing motion vocabulary.

## 3. Runtime

- [x] 3.1 Add clipped row motion wrappers only when an entrance is enabled.
- [x] 3.2 Implement ordered, pause-safe entrance playback and symmetric stop/destroy cleanup.
- [x] 3.3 Preserve live values, shrink/regrowth and nested row lifecycle behavior.

## 4. Verification

- [x] 4.1 Add schema/default/Inspector and deterministic runtime tests.
- [x] 4.2 Run focused package typecheck, lint, tests and builds.
- [x] 4.3 Run strict OpenSpec validation and the full repository gate before push.
