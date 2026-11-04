# Design

Add Import project beside New project; reuse the File → Open operation, and preserve Landing on cancellation.

Landing and File → Open call the same shell opener. Cancellation is a no-op: it creates no temporary
project and leaves Landing visible. This action changes neither project format nor persistence.
The current browser/gallery reconciliation is tracked separately in
`../reconcile-current-designer-gallery/`; its merged-build validation cannot be inferred from the
earlier Landing-only checks.
