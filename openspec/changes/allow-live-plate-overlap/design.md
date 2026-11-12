## Authoring

The composition carries an optional `allowLivePlateOverlap` setting. Absence means off.
The exported composition's setting applies to co-visible plates in its render tree, including
each nested instance and the plates visible with each preset. Designer and export use the
authored paint order of those instances. A valid linked Reveal retains its mask and explicit
layering behavior. The opt-in leaves the other preflight checks in force.

## Programme

The live-source carrier uses `platePaintOrder` for the plain composition and each preset.
An opted-in VCG requires Runtime 1.2.3. When the carrier declares a plate order,
CG Control checks the Bridge's `livePlatePaintOrder` capability before import or rebuild.
Bridge needs a placement plan that realizes that order and the existing producer and
mask dependencies. When presets impose incompatible requirements, a plan may only proceed
when it fits the declared band and can safely retain or change the required producers. The
planner verifies physical producer layer order and refuses before changing programme when
it cannot satisfy those conditions.
