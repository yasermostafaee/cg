## Decisions

- Reuse an existing matching single-plate preset or create one from the identified source. Creation starts with a full-raster editable solo and links it to the origin in one history edit. A solo preset can belong to one origin and moves from the normal Control preset picker to the numbered Focus strip. The authored geometry, crop, title and linked artwork travel with each destination.
- Validate eligibility against the exported live-source rectangles so deleted or changed plates cannot produce an invalid shortcut. An origin keeps its exact Return destination.
- Reuse the Control layout effect values, the numbered Focus controls and the verified direct Focus transition path. Keep the normal preset entry effect independent. Legacy presets without a Focus configuration continue to use their prior entry behavior.
