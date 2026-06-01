# Bugs — backlog

Bug reports. Unlike features, every bug needs a **repro** — that's what lets
Claude reproduce, fix, and add a regression test. See `README.md` for IDs and
statuses.

## Bug format

Copy this block per bug (use `B-` IDs):

```md

## [~] B-001 — panels position and design  ⟨priority: high⟩ — folded into `openspec/changes/add-animation-timeline-dock/`
**Repro:**
1. فونتها و تکستها درشت هستن
2. بعضی مقادیر و آیکونها در پنل پراپرتی وجود ندارند
**Expected:** دقیقا مثل تصاویر که در تسک D-006 به آنها اشاره شده کل پنلها و دیزاین پیاده سازی شود
**Actual:** all pics are related to D-006:  `docs/designer-guide/sample-assets/D-006-pic-*`
**Env:** Browser + app (e.g. Chrome / Designer dev) — and whether it reproduces
in the latest `main`.
**Notes:** check this website https://app.loopic.io/studio and crawl and see all the codes, i have got those screenshots from this website


## [~] B-002 — point frames action   ⟨priority: high⟩ — folded into `openspec/changes/add-animation-timeline-dock/`
**Repro:**
1. درست کار نکردن پوینتها
2. عدم نمایش پراپرتی درست مربوط به پوینتها
**Expected:** 
وقتی روی یک پوینت کلیک میکنیم باید در قسمت لایه ها هم رنگ آیکون پوینت در لایه مربوطه زرد شود و همچنین در بخش پراپرتی یعنی پنل سمت راست باید آیکون پونت وجود داشته باشه
دقیقا مثل تصاویر قرار داده شده
چیزی که الان نمایش داده میشه زمانی که روی پوینتها کلیک میکنیم مناسب زمانیست که دابل کلیک کنیم نه کلیک

برای هر پوینت باید مقدار متفاوت وجود داشته باشه یعنی اگر در لایه positionx 3 تا پوینت داریم هر کدوم باید بتونن مقادیر متفاوت داشته باشن
**Actual:** What happens instead (error text / screenshot path if any).
**Env:**  
**Notes:** تصاویر مربوط به تسک D-006 رو با دقت بسیار بسیار بالا بررسی کن


## [~] B-003 — point frames style   ⟨priority: high⟩ — focused fix
**Repro:**
1. framepoint color style is wrong

**Expected:** 
❯ 
A- We have 2 states of a framepoint on properties area on right panel and on the left of the timeline area: 
    1- Empty: if a point exist or not it just shows an empty point.
    2- Index is exactly on the same frame with a point: point on properties areas must be yellow.

B- We have 2 states of a framepoint on the timeline area:
    1- all framepoints are yellow.
    2- A point is selected: use a blue border around the selected point and also the line after that.

just use a curve tiny line on the line between framepoints not a "f" letter.

**Actual:** 
**Env:**  
**Notes:** see screenshots in: `docs/designer-guide/sample-assets/B-003-pic-*`

## [x] B-004 — rotation style   ⟨priority: high⟩ 
**Repro:**
1. when change the rotaion of a shape or text the transition border and handle wont be changed position.

**Expected:** 
work correctly

**Actual:** 
**Env:**  
**Notes:** see screenshots in: `docs/designer-guide/sample-assets/B-004-pic-0`


```

Claude's loop for a bug (per `README.md` processing contract): reproduce →
diagnose → fix → **add a regression test** that fails before and passes after →
green gate → commit. Track it as an OpenSpec change only if the fix changes
spec-level behavior; otherwise a focused fix + test is enough (note that in the
proposal/commit).

---

<!-- No open bugs yet. Add them above this line using the format. Example:

## [ ] B-001 — Export blocked dialog shows wrong error count
**Repro:**
1. Open a scene with 2 unbound required fields
2. Click Export
**Expected:** "Export blocked: 2 validation errors"
**Actual:** Shows "1 error"
**Env:** Chrome / Designer dev, reproduces on main
**Notes:** apps/designer/src/renderer/features/status/StatusBar.tsx

-->
