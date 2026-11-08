## Decisions

- Store `offsetY` in scene pixels on the image-separator object. Negative moves up; positive moves down.
- Keep it optional rather than defaulted in the stored schema so existing projects round-trip without noise;
  every renderer interprets absence as zero.
- Apply the offset with a child transform. It changes neither the authored box nor the treadmill's measured
  horizontal width, and it composes with middle alignment's existing `translateY(-50%)`.
- Text separators are unchanged: their baseline remains controlled by ticker typography and vertical align.
