## Decisions
Automatic loading is keyed by item, field path, authored path and delimiter. It runs after reconciliation makes the bridge source readable, once per changed authored definition. A failed read keeps the previous field value and shows the existing error; it never blanks content.
