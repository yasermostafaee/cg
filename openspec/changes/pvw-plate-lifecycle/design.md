## Decisions

The stage owns one local `playing` fact driven by Play and Stop. Markers consume that same fact rather than inspecting iframe DOM. Next does not change visibility. A subject/page change resets the markers to hidden until the next Play.
