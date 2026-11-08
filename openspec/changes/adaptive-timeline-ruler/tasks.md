# Tasks — adaptive Timeline ruler (B-416)

## 1. Contract

- [x] 1.1 Register B-416 and define independent readable-label and frame-grid guarantees
- [x] 1.2 Define a duration-scaled maximum zoom that retains the short-project default

## 2. Designer

- [x] 2.1 Measure the Timeline viewport and choose unbounded nice label/grid strides
- [x] 2.2 Render sparse numbers over the denser aligned ruler/body grid
- [x] 2.3 Let long compositions zoom until every frame has a distinct minor line

## 3. Verification

- [x] 3.1 Cover 1,500 and 5,000-frame label counts, viewport adaptation and maximum-zoom stride one
- [ ] 3.2 Verify the supplied 5,000-frame visual case in the running Designer
- [ ] 3.3 Run Designer checks, strict OpenSpec validation and the final full repository gate
