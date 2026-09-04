# runtime-ui — delta (the output alarm names the addressing form and where the number comes from, C-030)

## ADDED Requirements

### Requirement: The output alarm names the addressing form of the declaration and where the number comes from

Whenever the program-output alarm names a missing declared DeckLink device, it SHALL say in plain
words which addressing form the declaration uses — a hardware persistent ID (a long number) or a
slot index (a small number) — with the counter-example that lets an operator recognise the other
kind, and SHALL say how CasparCG reads the number: matched against each card's slot position
first and its persistent ID second, the number itself carrying no marker. The alarm SHALL point at
where the number comes from — CasparCG's startup log on the playout machine, the search string
`Decklink devices found:`, and that the line beneath reads `<model> [slot] (persistent ID)` — and
SHALL say that finding no such line means the server saw no card or no driver.

The alarm SHALL NOT widen what it claims to know: it says nothing about a consumer that is present
but unhappy, which it cannot see. The bridge's stderr line for the same fault SHALL carry the same
two facts.

#### Scenario: The plant's declaration is called a hardware persistent ID

- **WHEN** the missing declaration names device `23487013`
- **THEN** the banner reads that the decklink is declared as `hardware persistent ID 23487013`, with
  the note that a slot index would be a small number such as 1

#### Scenario: A small number is called a slot index

- **WHEN** the missing declaration names device `1`
- **THEN** the banner reads that the decklink is declared as `slot index 1`

#### Scenario: The rule and the recipe are on the banner

- **WHEN** the alarm shows for any missing DeckLink
- **THEN** it says the number is matched against the slot position first and the persistent ID
  second, names the startup log and the search string `Decklink devices found`, and names the two
  brackets `[slot] (persistent ID)`

#### Scenario: Nothing new is claimed about health

- **WHEN** the alarm shows
- **THEN** it does not mention a reference signal, dropped frames or a consumer being unhappy
