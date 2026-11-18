# Design

The Bridge revokes the old stream as soon as its verified target changes. A bounded,
short-lived owner/actor/channel/source-scoped record lets a later probe of that old
preview ID distinguish a verified same-fingerprint A/B handoff from an ordinary refusal.
The hint is reauthorized when read and is erased by explicit close, logout, expiry and
owner cleanup. It never grants access to a stale stream.

The UI first probes the held ID after a stream failure; it does not close away the
handoff evidence beforehand. A verified hint permits exactly one fresh request without
an ID. Normal lease renewal follows the same path. An unchanged or terminal reply does
not authorize fresh acquisition. A decode failure without verified handoff proof remains terminal.

Recovery preserves position until the matching replacement video's metadata arrives.
Play/Pause and mute intent remain independent of lease readiness. A generation fence
closes and discards late replies after Stop or effect cleanup; a later explicit Play
queues a new request rather than accepting the cancelled handoff's response. Proxy
preparation uses the existing bounded poll. No recovery sends programme commands.
