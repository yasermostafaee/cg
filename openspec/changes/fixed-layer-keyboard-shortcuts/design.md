# Fixed layer Next shortcut

The Next binding clicks the row's existing Next button. That button already chooses between a
template step and a book page and handles permission, air state, limits and in-flight commands.

The Bridge advertises Next storage separately. The bank carries an optional sibling map of Next
chords, since the earlier action map rejects unrecognised verbs. The same validation combines both
maps for conflict and layer checks. Older consoles can read the bank and change unrelated settings.
Omitting the Next map in a bank update keeps its existing bindings. An empty map clears them.

An unconfigured bank uses function-key defaults for the intersection of its range with layers
88–99. An explicitly saved map, even if empty, takes precedence. The shortcut dialog applies its
map against the published bank so edits to row names and visibility still belong to the Layers tab.

The Windows shell lets function-key events reach the console before WebView2 applies its browser
shortcuts. It forwards F10 before Windows opens a menu. It reserves Alt+F4 while the selected channel
can use that binding or a shortcut is being recorded. The renderer checks focus, dialog state and
row availability. The window's close controls still use the existing close confirmation.
