# Instance title visibility

Store hidden direct text IDs on the composition instance. The element's definition and field
bindings remain shared. The renderer hides a matching direct text node without dropping the
binding or applying the override to a different composition instance. The Designer canvas,
export thumbnail and runtime all use the same render path.

The setting defaults to the authored visibility. A VCG that uses the setting declares runtime
1.2.5 so that an older runtime cannot accidentally display a title that was hidden by the author.
