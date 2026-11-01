## 1. Source of truth

- [x] 1.1 File D-167 and strict-validate the change.

## 2. Designer

- [x] 2.1 Add mixed-value aspect, fit and poster controls for homogeneous Live Source selections.
- [x] 2.2 Add per-plate keep-aspect convergence and per-plate repair-to-aspect.
- [x] 2.3 Add mixed frame stroke and width controls that preserve the sibling stroke component.
- [x] 2.4 Withdraw independent Poster fit at the owner's request; keep one fixed `cover` poster
      presentation and leave on-air live fit unchanged (`D-168`).

## 3. Verification

- [x] 3.1 Cover visibility, mixed state, fan-out, one undo and mixed-kind exclusion in DOM tests.
- [x] 3.2 Run Designer typecheck, lint, targeted tests and strict OpenSpec validation.
- [x] 3.3 Prove fixed-cover author rendering and the absence of Poster fit from the schema and both
      Inspector surfaces.
