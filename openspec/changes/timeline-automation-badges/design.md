# Design — Timeline automation badges (D-203)

The Timeline remains a compact summary rather than a second editor. A filter-shaped amber badge
identifies one or more Value Rules stored on the element. A milestone-shaped violet badge identifies
Step participation.

Step participation is relational: it includes the countdown that owns the Step set and every element
named by a Step or Before-step change. This lets the author discover both where the sequence is
configured and which layers it can alter. The query walks the same authored scene/composition
documents that the existing Steps inspector uses; it does not infer participation from names.

Badges are read-only, have accessible labels and do not affect layer selection, ordering or output.
