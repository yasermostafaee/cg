## Decisions

- The workspace has one channel selection, layer selection, draft store and command authority. Each detached window renders its assigned panel. Layout changes do not send playout commands.
- Maximize and restore affect the detached window on its own display. It has no companion modes. The main window keeps the existing companion layouts for docked panels.
- Selecting the current row with Inspector detached is idempotent. Selecting a different row updates the same Inspector.
- Exit floating returns the panel to its prior slot. The detached title bar and keyboard close route cannot dismiss the panel independently. Main-window exit owns session shutdown and the cleanup of detached windows.
- With both monitors docked, the toolbar has a combined action and compact PVW and PGM buttons. The combined action hides both when both are shown and shows both otherwise. Each individual button changes the visibility of its own pane.
- With one monitor detached, the toolbar names and controls the docked monitor. With both detached, the toolbar omits monitor visibility controls. Exit floating shows the returning pane and preserves its sibling's visibility.
- Monitor visibility is session-only and starts at the shipped defaults. Maximize and restore use the existing focus behavior, and the visibility actions leave selection and drafts available.
- Profiles store physical placement, detached bounds and display identity locally. Windows whose old display is missing return to visible desktop space.

## Native verification

The main React workspace owns the bridge and renders each panel into a persistent same-origin
WebView2 document. The shell changes the Win32 parent and frame of that whole window when it
docks or floats. This keeps the panel's React tree and the preview browsing context mounted.
Docked geometry uses physical pixels relative to the main client area. Detached geometry uses
physical restore bounds, maximized state and display identity. The shell clamps restored
placements to an available work area. Pane commands are available from the main window.

Docked native surfaces yield to main-window dialogs. Full session gates also cover detached
panes. A docked panel's full dialogs use the main document, while popovers use the triggering
panel's document. Detached dialogs stay in their own windows. The renderer keeps one shortcut
dispatcher across all panel documents.

A main-window tooltip or command toast that crosses a visible docked WebView is also drawn in that
WebView at the same physical position. The WebView clips its copy to its own bounds.
The main document owns the accessible message and dismissal. Copies pass pointer events
through to the panel and stay within docked windows. A notice addressed to a detached
panel's document appears in that panel's window.

The Windows prototype exercised the same HWND through dock, float, maximize, restore,
independent close prevention and redock. The preview iframe, WebRTC connection and running
video and audio survived. Two-display and mixed-DPI verification remain part of the installed
workspace acceptance.
