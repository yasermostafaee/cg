# designer-video-element — delta (the preview keeps media playing across a rebuild: B-137)

## ADDED Requirements

### Requirement: A playing video survives a preview scene rebuild

An edit that rebuilds the preview's scene SHALL NOT leave a video permanently unable to play. The
preview may legitimately pool a live `<video>` across a rebuild and transplant it back over the
freshly built one, so that a transform-only edit never re-fetches the media; when it does, the
lifecycle driver SHALL command the node that is actually in the document, not the node it captured
when the scene was built.

The binding SHALL be re-resolved by the element's `data-cg-element-id` whenever the captured node
reports that it is no longer connected to a document, and SHALL be HOST-AGNOSTIC — it SHALL NOT
depend on knowing which host performed the reparenting, so any harness that reparents nodes is
covered. A node that is merely MOVED within the document SHALL NOT be re-resolved.

A rejected `play()` SHALL be reported rather than swallowed, naming the element, and SHALL be
reported at most ONCE per element so a per-tick retry cannot become a per-frame log.

#### Scenario: The video keeps playing after an edit rebuilds the preview

- **WHEN** a video is playing in the preview and an edit posts a scene rebuild, and the operator
  plays again
- **THEN** the `<video>` visible in the preview document is not paused and its `currentTime`
  advances

#### Scenario: The trigger is the rebuild, not the companion element

- **WHEN** a scene carrying a video and NO other animated or timeline-driving element has its
  preview rebuilt by a session timing change, and the operator plays again
- **THEN** the video is not paused and its `currentTime` advances — the freeze is a property of the
  rebuild, not of any companion element on the scene

#### Scenario: A rejected play is reported once, naming the element

- **WHEN** a video element's `play()` is rejected and further play attempts follow
- **THEN** the rejection is logged once for that element, identifying it, and is not repeated per
  attempt

### Requirement: The Lottie map handed to a preview is scoped to that scene

The parsed-Lottie map posted to a preview SHALL contain only the assets the scene being previewed
actually references, not every asset parsed since the project opened. The preview forces a scene
rebuild whenever it receives a non-empty Lottie map, so a whole-cache map keeps forcing rebuilds
after the Lottie element is gone — which is what made a rebuild-induced freeze STICKY, unable to be
undone by undoing its cause.

Removing the last Lottie element from a scene SHALL therefore make that scene's posted map empty,
even though the parsed asset legitimately remains cached for re-use.

#### Scenario: Deleting the Lottie stops forcing rebuilds

- **WHEN** the last Lottie element is removed from a scene whose asset is still in the module cache
- **THEN** the map posted for that scene is empty, so the preview's rebuild-forcing condition is
  false
