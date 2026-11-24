## Decisions

- The workspace has one channel selection, layer selection, draft store and command authority. Each detached window renders its assigned panel. Layout changes do not send playout commands.
- Maximize and restore affect the detached window on its own display. It has no companion modes. The main window keeps the existing companion layouts for docked panels.
- Selecting the current row with Inspector detached is idempotent. Selecting a different row updates the same Inspector.
- Exit floating returns the panel to its prior slot. The detached title bar and keyboard close route cannot dismiss the panel independently. Main-window exit owns session shutdown and the cleanup of detached windows.
- Profiles store physical placement, detached bounds and display identity locally. Windows whose old display is missing return to visible desktop space.

## Native verification

The installed shell currently creates only one WebView2 window. In an isolated Chromium prototype,
moving an active preview iframe into a second window replaced its document and lost its running
state. Before connecting the production workspace, test the native window, render ownership,
preview continuity, audio ownership and the close guard in installed CG Control on two displays.
