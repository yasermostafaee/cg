# Design

`holdMs` measures a Timed hold from Hold entry. `contentEndDelayMs` measures an on-screen
extension after the effective content-completion promise resolves during Hold.
`delayMs` measures the off-screen gap between completed passes. The Inspector groups the
new field with the composition-owned settings and uses milliseconds, like the other timing
inputs. The schema and input share the browser timer's representable range.

The controller reuses its Hold timer and pause bookkeeping. On expiry it follows the usual
automatic exit path, including draining a running Middle loop to the Out point. Stop, reset and
remove clear the pending timer using the existing cancellation path. Each pass registers a fresh
completion wait. The fallback for a Content-driven choice without effective drivers still uses
the authored Timed duration.

The Azan starter keeps its existing manual default. To make it close by itself, author the
entry composition as Auto-out and Content-driven, enable the nested countdown as a hold driver,
and set Exit delay. The zero Step already reveals the announcement and the clock completes at zero
with its current Hide digits behavior.
