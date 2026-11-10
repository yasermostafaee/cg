# Tasks

- [x] Confirm safe bounded DOC and DOCX extraction in browser and Bridge.
- [x] Apply it to browser and native selection and re-read; hide JSON from the visible format choices, while keeping existing structured-data bindings readable.
- [x] Decoder and Bridge reader tests cover Persian DOC/DOCX, bad files and legacy text reads.
- [x] Chromium on Node 22 verified the ticker picker offers TXT, DOC and DOCX, and omits JSON.
      Initial read and Reload preserved Persian paragraphs. A damaged re-read kept applied data.
- [x] Record the carrying Linux E2E. The [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/42873144431/job/130029489197) step passed on `c560f8cd`.
