# runtime-caspar-bridge — confined text-source reader

## ADDED Requirements

### Requirement: CG Bridge reads authored text sources only below its configured root

CG Bridge SHALL expose an authenticated `textSources.read` request channel whose input is a relative
path and whose successful result is the current UTF-8 content, a display name and the canonical full
path for operator verification. The full path SHALL remain response-only and SHALL NOT be persisted
into the template. The bridge SHALL
resolve it below `textSourceRoot`, defaulting to `<stateHome>/text-sources`, and MAY use a configured
UNC/network root.

The bridge SHALL reject absolute paths, traversal, directories, oversized files, and paths whose
canonical target escapes the configured root (including through a symlink/junction). A rejected or
failed read SHALL return no file bytes.

The browser development launcher SHALL allow its fake bridge to use an explicitly supplied shared
text-source root so Designer and CG Control can test the same authored relative path. The launcher
SHALL NOT delete or rotate that external root when refreshing fake station state.

#### Scenario: A repeated read sees a later save

- **WHEN** an allowed file is read, overwritten by another process, and read again
- **THEN** the second response contains the later UTF-8 content

#### Scenario: Traversal and link escape return no bytes

- **WHEN** the request is absolute, contains traversal, or resolves through a link outside the root
- **THEN** the bridge rejects the request and returns no file content

#### Scenario: Missing or unreadable file is a channel error

- **WHEN** the relative file is absent, not a regular file or cannot be read
- **THEN** the request fails with a legible path-specific error and no content

#### Scenario: Browser development uses the newsroom share

- **WHEN** the fake station is launched with an explicit shared text-source root
- **THEN** the fake bridge resolves authored relative filenames below that root and refreshing fake
  state leaves the external folder untouched
