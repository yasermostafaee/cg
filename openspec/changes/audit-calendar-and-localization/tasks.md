## 1. Implement

- [x] Localize the Audit controls, outcomes, actions and detail labels.
- [x] Offer Gregorian, Jalali and Lunar Hijri dates, remembered per console, and apply the station's Lunar Hijri correction.
- [x] Convert date-filter selections to the existing UTC bounds and retain full original audit values for copying.

## 2. Verify

- [x] Verify calendar conversion, valid and invalid dates, canonical filter bounds and the Gregorian Audit regression cases in unit and DOM tests.
- [x] Verify General preference persistence, Persian Jalali and RTL, Arabic Lunar Hijri with the station correction, exact local-day UTC bounds and unchanged record details using a loopback Bridge and Windows Edge.
- [ ] Record the carrying Linux Playwright result.
