# Fixed layer keyboard shortcuts

The Next binding clicks the row's existing Next button. That button already chooses between a
template step and a book page and handles permission, air state, limits and in-flight commands.

The Bridge advertises Next storage separately. The bank carries an optional sibling map of Next
chords, since the earlier action map rejects unrecognised verbs. The same validation combines both
maps for conflict and layer checks. Older consoles can read the bank and change unrelated settings.
Omitting the Next map in a bank update keeps its existing bindings. An empty map clears them.

An unconfigured bank uses function-key defaults for the intersection of its range with layers
88–99. Space is available for deliberate assignment, and any existing saved binding remains valid.
An explicitly saved map, even if empty, takes precedence. The shortcut dialog applies its map
against the published bank so edits to row names and visibility still belong to the Layers tab.

The Layers toolbar and the shortcut dialog share an in-memory enable switch. It uses the layer
visibility switch treatment and starts off on each launch, reload or change of operator. A switch change applies
immediately across the main and detached panels. The switch state is separate from assignment
drafts and saved bank settings. The shortcut dialog isolates aliases and numbers so the number
precedes the name in both reading directions.

While off, an assigned key press that reaches the workspace and passes the editing, overlay,
and repeat guards shows feedback directing the operator to Layer shortcuts in the Layers toolbar.
This path only emits feedback. The key follows normal workspace handling. The message uses the
feedback language.

Each Windows WebView2 controller in the console registers the same function-key routing when
created. Reparenting a pane between its docked slot and a floating window preserves that
controller and its handler. WebView2 passes F5 through as a layer key without reloading the
pane document. The router forwards F10 before Windows opens a menu. It reserves Alt+F4 while shortcuts are
enabled and the selected channel can use that binding, or while a shortcut is being recorded.
With shortcuts off, Alt+F4 follows the normal Windows close and confirmation path outside
recording. A key handled by the operating system does not reach the workspace notice handler.
The renderer checks focus, dialog state and row availability.
