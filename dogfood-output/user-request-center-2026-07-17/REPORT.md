# User Request Center QA Report

Date: 2026-07-17  
Target: isolated production build at `http://127.0.0.1:8799`  
Result: Pass after three in-session fixes

## Scope

- User creation for General Help, Unstuck, Player Report, Safehouse, and Voice Chat
- Private per-user request history and replies
- Optional telemetry location attachment
- Staff queue, assignment, replies, guarded status changes, Active/All filtering, and reopen controls
- 15-second user and 10-second staff polling
- Request audit history
- Desktop and 390px responsive layouts
- Browser console and horizontal-overflow checks

The QA server used demo RCON, an isolated temporary data file, a synthetic signed player session, and synthetic telemetry. No command or configuration change was sent to the real Project Zomboid server.

## End-to-end result

1. `RequestTester` created an Unstuck request with coordinates `11842.4, 6901.2, z0` attached from telemetry.
2. Bootstrap staff saw the request in the shared queue, claimed it, and replied privately.
3. Staff approved the request; the player portal showed the new status and reply on its normal polling interval.
4. The player replied; the staff queue showed that message on its normal polling interval.
5. Staff completed the request; the active user badge cleared and the completed item remained in history.
6. Audit Log showed create, claim, staff comment, approval, player comment, and completion entries.

## Issues found and fixed during QA

### QA-001: Audit Log used a stale cached snapshot

Entering Audit Log after request activity initially showed only the entries loaded at sign-in. The page transition now fetches current audit data automatically.

Evidence: [current request audit history](screenshots/audit-request-history.png)

### QA-002: Request labels collided at mobile width

Category labels and descriptions shared implicit grid columns, causing text overlap at 390px. Category buttons now use a stacked label/description layout.

Evidence: [fixed mobile user view](screenshots/user-mobile-fixed.png)

### QA-003: Staff queue rows and conversation metadata were compressed

The queue row grid did not match its three content columns, and author roles could run into names. The row grid and message metadata selectors now match the rendered structure. A completed request is also hidden from the detail pane while the Active filter is selected.

Evidence: [fixed mobile staff view](screenshots/staff-mobile-fixed.png), [fixed desktop staff view](screenshots/staff-desktop-final.png)

## Additional evidence

- [User request ready to submit](screenshots/user-unstuck-ready.png)
- [User request created](screenshots/user-request-created.png)
- [Staff claimed and replied](screenshots/staff-claimed-and-replied.png)
- [User received approval and staff reply](screenshots/user-realtime-approved.png)
- [Staff received the user's reply](screenshots/staff-realtime-user-reply.png)
- [Staff completed the request](screenshots/staff-completed.png)
- [User received completed status](screenshots/user-completed.png)
- [Final desktop user view](screenshots/user-desktop-final.png)

## Automated verification

- `npm run check`: passed
- Vitest: 14 files, 59 tests passed
- Production client and server build: passed
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities
- `git diff --check`: passed
- Browser console errors: none
- Horizontal overflow at 390px and 1440px: none
