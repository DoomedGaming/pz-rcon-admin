# Player Experience Review

**Target:** `http://127.0.0.1:5173/`  
**Reviewed:** 2026-07-15  
**Scope:** Public player entry, sign-in feedback, navigation, mobile layout, and accessibility

## Executive summary

The visual direction is distinctive and appropriate for Project Zomboid, and the page is fast, responsive, and free of visible console errors. The strongest next improvement is to turn the public entry page into a useful player hub before sign-in: show live server status, player count, a copyable join address, and direct links to rules, mods, Discord/help, and connection instructions. Keep character-specific health, skills, traits, map position, and activity behind the existing private sign-in.

That change would help every player, including people who are not trying to inspect a character record, and would make login/server problems easier to distinguish.

## Findings

### ISSUE-001 — Administrator link does not navigate

- **Severity:** Medium
- **Category:** Functional / navigation
- **Evidence:** [video](videos/issue-001-admin-link-repro.webm), [before](screenshots/issue-001-step-1.png), [after](screenshots/issue-001-step-2.png), [annotated result](screenshots/issue-001-result.png)
- **Observed:** Clicking `Administrator console →` leaves the browser at `/`, even though the link advertises `/admin`. Opening `/admin` directly does load the administrator sign-in page.
- **Reproduction:**
  1. Open the player sign-in page.
  2. Click `Administrator console →`.
  3. Observe that the URL and screen remain unchanged.
- **Recommendation:** Let the anchor perform a normal navigation or route explicitly to `/admin`. Add a visible `Back to survivor portal` link on the administrator sign-in page.

### ISSUE-002 — Primary sign-in action is below the fold on a small phone

- **Severity:** Medium
- **Category:** Responsive UX
- **Evidence:** [annotated 320x568 viewport](screenshots/issue-003-mobile-login-below-fold.png), [full mobile page](screenshots/player-login-320-full.png)
- **Observed:** At 320×568, the form begins at approximately 503 px and the submit button begins at approximately 695 px. A player sees the full promotional headline but must scroll before reaching the main action.
- **Recommendation:** On short mobile viewports, reduce hero spacing and headline size or place the form immediately after the eyebrow. Aim to keep the username field and submit action discoverable within the first viewport.

### ISSUE-003 — Failed sign-in is not connected to the affected fields

- **Severity:** Low
- **Category:** Accessibility / error recovery
- **Evidence:** [failed sign-in](screenshots/issue-002-login-error-mobile.png)
- **Observed:** The page correctly announces the message with `aria-live="polite"`, but neither field receives `aria-invalid`, neither field references the error with `aria-describedby`, and focus falls back to the page body after failure.
- **Recommendation:** Add a stable error id, connect it to both inputs, set `aria-invalid="true"`, and return focus to the username field or an error summary after a failed attempt.

### ISSUE-004 — Invalid credentials lead to a recovery dead end

- **Severity:** Low
- **Category:** UX / content
- **Evidence:** [failed sign-in](screenshots/login-invalid-first-pass.png)
- **Observed:** The only recovery feedback is `Invalid username or password`. There is no action for players who do not remember which password is expected or who need an administrator to reset it.
- **Recommendation:** Keep the security-safe generic error, but add a nearby `Need help?` disclosure explaining where the character password comes from and how to contact staff for a reset. A password visibility toggle would also reduce typing mistakes on mobile.

### ISSUE-005 — Administrator sign-in has no visible return path

- **Severity:** Low
- **Category:** Navigation / dead end
- **Evidence:** [administrator entry](screenshots/admin-direct.png)
- **Observed:** The administrator sign-in page offers only the password field and submit action. A player who lands there must use browser history or manually edit the URL to return.
- **Recommendation:** Add `← Back to survivor portal` and preserve it as a normal link so it works without JavaScript routing.

## Recommended player-facing enhancement

Add a compact public `Server ready` panel to the entry page with:

1. Online/offline/degraded state and last refresh time.
2. Current players and capacity.
3. A copyable server address plus a short `How to join` action.
4. Rules, required mods, Discord/support, and wipe/restart information.
5. A clear separation between `Join the server` and `View my survivor record`.

The signed-in record should then prioritize session-oriented information in this order: current condition and urgent warnings, last known location/map, recent activity, skills/traits, and historical detail. This mirrors the decisions a returning Project Zomboid player makes before joining and immediately after a session.

## Positive observations

- Distinctive visual style with clear labels and readable mobile reflow.
- Helpful clarification that the character password differs from the shared server password.
- No horizontal overflow at 320 px or 390 px.
- Invalid login uses a generic message and an `aria-live` region.
- No visible JavaScript errors during the reviewed public flows.
