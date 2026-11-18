## Implementation

- [x] Rename public tool, Inspector, preview, help and diagnostic strings to Crawl.
- [x] Display and search legacy template kinds as Crawl without changing persisted data.
- [x] Verify affected unit/DOM tests and export compatibility: Designer 67, Runtime 55,
      single-file export 31 and starter templates 72 tests passed.
- [x] Run fresh built Edge entry points: Designer 7 cases (authoring, Preview, separator,
      nested starters and legacy HTML type/binding), plus Runtime Crawl template search/details
      and both seeded row-refusal cases: 10 browser cases total.
- [x] Complete string and component sweeps, formatting, typecheck and lint: two axes across
      the declared non-empty app/package scopes; 714 production files also audited by literal
      syntax, with no remaining public Ticker wording. Internal keys and authored legacy names stay.
- [ ] Complete the authoritative Linux E2E after integration; no push/build is requested here.

Local logs are in `C:/Users/yaser/AppData/Local/Temp/cg-crawl-*-{dom,edge,typecheck}.log` and the
`cg-crawl-{export-test,starter-test,final-build}.log` siblings. Both apps built and typechecked.
Scoped lint passed with one existing unrelated template-picker accessibility warning.
