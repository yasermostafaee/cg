# Design

The composition's existing Outro frame driver paints the text keyframes and starts its Follow video
at the authored delay boundary. The video's existing driver plays the tail and the one-shot
element ledger bounds its completion. The scope waits for both before clearing. The final parent
exit also waits for nested compositions that own a Follow-video exit.

The video holds the start of its end-anchored tail before that boundary. With a fixed composition
end, adding delay shortens the tail. Extending the end by the same number of frames preserves the
original tail. Authoring scrub uses the same time window. Manual and unchecked Continue video,
and detached Sequence item and repeater-row transition owners, keep their existing exit policy.
