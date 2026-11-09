# Tasks — prevent the Sequence/Repeater default-data flash (B-414)

## 1. Contract

- [x] 1.1 Register B-414 and define the first-visible-frame data guarantee.

## 2. Runtime

- [x] 2.1 Keep the stage pending through data-driven subtree reset and reveal before the entrance cascade.
- [x] 2.2 Composite pending and parked pages transparently even when an animated row overrides visibility.
- [x] 2.3 Hydrate authoring data and the selected page before revealing the rebuilt canvas.

## 3. Verification

- [x] 3.1 Add a focused Sequence-composition/Repeater regression at the reveal boundary.
- [ ] 3.2 Run focused package checks, strict OpenSpec validation and the affected/full gate.
- [x] 3.3 Chromium reproduced 24 stray rows before Play. The same test passes with the repair,
      and both complete weather-starter cycles pass through their final pages and automatic exit.
