## 1. Contract

- [x] 1.1 Allocate D-200 and define the optional signed offset
- [x] 1.2 Preserve the offset through schema parse and project round-trip

## 2. Authoring and runtime

- [x] 2.1 Add the Inspector's signed vertical-offset input for image separators
- [x] 2.2 Apply the offset in the static Canvas row and live ticker driver without changing alignment

## 3. Verification

- [x] 3.1 Cover schema, static and live rendering plus the real Inspector/Canvas path
- [x] 3.2 Run focused package checks and the full repository gate.
      The final repository gate passed 103/103 uncached tasks plus formatting, control-byte checks
      and 149 strict OpenSpec items on 2026-11-08 (`gate-20261108T151635Z-11184.log`, exit 0,
      9m56s before repository-wide final checks).
