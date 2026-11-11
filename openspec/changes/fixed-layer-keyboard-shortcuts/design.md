# Fixed layer Next shortcut

The Next binding clicks the row's existing Next button. That button already chooses between a
template step and a book page and handles permission, air state, limits and in-flight commands.

The Bridge advertises Next storage separately. The bank carries an optional sibling map of Next
chords, since the earlier action map rejects unrecognised verbs. The same validation combines both
maps for conflict and layer checks. Older consoles can read the bank and change unrelated settings.
Omitting the Next map in a bank update keeps its existing bindings. An empty map clears them.
