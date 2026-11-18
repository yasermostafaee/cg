## ADDED Requirements

### Requirement: Public scrolling text wording

Designer and CG Control SHALL name the horizontal scrolling text tool and displayed kind Crawl,
including tool actions, default element name, Inspector, preview labels, help and export diagnostics.

#### Scenario: Author and preview a Crawl

- **WHEN** the author selects Crawl and creates a scrolling text element
- **THEN** its default name and Inspector use Crawl and its content remains editable in Preview

#### Scenario: Display legacy template kinds

- **WHEN** a package declares template type `ticker`
- **THEN** the template browser displays Crawl and a search for Crawl finds it

### Requirement: Legacy storage compatibility

The rename SHALL preserve schema types, API keys, binding kinds, asset paths, runtime DOM markers
and user-authored names. Exported scenes and packages SHALL remain compatible with existing files.

#### Scenario: Export the renamed tool

- **WHEN** an authored Crawl is bound to a list field and exported
- **THEN** the scene retains `type: ticker` and `kind: ticker-items` while the default name is Crawl

#### Scenario: Keep an existing template's name

- **WHEN** a legacy template is shown and searched by its public kind
- **THEN** its authored name and stored `ticker` template type remain unchanged
