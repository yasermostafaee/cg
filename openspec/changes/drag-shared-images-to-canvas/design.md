# Design — Shared Library image drag (D-204)

Project Assets and Shared Library use one drag writer carrying asset id, kind and source. Canvas drop
handling keeps its existing kind branches and passes the source only when building an Image.

Old Project Asset payloads did not carry a source marker. An absent or unknown marker therefore
continues to mean `project`; only the explicit `shared` marker creates a shared-source Image. This is
both backward compatible and fail-closed against accidentally resolving a project asset as shared.

The tile, not its nested `<img>`, owns the drag so grid and list views behave identically and the
browser does not substitute a raw image-URL drag. Fonts remain selectable library items but are not
Canvas image drag targets.
