## Decisions

Use an optional `textOffsetY` in scene pixels, signed like the Ticker image separator input.
Vertical alignment establishes the original position. Apply the offset to the drawn content inside
the established box. Preserve line wrap, fit measurements and the element's transform.

Ticker item spans use the same text offset at rest and during the crawl. The image separator retains
its own offset. Clock moves the time span and keeps the punctuation adjustment relative to it.
Sequence applies the correction to text pages alongside the normal text-ink and transition logic.

An Auto size Text object retains the configured offset for when it returns to a fixed-size box.
A nonzero applied offset raises the VCG minimum renderer contract; old projects remain valid.
