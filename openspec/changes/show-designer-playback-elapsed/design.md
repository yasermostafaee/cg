## Design

The Designer transport owns a monotonic clock for the current playback session. It reads existing
playback state and uses local updates. The authored playhead and time-based content continue to
use their respective clocks. Pause preserves the elapsed value, and a stopped session resets it.
An outro continues counting until the session settles.
