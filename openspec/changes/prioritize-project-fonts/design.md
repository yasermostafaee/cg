## Context

Text, Ticker, Clock and Sequence share `FontFamilySelect`. It already identifies project fonts, built-in fonts and fonts available in the Shared Library.

## Decisions

- Render the existing project group before the other options. Keep project font order, display names, availability and current selection rules.
- Use the Designer's project font import in the browser test. Verify the selected family stays selected when a font appears.
