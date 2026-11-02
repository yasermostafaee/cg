# Proposal — readable splash build stamp

Both startup splashes currently show a compact support stamp whose middle Git revision has no label. Keep the diagnostic identity, but name each value so an operator can report it without guessing.

## Scope

- Format the shared splash stamp with explicit Version, Revision and Build date labels.
- Apply the same shared format to CG Designer and CG Control.
- Keep truthful fallbacks for development/source trees without a release version or Git revision.
