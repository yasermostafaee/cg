# Composition binding ownership

Use the element IDs produced during duplication to remap the copy's bindings. A field ID is
local to its owning composition, and its metadata and render bindings travel with that owner.
Changing the copy's Data key follows the existing rename path.

For legacy data, find element IDs inside the binding's owning document, including nested groups.
Remove the dangling element references. Remove a field only if all its bindings were dangling
and it has no other authored consumer. Document-level targets and authored unbound fields remain
available. Apply this correction after legacy field migration on project open and before deriving
a VCG's operator metadata and rendered page.
