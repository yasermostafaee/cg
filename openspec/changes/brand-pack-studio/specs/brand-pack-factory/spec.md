## ADDED Requirements

### Requirement: The Studio runs only on a local configurable port

The factory SHALL provide a browser Studio command that accepts a port and workspace, binds only to
the IPv4 loopback address, prints its local URL and exposes no installable desktop application or
non-loopback host option.

#### Scenario: The operator starts the Studio

- **WHEN** the operator starts the Studio with port `4319`
- **THEN** the interface is available at `http://127.0.0.1:4319` on that computer
- **AND** no listener is created on a LAN address

#### Scenario: A non-loopback Host header reaches the listener

- **WHEN** a request identifies a non-loopback host
- **THEN** the Studio refuses it without serving private workspace data

### Requirement: Customer work is persisted in one external workspace

The Studio SHALL store each customer's Brand Kit, pack recipe and append-only delivery directories
beneath one selected on-machine workspace outside the product repository. It SHALL restore valid
customers and their delivery history after restart, use atomic document writes, and keep customer
ids immutable after creation.

#### Scenario: The Studio restarts

- **WHEN** the Studio is restarted with the same workspace
- **THEN** every previously saved valid customer and delivery is listed again

#### Scenario: The workspace is inside the repository

- **WHEN** startup resolves the requested workspace inside the product repository
- **THEN** startup fails before listening or writing files

### Requirement: The browser edits the canonical Factory documents

The Studio SHALL provide a Persian/RTL structured interface for customer identity, targets, semantic
colours, licensed fonts, brand assets, template recipes, explicit mappings and preview data. Saving
SHALL validate the existing `BrandKitSchema` and `PackRecipeSchema`, write those canonical JSON
documents, and return readable field-specific errors.

#### Scenario: The operator saves valid customer configuration

- **WHEN** all required Brand Kit and recipe fields pass their canonical schemas
- **THEN** `brandkit.json` and `pack.json` are atomically written under that customer

#### Scenario: A required font licence is not confirmed

- **WHEN** the operator attempts to save a font without confirmed embedding rights
- **THEN** the save is refused and the previous valid documents remain intact

### Requirement: The Studio inspects masters without modifying them

The Studio SHALL read an external `.cgproj` through the canonical project unpacker and present its
composition ids/names/resolutions, unique colour tokens and packaged image/font asset identities for
mapping. It SHALL NOT copy, rewrite or infer brand choices for the master.

#### Scenario: A master project is inspected

- **WHEN** the operator supplies a readable external `.cgproj`
- **THEN** the Studio returns its mapping metadata and leaves the source bytes unchanged

### Requirement: Studio builds use the canonical engine and local delivery history

Validation and build SHALL use the existing Factory prepare/delivery pipeline. A normal Studio
build SHALL enable real-browser visual QC and create a new timestamped delivery beneath the
customer; it SHALL NOT overwrite an older delivery or publish anything into Designer.

#### Scenario: A customer pack builds successfully

- **WHEN** all selected templates validate, render, play and stop successfully
- **THEN** a new customer delivery contains the verified `.vcg` files, phase captures, contact
  sheet and reports
- **AND** the delivery appears in the Studio history

#### Scenario: Designer opens after a Studio build

- **WHEN** customer templates have been generated in the Studio workspace
- **THEN** Designer's existing first-page samples are unchanged and no customer template is listed
