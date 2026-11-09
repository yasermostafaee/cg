# Tasks — pan a cropped live input (D-178)

## 1. Contract and carrier

- [x] 1.1 Add a bounded optional normalized focus to the plate and runtime declaration
- [x] 1.2 Carry focus per look without creating a second per-source home
- [x] 1.3 Preserve old centred behaviour when focus is absent and ignore it for `contain`

## 2. Authoring and output

- [x] 2.1 Remove Designer's percentage controls and preserve saved focus values
- [x] 2.2 Record the feasibility and contract dependencies of direct CG Control dragging
- [x] 2.3 Apply focus to Bridge `FILL` through the shared live-source geometry
- [ ] 2.4 Add scoped crop editing on the live PGM return
- [ ] 2.5 Add local PVW crop editing on the accepted C-023 live input feed
- [x] 2.6 Show Crop edges below the Plate name and keep the name's screen size independent of fit and zoom

## 3. Verification

- [x] 3.1 Cover schema bounds, both fit modes, per-look carrier, wire parse and existing-project compatibility
- [x] 3.2 Package checks and the full pre-push gate passed on `d6383de0`.
- [ ] 3.3 Verify crop focus on a real input in the target plant.
- [x] 3.4 [Carrying Linux E2E for the implemented Designer and PVW labels](https://github.com/yasermostafaee/cg/actions/runs/42568697446/job/129000870086)
      passed on `665668e4`.
