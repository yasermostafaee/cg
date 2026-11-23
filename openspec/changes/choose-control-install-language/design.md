# Design

CG Control uses the native setup window before WebView2 is available. The language selector is therefore a native first page, and the remaining wizard reads the same selection. The default is English. Persian and Arabic use right-to-left reading order and keep technical paths, versions and sizes in their normal order.

After a successful interactive Control installation, setup verifies the installed application and stores its language code in a small UTF-8 file next to the executable. This lets a later launch from Explorer read the same selection, including when Launch when ready is unchecked. Replacing the file is atomic. An ordinary uninstall removes it. An unattended update preserves it.

Tauri reads the file and supplies one allowlisted language to the webview at document start. The startup screen and app can use it before the bridge is available. A valid saved language for each preference takes precedence. The other preference can still inherit the installer choice. The default remains English if both sources are unavailable.
