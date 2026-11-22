## Decisions

- Use the existing field schemas and one validator for an authored value.
  Validate the staged fields before the shared Update path sends any effects.
  Clear a draft only after its update is accepted.
- At the Bridge and offline simulation, check changed values against the fields
  of the row's kept template. Existing applied data can predate the rules.
  Resolve grouped fields against their own namespace and compare against the
  previous effective values.
- Keep R-101's pattern wording and Persian-digit compatibility. Render the
  description as plain text with its own direction in Control's field help.
