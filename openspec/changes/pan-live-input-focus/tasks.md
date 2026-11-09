# Tasks — pan a cropped live input (D-178)

## 1. Contract and carrier

- [x] 1.1 Add a bounded optional normalized focus to the plate and runtime declaration
- [x] 1.2 Carry focus per look without creating a second per-source home
- [x] 1.3 Preserve old centred behaviour when focus is absent and ignore it for `contain`

## 2. Authoring and output

- [x] 2.1 Add X/Y percentage controls to the Live Source Inspector
- [x] 2.2 Preview focus on an authored poster
- [x] 2.3 Apply focus to Bridge `FILL` through the shared live-source geometry

## 3. Verification

- [x] 3.1 Cover schema bounds, both fit modes, per-look carrier, wire parse, poster and Inspector writes
- [x] 3.2 Package checks and the full pre-push gate passed on `d6383de0`.
- [ ] 3.3 Verify crop focus on a real input in the target plant.
