## ADDED Requirements

### Requirement: Audit log SHALL use the selected interface language and date calendar

Audit SHALL use the console interface language for filters, date controls, actions, results, event state and technical labels. Settings SHALL offer Gregorian, Jalali and Lunar Hijri as an Audit calendar preference independent of the selected languages and template calendar. A new console SHALL use Gregorian until changed.

#### Scenario: Localized Audit details

- **WHEN** the operator opens Audit with a Persian or Arabic interface **THEN** Audit uses that language and right-to-left layout while IDs, command data and copied event JSON remain exact.

#### Scenario: Calendar choice is used in dates and filters

- **WHEN** the operator selects a date calendar in General settings **THEN** Audit rows, details and date filters use it, and Lunar Hijri follows the station correction.

#### Scenario: Same days filter the same records in each calendar

- **WHEN** the operator enters equivalent days in the different calendars **THEN** the filter sends the same start and end of the local day as UTC instants. Invalid and reversed dates do not issue a filter request.

#### Scenario: Calendar choice survives restart

- **WHEN** the operator reopens CG Control **THEN** the saved Audit calendar is restored independently of interface, feedback and template calendar choices.
