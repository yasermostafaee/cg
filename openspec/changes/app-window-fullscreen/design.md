## Decisions

- Share the fullscreen operation and state observation alongside the existing shared desktop window controls. The Windows shells grant their respective main windows permission to read and set native fullscreen.
- The browser requests fullscreen on its document root during the user action and follows the browser's fullscreen change event. CG Control uses that same path in WebView2, which applies fullscreen to the native window. This lets the source media preview enter and exit fullscreen inside the app's fullscreen session. The native command remains available as a fallback.
- The app window resizes in place. Docked Control WebViews follow the existing slot geometry. Detached windows keep their placements and the existing panel maximization modes remain independent.
- Designer installs its F11 handler on the main document. The CG Control toggle is a footer button. Layer shortcuts retain their existing handler and bindings.
