# Tasks — Clock: custom UTC offset (D-134)

## 1. Schema and contract

- [x] 1.1 Add optional, bounded integer `utcOffsetMinutes` to `ClockElementSchema` and refuse a
      clock carrying both it and `timezone`; keep old clocks backward-compatible.
- [x] 1.2 Add schema tests for old clocks, offsets including half/quarter-hour values, bounds,
      union round-trip and mutual exclusivity.

## 2. Runtime

- [x] 2.1 Extend wall-clock component selection and `formatWallClock` with a fixed UTC offset;
      preserve the local and IANA paths unchanged.
- [x] 2.2 Thread the offset through `ClockDriverOptions`, `clockInitialText`, live paint,
      `scene-builder.ts` and `runtime.ts`.
- [x] 2.3 Add formatter/driver tests for positive and negative offsets, day wrapping, digit mapping,
      and unchanged count modes.

## 3. Designer

- [x] 3.1 Add pure `±HH:MM` parse/format helpers accepting Latin, Persian and Arabic-Indic digits,
      with unit tests for valid values, boundaries and invalid drafts.
- [x] 3.2 Replace the implicit time-zone picker with an explicit Local / Time zone / Custom offset
      source choice; clear mutually exclusive state on every mode change.
- [x] 3.3 Show and commit the custom offset field in wall mode, resetting invalid drafts to the last
      valid value and keeping count modes unchanged.

## 4. Integration and verification

- [x] 4.1 Add a Designer E2E that authors two distant fixed offsets, observes the canvas hour
      change through the real Inspector/runtime path, and confirms the exported scene carries it.
- [x] 4.2 Run strict OpenSpec validation and the focused schema, runtime and Designer checks.
- [x] 4.3 Run the full local repository gate (99/99 tasks; OpenSpec 89/89).
- [ ] 4.4 Run Linux `gate:e2e`; record authoritative evidence before closing D-134.
