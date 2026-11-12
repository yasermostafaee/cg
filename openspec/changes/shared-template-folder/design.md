## Imported catalogue previews

CG Control can deliver a bounded embedded PNG alongside the registered version when importing
or reloading a package. The Bridge saves it separately, so a large source package can still
have a thumbnail. A bounded retained package can supply its embedded image or a scriptless
scene preview. The Bridge resolves the current channel's listed version for either source.

CG Control requests data for visible rows and shares it with the selected template's larger
Details slot. Template changes invalidate the old preview. A preview read failure leaves the
catalogue and its actions available, and an older Bridge keeps the existing icon layout.

Shared folder and catalogue use the same preview component. Its checkerboard is display chrome
behind transparent pixels. The scriptless still remains transparent and shares the host
element's color scheme so it can show that background. The artwork element fills the preview
slot's own box. This gives a scriptless frame the actual Shared folder tile viewport and keeps the
browser's intrinsic iframe size from clipping the lower part of the graphic.

Legacy packages use the same representative still as Designer export, including scoped defaults,
the sampled Preset and authored Live fallbacks. The Bridge reads bounded PNG or JPEG assets from the
package for that still. PNG remains implicit in the response for older packages and Bridges. A JPEG
entry carries its MIME alongside the image bytes. Paths, encoded size, decoded dimensions and content
hashes are checked before the browser receives an asset. The renderer and Bridge use the same
representative Sequence picture rule.
