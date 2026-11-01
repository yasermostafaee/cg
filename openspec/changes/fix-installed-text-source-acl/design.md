## Context

Tauri custom commands have two separate declarations: `main.rs` registers the Rust handler, while
`build.rs` declares the command so Tauri generates an `allow-<command>` permission. The bundled
window receives only the permissions listed in its capability JSON. The two text-source handlers
were added only to `main.rs`, so installed calls were rejected before entering Rust.

## Decisions

### 1. Grant only the two intended commands to the Designer window

Add `pick_text_source_file` and `reload_text_source_file` to the Designer app manifest and add the
generated `allow-pick-text-source-file` and `allow-reload-text-source-file` permissions to
`capabilities/designer.json`. No filesystem plugin or broad shell permission is introduced: picker
selection remains native, and Reload still accepts only paths remembered by that app session.

### 2. Pin source parity and packaged execution separately

A release-tool unit test extracts every command declared by each desktop `build.rs`, converts its
generated allow-permission name back to the Rust command name, and requires exact parity with that
app's capability. This catches the omission before packaging for Designer and CG Control.

The Windows installer smoke invokes Designer's reload command with a deliberately absent path. A
path-specific native error proves the packaged window crossed ACL; an ACL error fails the smoke.
The picker itself is not invoked by automation because opening an OS dialog would block unattended CI.

## Risk

The permissions expose only the already-registered commands. `reload_text_source_file` retains its
session allow-list, so granting it does not create an arbitrary absolute-path reader.
