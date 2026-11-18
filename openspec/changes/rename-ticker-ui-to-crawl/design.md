# Display wording only

Keep the legacy `ticker` element and template kinds, `ticker-items` binding, driver classes and
DOM markers. Apply Crawl only at the display boundary; newly authored elements start with that
name, while opening an existing project never rewrites its authored names or data.

Template browser search follows the public kind label. Exported package and HTML diagnostics
use Crawl; serialized scene/template types remain unchanged. Platform timer tickers and unrelated
technical terms are outside this change. The existing vertical Roll terminology is unchanged.
