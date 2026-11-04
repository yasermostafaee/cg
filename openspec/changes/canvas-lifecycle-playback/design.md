# Design

Ordinary forward Play uses runtime play/pause/resume. Root telemetry updates the cursor without scrub feedback. Reverse, Preview loop and ping-pong remain explicit playhead-only tools.

The integration is limited to the existing interaction contract; unrelated owner work is not copied. Runtime observation is read-only and exceptions in observers cannot change broadcast playback. Scene edits during canvas lifecycle rebuild and re-arm the authoring runtime.
