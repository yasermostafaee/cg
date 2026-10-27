# Tasks — visible template-import progress

## 1. Product record

- [x] 1.1 File R-103 and the runtime-template-library delta.

## 2. CG Control

- [x] 2.1 Start busy state after file selection, name the file and block conflicting picker actions
      and dismissal until import settles.
- [x] 2.2 Preserve existing success, failure, cancel and duplicate-id decision behaviour.

## 3. Verification

- [x] 3.1 Add DOM coverage for cancel-without-loading, pending state and cleanup on settlement.
- [ ] 3.2 Run Runtime typecheck/lint/unit tests and a real-browser picker check, then the full gate.
