## ADDED Requirements

### Requirement: Fields are scoped per composition

Dynamic fields SHALL be owned per composition: each composition carries its own `fields` and `bindings`, and the inspector and preview SHALL show ONLY the open composition's own fields (plus its nested children's, aggregated — see below), never all fields across the project. Within a single composition data keys SHALL stay flat and unique (the duplicate-key warning still applies). A standalone composition (no nested instances) SHALL be unchanged — flat keys, no namespace, no migration of its own data.

#### Scenario: A standalone composition shows only its own fields

- **WHEN** a composition with no nested child instances is open
- **THEN** its data-key list (inspector and preview) shows exactly that
  composition's own fields, flat, with no namespaces

#### Scenario: A field added in one composition is not visible in another

- **WHEN** a field is added while composition A is open and then composition B is
  opened
- **THEN** the field appears under A and not under B

### Requirement: Nested child instances expose fields under a per-instance namespace

A composition nested as a child instance SHALL expose its fields in the parent under that instance's namespace, as a nested object, where the namespace key is the instance's user-editable name. Different children SHALL get different namespaces; the SAME child instanced twice SHALL produce two independent namespaces (e.g. `home`/`away`) whose values are set independently; arbitrary nesting depth SHALL nest deeper (`a.b.c`). The parent's data and GDD SHALL use nested objects (e.g. `{ "home": { "teamName": …, "score": … }, "away": { … } }`). Instance names SHALL be unique within a parent.

#### Scenario: A parent shows its children's fields grouped/namespaced

- **WHEN** a parent composition nests a child instance named `home`
- **THEN** the parent's fields include the child's fields grouped under the `home`
  namespace, and the data/GDD represent them as a nested `home` object

#### Scenario: The same child instanced twice has two independent namespaces

- **WHEN** the same child composition is instanced twice as `home` and `away`
- **THEN** the parent exposes two namespaces with independent values, so setting
  `home`'s field does not change `away`'s

#### Scenario: Instance names stay unique within a parent

- **WHEN** a second instance is added (or an instance is renamed) to a name already
  used by another instance in the same parent
- **THEN** the name is made unique (e.g. `Scoreboard 2`) so each namespace is
  distinct

### Requirement: Parent preview routes namespaced values to the right nested child

Setting a namespaced field value in a parent SHALL update the element inside the correct nested child instance. The runtime `update()` SHALL consume the nested data object and route each namespace to its instance, so the same child instanced twice updates independently; a missing namespace SHALL fall back to the child's field defaults.

#### Scenario: Updating a namespaced field updates the right nested child's element

- **WHEN** the operator sets `home.teamName` in the parent preview
- **THEN** the element inside the `home` instance updates to that value while the
  `away` instance keeps its own value
