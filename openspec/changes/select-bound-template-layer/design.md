# Select the destination layer after binding a template

Pass the new item's id to the exact-slot load and select that id on acceptance through the row's
existing selection callback. The Inspector resolves the selected item from the published stack.
The row click handler ignores events from modal portals so dismissing the picker preserves selection.
