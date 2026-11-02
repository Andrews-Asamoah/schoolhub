# Browser locale regression fix

Base: merged `dev` at `5d65a5b28ed30bac8bfbb089a95cfbd0d7735020`.
Branch: `fix/staff-import-locale-error`, targeting `dev`.

## Reproduced cause

PR #187's browser group failed in `staff-bulk-import-dialog.browser.mjs` at
its final assertion that no uncaught page errors occurred. The preceding
SuperAdmin and finance browser checks passed. The failing CI job was
<https://github.com/Andrews-Asamoah/schoolhub/actions/runs/41531014331/job/125570881582>.

Local reproduction used the same Playwright 1.56.1 / Chromium 141 build as CI.
With the original tests, `navigator.language` was `en-US@posix`, an inherited
POSIX locale that `Intl.Locale` rejects. Capturing the stack traced the error to
Query Devtools' locale initialization (`getDefaultLocale` / `getReadingDirection`
/ `isRTL`), rather than the workbook-generation or import endpoint paths.

Observed before the fix:

```text
Browser locale: en-US@posix
RangeError: Incorrect locale information provided
    at new Locale (<anonymous>)
    at isRTL
    at getReadingDirection
    at getDefaultLocale
staff bulk import: 2 uncaught locale errors, exit 1
academic structure bulk import: 3 uncaught locale errors, exit 1
```

## Change

Set `locale: "en-GB"` when the two bulk-import tests create their browser page,
matching the existing financial-controls, academic-calendar and other suites.
Retain all workbook, upload, dismissal and uncaught-error assertions. No global
Intl patch, error filtering or application/backend/dependency change is added.
Original file line endings are preserved.

Both targeted tests passed immediately after the change, with the staff test
reporting `navigator.language === "en-GB"`. The full existing CI browser chain
was then rerun locally against Vite with synthetic API mocks. Real command
output is in `acceptance.txt` (web typecheck/build/unit tests, JS syntax checks,
and every browser script in the current CI chain).

The earlier merged-dev audit also passed all 23 local mobile/API/web static,
unit and release checks. This fix changes only the two browser fixtures; mobile
source, API source, authorization and route inventory remain unchanged.

Final local result: all 16 commands exited 0, including all 11 browser scripts
and the six existing web unit tests. No page-error assertion was removed.

Local Node: 24.22.1. CI Node: 22. No real school data or credentials were used.
The browser workflows use synthetic fixtures and request mocks, not a live API.
Database-backed tests and container smoke verification remain CI checks; native
mobile device/manual checks are not part of this browser-fixture fix.
