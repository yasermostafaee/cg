## Decision

The installed shell launches the system HTTPS handler for the fixed company URL. Only the bundled
main window can invoke the command and the caller supplies no URL, arguments or executable name.
A browser deployment continues to use its own link and new-tab behavior. Neither route changes the
address or suppresses certificate checks.
