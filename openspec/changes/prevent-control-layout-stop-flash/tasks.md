# Tasks

- [x] Hide only rendered Control layouts through the existing mapped mixer batch and primary acknowledgement rules.
- [x] Preserve plate-first legacy teardown, owned-layer checks, current preset/Focus and normal resident Stop semantics.
- [x] Restore visibility after native seating; re-hide before rollback on failed or applied-but-unacknowledged restore/Play.
- [x] Verify single-preset/Focus Stop/Clear on A and promoted mapped B, Remove, partial hide, interlock and busy-effect fallback.
- [x] Complete the full affected Bridge integration and teardown suites, typecheck, lint and build.
- [ ] Complete release integration and actual station visual acceptance.

Validation: all 166 affected integration cases pass (160 seating, 5 teardown, 1 stopped-look); Bridge typecheck including tests, scoped ESLint, build and strict OpenSpec validation pass. Actual station visual acceptance remains pending.
