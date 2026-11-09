# Show startup motion during real loading

## Why

The owner reports a static installed splash and no longer wants the eight- and three-second minimum
holds. The inline page can show motion immediately and yield as soon as its app is usable.

## What changes

- Start a CSS loading sweep on the inline page in Designer and CG Control.
- Use completed phases for the percentage and dismiss at shell readiness, with the existing ceiling.
- Keep the settled scene for users who request reduced motion.

## Capabilities

- Modify `runtime-ui` and `desktop-delivery`. Affected PRD: P-078 and R-035.
