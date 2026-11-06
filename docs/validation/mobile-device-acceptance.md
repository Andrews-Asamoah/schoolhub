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

## Results

Record each failure with reproduction steps and an issue link. Do not mark the
checklist complete based only on automated tests or simulator output.
