# User settings theme QA

Date: 2026-07-17
Target: isolated production build at `http://127.0.0.1:8799`

## Result

Passed. No unresolved functional, authorization, accessibility-tree, console, or responsive-layout issues were found in the new theme settings flow.

The follow-up full-palette pass also passed: every non-default theme now changes the canvas, navigation, cards, controls, borders, primary and muted text tones, map surfaces, and accents rather than changing accents alone.

## Verified

- A first-time account receives Green as its default theme.
- The Settings page exposes Green, Amber, Blue, Violet, and Rose as an accessible radio group.
- Selecting Blue applies the accent immediately and confirms that it was saved.
- The saved theme survives a browser reload and a dashboard-process restart.
- A promoted account carries the same theme into the admin console.
- A regular authenticated user can read and update only their own settings.
- Arbitrary theme names are rejected with HTTP 400.
- Unauthenticated settings reads and writes are rejected with HTTP 401.
- Desktop and 390 px mobile layouts have no document overflow.
- Browser console and page error checks are clean.
- Green, Amber, Blue, Violet, and Rose each expose distinct background, surface, border, text, muted-text, and accent values.
- Minimum checked contrast ratios were 15.91:1 for primary text on the canvas, 6.12:1 for muted text on surfaces, and 5.32:1 for accents on the canvas.
- Rose was verified across both the survivor portal and admin console; the Settings page was also verified at 390 px with no overflow.

## Evidence

- `screenshots/record-green-default-desktop.png`
- `screenshots/settings-green-default-desktop.png`
- `screenshots/settings-blue-saved-desktop.png`
- `screenshots/settings-blue-mobile.png`
- `screenshots/admin-blue-theme-desktop.png`
- `screenshots/full-palettes/blue-record-desktop.png`
- `screenshots/full-palettes/amber-settings-desktop.png`
- `screenshots/full-palettes/violet-settings-desktop.png`
- `screenshots/full-palettes/rose-settings-desktop.png`
- `screenshots/full-palettes/rose-admin-desktop.png`
- `screenshots/full-palettes/rose-settings-mobile.png`
