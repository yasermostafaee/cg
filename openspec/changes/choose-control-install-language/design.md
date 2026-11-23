# Design

CG Control uses the native setup window before WebView2 is available. The language selector is therefore a native first page, and the remaining wizard reads the same selection. The default is English. Persian and Arabic use right-to-left reading order and keep technical paths, versions and sizes in their normal order.

After a successful interactive Control installation, setup verifies the installed application and stores its language code in a small UTF-8 file next to the executable. This lets a later launch from Explorer read the same selection, including when Launch when ready is unchecked. Replacing the file is atomic. An ordinary uninstall removes it. An unattended update preserves it.

A deliberate radio selection records an installation request along with its language. An interactive upgrade that accepts the initial radio without selecting a language keeps the existing seed, just as an unattended update does. A fresh installation without an explicit choice records the bare English default. Existing bare seed files remain valid.

Tauri supplies the allowlisted language and any verified request to the webview at document start. The splash previews an unapplied request before React starts. At startup, the console writes both language values and the applied request together. The request is applied once, so later changes in General survive restarts. Without a new request, each valid saved language takes precedence over its installer default. The default remains English when both sources are unavailable.

Build e1e54b06 reproduced the upgrade problem on Windows: Setup saved Persian before Finish ran the correct executable, but the existing console profile held English for the interface and Persian for feedback. The one-time request makes the installer action effective for that launch as well as the next launch from Explorer.
