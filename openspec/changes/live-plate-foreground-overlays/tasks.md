# Tasks — live-plate foreground overlays (D-201)

## 1. Contract and authoring

- [x] 1.1 Allocate D-201 and add an optional per-element foreground marker
- [x] 1.2 Expose the marker in Inspector only when the scene contains a live plate
- [x] 1.3 Carry foreground demand in the imported template's live-source carrier

## 2. Output and Bridge

- [x] 2.1 Split the runtime DOM into full, background and foreground output passes
- [x] 2.2 Synchronize paired page data/lifecycle while keeping completion single-owned
- [x] 2.3 Allocate one foreground page above all seats and refuse insufficient capacity atomically
- [x] 2.4 Hide/reveal, mute, reconnect, Clear and Remove the foreground page safely

## 3. Verification

- [x] 3.1 Cover DOM pass filtering, carrier survival and served-page synchronization bootstrap
- [x] 3.2 Prove paired URLs, layer order, reveal order, capacity refusal and Clear order on AMCP wire
- [x] 3.3 The full pre-push gate and strict OpenSpec validation passed on `d6383de0`.
- [ ] 3.4 Confirm foreground pixels, field updates and look swaps on the target CasparCG plant
- [x] 3.5 Apply the output pass in the self-contained page generated on CG Control import
- [x] 3.6 Infer visual foreground in the same template and preset, with manual overrides
- [x] 3.7 Verify the reported package with automatic titles, an unmarked circle and look swaps on
      local CasparCG 2.5.0. Sampled the foreground pixels on preset 2 before and after the switch.
- [x] 3.8 The full pre-push gate and [carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42582556024/job/129044614984)
      passed on `0a553a24`.
