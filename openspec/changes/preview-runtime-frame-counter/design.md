# Design

Expose an optional read-only root-frame observer, forward deduplicated Preview iframe reports, and display them beside elapsed time. Static roots retain an authored display projection.

The integration is limited to the existing interaction contract; unrelated owner work is not copied. Runtime observation is read-only and exceptions in observers cannot change broadcast playback. Scene edits during canvas lifecycle rebuild and re-arm the authoring runtime.
