# Use Word documents as text sources (R-116)

## Why

An operator needs to use newsroom copy from Word as well as TXT in a ticker or another text-backed field.

## What Changes

- Offer DOC and DOCX for new text file picks and remove the JSON filter.
- Read supported Word content as plain text on local and Bridge reads, including reload.

## Capabilities

### Modified Capabilities

- designer-dynamic-fields

## Impact

Keep the original path grants and byte limits. Decode by file type at the existing source read boundary. Cover browser picks, re-reads, and retained Bridge paths; Word processing must never run document contents as code.
