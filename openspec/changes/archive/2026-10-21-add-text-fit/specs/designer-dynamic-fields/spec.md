# designer-dynamic-fields — delta (a field's new text fits at once — TEXT-FIT-01)

## MODIFIED Requirements

### Requirement: Order-independent data application and payload parsing

The runtime SHALL apply the latest field data regardless of whether `update()`
is called before or after `play()`: a `play()` with no data SHALL preserve values
set by a prior `update()`, and `play(data)` SHALL merge its data over the current
values. `update()` SHALL accept a JSON string, an already-parsed object, or the
CasparCG legacy XML payload
(`<templateData><componentData id="KEY"><data id="text" value="V"/></componentData>…`),
SHALL ignore unknown keys, and SHALL truncate a text value to its field's
`maxLength` before applying (after which the element's fit applies: an auto-size box hugs the new
text, and a shrink-to-fit box re-fits it in the same task, so no frame shows the overflowing size).

#### Scenario: update before play is retained

- **WHEN** `update({f0:"Hello"})` is called and then `play()` is called with no
  data
- **THEN** the graphic shows "Hello" (the value is not wiped by play)

#### Scenario: Legacy XML payload is parsed

- **WHEN** `update()` receives
  `<templateData><componentData id="f0"><data id="text" value="Hello"/></componentData></templateData>`
- **THEN** it is parsed to `{f0:"Hello"}` and applied, and any key with no
  matching field is ignored

#### Scenario: maxLength truncation

- **WHEN** a field with `maxLength = 5` receives the value "Hello World"
- **THEN** the element's text is set to "Hello" and its fit applies

#### Scenario: A field's new text re-fits with no jump frame

- **WHEN** a shrink-to-fit text's field is updated with a longer name
- **THEN** the text is re-fitted in the same task the value is written, before the next paint

#### Scenario: Preview opens in a modal and tears down on close

- **WHEN** the operator clicks the Preview button
- **THEN** a modal opens showing the composition's simulated output at its own
  resolution (scaled to fit) with a live field form and Play/Stop/Next/Reset
- **WHEN** the modal is closed
- **THEN** the preview instance is torn down so its timers and animation loops stop
