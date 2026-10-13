# installer-design — design

## 0. The technology, compared (§0 of the prompt)

The bar (§1, §3): a frameless window of our own with its own title bar, Windows 11's rounded corners and
shadow, sharp at 100 / 150 / 200 %, motion that honours "Animation effects", full keyboard, the console's
palette and faces — and `/S`, its arguments and its exit codes unchanged, offline, the first screen
working on a Windows 10 without WebView2, at most 15 MB more per installer.

| Option                                                                                                         | The look it can reach                                                                                                                                                                                                                                                                                                                                                                           | WebView2 / .NET                                                                                                                                                                                                                                                                       | Size                                                                 | How `/S` and the exit codes stay                                                                                                                                                   | Effort                                               |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **(a)** NSIS, custom `nsDialogs` pages + skinning plug-ins                                                     | Classic dialog controls on a classic frame; skinning plug-ins restyle buttons and scroll bars ([nsDialogs](https://nsis.sourceforge.io/Docs/nsDialogs/Readme.html), [SkinnedControls](https://nsis.sourceforge.io/SkinnedControls_plug-in)). No vector drawing, no animation, no own title bar without hand-written Win32 through `System::Call`. **REF-2's level** — a skinned classic wizard. | none                                                                                                                                                                                                                                                                                  | ~0                                                                   | unchanged (same NSIS)                                                                                                                                                              | medium                                               |
| **(b)** WiX Burn + a custom bootstrapper UI (WPF)                                                              | Any WPF design ([WixStdBA](https://docs.firegiant.com/wix/tools/burn/wixstdba/)).                                                                                                                                                                                                                                                                                                               | .NET Framework for a managed BA                                                                                                                                                                                                                                                       | +1–3 MB, but the payload must be re-authored as MSI/chained packages | **Changes**: Burn's own switches are `-quiet` / `-passive` / `-log`, not NSIS's `/S` and `/D=`; its exit codes are Windows Installer's. The Playout team's `/S` chain would break. | high                                                 |
| **(c1)** A Tauri / WebView2 front end running today's NSIS silently                                            | Anything a web page draws                                                                                                                                                                                                                                                                                                                                                                       | **WebView2**: present on Windows 11 and most Windows 10, not all ([WebView2 distribution](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)). The first screen needs it, so CG Bridge's installer would have to carry the offline runtime (well over 100 MB) | CG Bridge: far over +15 MB                                           | unchanged (front end hands `/S` on)                                                                                                                                                | medium                                               |
| **(c2)** **A native front end in Rust — Win32 + Direct2D + DirectWrite + DWM — running today's NSIS silently** | Anything we draw: vector shapes and text at the monitor's DPI, our own title bar, DWM's shadow and Windows 11 corners ([rounded corners](https://learn.microsoft.com/windows/apps/desktop/modernize/ui/apply-rounded-corners)), our own motion                                                                                                                                                  | **none** (Direct2D/DirectWrite/DWM/UI Automation are Windows' own)                                                                                                                                                                                                                    | **~1–2 MB**                                                          | unchanged: with `/S` it runs the engine with the same command line and returns its exit code                                                                                       | high, but bounded: four pages, a handful of controls |
| (d) WPF on .NET Framework as the front end                                                                     | Anything WPF draws                                                                                                                                                                                                                                                                                                                                                                              | .NET Framework 4.6.2+ (in Windows 10)                                                                                                                                                                                                                                                 | ~0.5 MB                                                              | as (c2)                                                                                                                                                                            | medium; a new language and toolchain in the repo     |
| (d') egui / iced / Slint                                                                                       | Close to (c2)                                                                                                                                                                                                                                                                                                                                                                                   | none, but GPU-backed renderers (OpenGL/wgpu) are fragile on a VM without a GPU; Slint's royalty-free licence carries an attribution duty                                                                                                                                              | 3–10 MB                                                              | as (c2)                                                                                                                                                                            | medium                                               |

**Chosen: (c2).** It is the only option that reaches the look with **no runtime dependency at all**
(Windows 10 without WebView2 draws its first screen, measured on a runner where WebView2 is blocked by
policy), keeps every silent path the engine's own **by construction**, and costs about a megabyte per
installer. **One front end serves all three installers**: the product's words, tile and facts are data
appended by the packer. (a) was rejected because it can only reach a skinned classic wizard — the look §1
rules out. (b) changes the silent contract. (c1) cannot keep CG Bridge's installer within 15 MB offline.
(d) and (d') were close; (c2) won on zero dependencies and on staying within the repo's Rust toolchain.

The Rust standard library's floor is Windows 10 ([Rust 1.78](https://blog.rust-lang.org/2024/02/26/Windows-7.html)),
the same floor Node 22 (CG Bridge's runtime) and WebView2 apps already set. CG Setup resolves its Windows
10 1607+ DPI calls at run time, so nothing newer is required to start.

## 1. Architecture

```
CG-Bridge_<v>_x64-setup.exe  =  [ cg-setup.exe (icon, version, manifest stamped) ][ engine ][ config ][ tile ][ guide ][ index ][ footer ]
```

- **The engine** is the product's NSIS installer exactly as the build has always made it
  (`tools/bridge-installer/cg-bridge.nsi`; Tauri's bundler for the two apps). Nothing in it changes.
- **`cg-setup-pack`** copies `cg-setup.exe`, stamps the product's icon (the B-290 tile), its version
  resource and — for CG Bridge only — `requireAdministrator` (what `RequestExecutionLevel admin` gave the
  NSIS installer), refuses an engine whose ProductVersion is not the release's, then appends the blobs
  with their SHA-256s and a footer. A footer before an Authenticode certificate table is found too, so
  signing later needs no change.
- **`/S` (or, for the two apps, Tauri's `/P`)**: the command line is read as NSIS reads it (`cmdline.rs`,
  a port of `exehead`'s parse — `/S` only as its own token; `/D=` only after a space, to the end). CG
  Setup unpacks the engine to `%TEMP%`, verifies its hash, runs it with this installer's own `realcmds`
  byte for byte (attached to the caller's console, so the engine's console lines still reach it), waits,
  and exits with the engine's code. No window, no COM.
- **No `/S`**: the window. The engine is unpacked in the background while Welcome is up; Install runs it
  with `/S`, every argument the user gave, and `/D=<folder>` last and unquoted when the folder is the
  user's choice. If Direct2D cannot start, the engine's own interactive installer runs instead.

## 2. The pages and their words

All copy lives in `product.rs` and `model.rs`. Welcome: "Install <product>?" (or "Update …?" /
"Reinstall …?"), "Publisher: APASAI" (the spelling Windows shows in Installed apps and in the version
resource), "Version <x.y.z>" (stamped by the packer from `release-version.mjs`), two lines on what it
installs (CG Bridge: "A Windows service · ports 5280, 7911 · UDP 6251"), "Microsoft WebView2 runtime" when
it is missing, "Update from <old> to <new>. Your settings are kept." when older is installed, and "<app> is
open. Setup closes it." when it runs (the engine closes it silently, as it always did with `/S`).

**Location**: the two apps' folder is changeable on a first install (the system folder picker; the
product's folder name is added as NSIS's directory page always did); an installed app keeps its folder
(Tauri's engine restores it). CG Bridge's folders are facts: the Playout team's uninstall line names
`%ProgramFiles%\CG Bridge`. "Needed" is what the engine copies (measured by the packer); "Free on C:" is
read; a folder this user cannot write to, or a full disk, is one caution line and a disabled Install.

**Installing**: the bar follows the engine's REAL steps (`observe.rs`). CG Bridge's engine logs each
step it finishes to `install.log` — the step list is keyed to those labels and a test reads
`cg-bridge.nsi` to prove each is still logged. Tauri's engine logs nothing, so its steps are observed: the
WebView2 runtime registering itself, the main program's bytes landing (NTFS change time ≥ the start, since
NSIS stamps files with their build time), Installed apps naming the new release, the engine exiting.
Within a step the bar moves only on bytes; the window eases the shown value toward the real one and never
past it. **Cancel** is possible while the setup is still preparing (unpacking its engine) and disabled
from the moment the engine starts — stopping CG Bridge's service, killing a running app, installing
WebView2 or replacing files cannot be interrupted safely.

**Done**: the check mark; "<product> is installed / updated"; for CG Bridge, the service read back
("Service CGBridge · running"); the engine's first `WARNINGS:` line in caution ink, with "Open log".
"Launch when ready" (apps) / "Open CG Bridge status" (CG Bridge) is the one option, ticked; Finish acts
on it — the app through its Start-menu shortcut (its AppUserModelID), CG Bridge's `/health` in the
browser — both opened through the desktop's own shell, so nothing launched from CG Bridge's elevated
setup runs elevated. **Error**: the reason in words (CG Bridge: the step its log says failed; the apps:
the step that was running), "Open log" (CG Bridge's `install.log`; the apps' setup log in `%TEMP%`),
Close. Exit codes stay the engine's contract: 0 done, 1 cancelled, 2 failed.

## 3. The look

- **Palette**: every colour is a console `--r-*` token from `apps/runtime/src/renderer/theme.ts` or one
  of the splash's two brand constants (`apps/runtime/index.html`); a test resolves each against those
  files. ⚠ The prompt points at "the `@cg/ui` tokens": `@cg/ui` holds only the shared slate chrome
  (`packages/ui/src/tokens.ts`); the dark Apasai palette the splash and the sign-in card use is the
  Runtime's `--r-*` set, so that is what is used.
- **Faces**: what the splash and the sign-in card render with on Windows — `system-ui`, i.e. Segoe UI
  (the console's chrome stack reaches `system-ui` before any bundled Latin face), and Consolas for the
  splash readout's `monospace`. Exo 2 and Vazirmatn are the template and Persian faces; the setup has no
  Persian text.
- **The rail** is the splash: its ground, its relit APASAI mark (path data read from
  `apps/runtime/brand/apasai-logo.svg`), its wordmark (`CG` heavy, the role light, tracked 0.3 em), its
  brand-blue progress with its glow, and, drawn faintly at the foot, the product's own scene: CG Control's
  playout scene, CG Designer's artboard, CG Bridge's own (`installer-rail-art`, `P-067`; until `0.11.3`
  every rail drew CG Control's). **The page** is the sign-in card: its surface, its raised foot, its
  buttons and check box.
- **Icons**: the console's lucide set (1.21.0), drawn as paths with lucide's stroke.
- **The tile**: the app's own 512 px icon (B-290), rescaled once per DPI with a high-quality filter to
  the exact device size; CG Bridge, which has no window of its own, wears CG Control's dark tile.

## 4. What stays the engines'

- **The uninstallers**: Tauri's bundler writes the apps' uninstaller from its own template, and CG
  Bridge's is written by `cg-bridge.nsi`. Giving them this window means replacing the bundler's template
  — not cheap, and a fork to keep in step with Tauri — so the uninstall pages stay the classic ones (the
  prompt allows it; the report says so).
- **Everything installed**: the service, its rules, WebView2 when missing, the shortcuts and their
  AppUserModelIDs, the uninstall entries — all written by the unchanged engines.

## 5. Proof

- Unit (`cargo test -p cg-setup`): the NSIS command-line parse; the trailer (signed and unsigned); the
  progress model against `cg-bridge.nsi`; the pages' words; the palette against `theme.ts`; the version
  resource; the SVG paths of the mark and the icons.
- Clean Windows (`desktop.yml`): every silent path against the engine alone and the installer (same exit
  codes); each installer driven through UI Automation — fresh, update, error — every page captured;
  "Launch when ready" starts the app; an update keeps the settings; each first screen with WebView2
  blocked by policy and no WebView2 module loaded, on Server 2022 (Windows 10's code base, square edge)
  and Server 2025 (Windows 11's, rounded corners); the keyboard; Welcome at 150 % and 200 %.
