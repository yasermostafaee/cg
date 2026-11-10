# Design

Derive the variant after the picker returns the actual name, using a separate SHA-256 namespace keyed by the scoped composition id and a normalized, case-insensitive basename. Keep the authoring document untouched. A file renamed outside Designer retains its package identity. Browser downloads that offer no save dialog retain the base id.
