## ADDED Requirements

### Requirement: An import refusal names the file and what is wrong, in the operator's words

An import of a `.vcg` that cannot be used SHALL be refused, registering nothing, with a sentence naming the file and
what is wrong in the operator's words, never the zip library's text. An empty file SHALL read
`"<file>" is empty (0 bytes); the export did not finish. Export it again from the Designer.`
A file that is not a readable package, holds no
CG template, or whose bytes changed since export SHALL read `"<file>" is damaged or not a CG template.`, with the
technical text written to the log only. A template whose page would not fit CG Bridge's frame SHALL be refused BEFORE
anything is kept or sent, with its size:
`"<file>" is too large for CG Bridge: its page is <N> MB, and one template can be at most 64 MB. Export it again from the Designer with fewer or smaller pictures.`
A template that parses wrong (it may be a newer build's) keeps its technical sentence.

#### Scenario: The owner's empty file

- **WHEN** the operator imports a `.vcg` of 0 bytes
- **THEN** nothing is registered, and the picker reads:
  `"telavat.vcg" is empty (0 bytes); the export did not finish. Export it again from the Designer.`

#### Scenario: A damaged file

- **WHEN** the operator imports a file that is not a zip, or a package cut short
- **THEN** the picker reads `"<file>" is damaged or not a CG template.`, the zip library's text is in the log, and
  nothing is registered

#### Scenario: A book too large for CG Bridge is refused with its size, and the bridge stays connected

- **WHEN** the operator imports a book whose page would be 180 MB
- **THEN** nothing is sent, the console stays connected to CG Bridge, and the picker reads:
  `"<file>" is too large for CG Bridge: its page is 180 MB, and one template can be at most 64 MB. …`
