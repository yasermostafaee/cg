# Hide Control layout output together before Stop and Clear

Control live layouts have an opaque background page underneath native pictures. The legacy
plate-first teardown exposed that background before Stop/Clear reached the page. Keep the
legacy teardown for authored Designer outros, but hide a settled Control composition's
owned pictures, foreground and background in one native mixer commit before removing any
producer. Restore its resident page only after pictures have been seated on a later Take.
Busy/orphaned mixer channels retain the existing emergency teardown instead of waiting for
a new visibility batch. A partial hide stages the covering page last; ambiguous Take failure
re-hides the composition before rollback removes any picture.
