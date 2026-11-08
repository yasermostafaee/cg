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
- [ ] 3.3 Run strict OpenSpec validation and the final full repository gate
- [ ] 3.4 Confirm foreground pixels, field updates and look swaps on the target CasparCG plant
