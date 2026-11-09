## Ownership and selection

The selected Look follows the active Look until the operator chooses a tab in Inspector. The same selection drives Look inputs and the field list. The VCG Look carrier exposes the managed composition's instance ID. Inspector matches that ID to the top-level dynamic field group and its descendants. Root-owned fields and groups outside the managed Looks are shared. Names, order and source IDs play no part in ownership.

Filtering only changes which editors are rendered. All values continue to use the row's existing draft, Update and Discard paths. The instance ID is optional in the catalogue protocol. A catalogue without complete ownership metadata keeps all its field groups visible. With an updated CG Control and Bridge, Reload derives the IDs again from a source package that contains managed Looks.
