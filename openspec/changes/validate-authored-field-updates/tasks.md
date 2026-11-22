## Implementation

- [x] Reproduce from the operator's VCG metadata and identify the pattern-only Update guard.
- [x] Share constraint checking with Control and preserve drafts on refused updates.
- [x] Enforce changed values in the Bridge and simulation, with scoped field tests.
- [x] Explain Description in Designer and render field help in Control.
- [x] Verify imported VCG, rejection, correction and field help in Chromium.
- [ ] Verify carrying Linux E2E.

## Evidence

- The operator's `text.vcg` retained Required and the exact Persian Description.
  The actual package passed checks for blank, whitespace-only and valid text.
- Windows Edge verified the Designer help and VCG export, and four Control
  scenarios for Required, text and number bounds, Persian-digit patterns,
  correction and keyboard access to Description.
- Local Bridge and simulation tests verified refusal before wire or state
  mutation, retention of changed and unchanged group data, and valid correction.
