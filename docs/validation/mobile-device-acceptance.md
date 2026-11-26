# Mobile device acceptance checklist

Status: **Not run**. No real Android or iOS device validation has been recorded.
Tester, test date, device models, OS versions, and seeded test accounts remain
to be assigned. Attach light- and dark-mode screenshots and record failures as
issues before Phase 9.

## Test details

- Tester:
- Date:
- App build / commit:
- Android device and OS:
- Low-end Android device and OS:
- iPhone and iOS (if available):
- Screenshot location:
- Issues filed:

## Checklist

- [ ] Development build launches. School-code, login, role, and
      change-password screens render in light and dark modes; attach screenshots.
- [ ] Seeded-account sign-in works for a teacher, a student, a guardian with two
      wards, and a multi-role user. Also verify wrong password, rate limiting after
      repeated attempts, paused subscription, forced password change, and
      forgot-password flow.
- [ ] On an associated Android/iOS build, open a real recovery email while the
      app is closed, already open, and signed in. Verify the reset form opens
      with no token field and asks before signing out an active session. Complete
      a reset, verify the link cannot be reused, and test browser fallback
      without the app installed.
- [ ] From a guardian fee statement, open the web portal with and without an
      active browser session. Verify sign-in continues to the correct school's
      statement and that browser ward selection remains available.
- [ ] Session events (`unauthorized`, `password-change-required`,
      `subscription-inactive`, and `two-factor-required`) clear the appropriate
      credentials/caches and show the expected screen.
- [ ] Dev gallery: tab-bar press, hidden tab, haptics, and active pill.
- [ ] Font scale at 100%, 130%, and 200% on small screens: no clipped text,
      tab labels grow, and touch targets are at least 44 pt.
- [ ] Sign-in flow and gallery pass TalkBack and VoiceOver.
- [ ] Blur on/off, iOS Reduce Transparency, and Reduce Motion can be toggled
      while the app is open.
- [ ] Low-end Android: 500-row FlashList scrolling, sheets, counters, and
      shimmer remain smooth.
- [ ] App icon, adaptive icon mask, and light/dark splash are correct.

## Portal workflow checks

- [ ] Sign in as the assigned teacher, save marks, and import a sample CSV and
      XLSX. Verify an empty cell preserves a mark, a stale preview reports a
      conflict, and the sheet locks after submission. Request a correction,
      save a recommendation draft, and sign off selected reports.
- [ ] Preview a report and open a signed archive PDF. Verify a teacher outside
      the assigned class cannot access that pupil's report.
- [ ] Submit a guardian absence request with a PDF or image and reopen it
      after school leadership records a decision. Switch guardians and wards
      to verify requests, evidence, fees and reports stay within scope.
- [ ] Print and share a timetable, a legacy report and a fee statement. Open
      the exported Excel statement and check that amounts are numeric.
- [ ] Filter student assignments, search subjects and classmates, and verify
      current and next lessons. Search message history and send a reply using
      the guardian, teacher and student test accounts.

## Results

Record each failure with reproduction steps and an issue link. Do not mark the
checklist complete based only on automated tests or simulator output.
