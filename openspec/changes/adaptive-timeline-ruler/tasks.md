# Tasks — adaptive Timeline ruler (B-416)

## 1. Contract

- [x] 1.1 Register B-416 and require one grid line per readable label
- [x] 1.2 Define a duration-scaled maximum zoom that retains the short-project default

## 2. Designer

- [x] 2.1 Measure the Timeline viewport and choose one readable stride
- [x] 2.2 Render the visible numbered ticks and their matching ruler/body lines
- [x] 2.3 Let long compositions zoom until every frame has its own numbered line

## 3. Verification

- [x] 3.1 Cover 1,500 and 5,000-frame label counts, viewport adaptation and maximum-zoom stride one
- [x] 3.2 Chromium verifies 5,000 frames at fit and at single-frame zoom after horizontal scrolling.
- [x] 3.3 Designer checks and the full pre-push gate passed on `d6383de0`.
