# Pre-user-feature readiness audit

Date: 2026-07-17

## Result

The unified dashboard role implementation and admin-only realtime settings pass automated, API-boundary, production-container, and desktop/mobile browser checks. The local development stack remains available at `http://127.0.0.1:5174`.

## Fixed during this audit

- Persist successful realtime-setting changes in the protected dashboard data file so a dashboard process restart does not fall back to an older imported INI snapshot when `showoptions` is truncated.
- Mark nameplate settings that require already-connected players to reconnect, without implying a server restart.
- Add the missing mouse-over name visibility control.
- Add a public, non-sensitive health endpoint and point container health checks at it.
- Add explicit startup warnings when local fallback credentials or session secrets are being reused.
- Hide the native horizontal scrollbar on the mobile admin navigation while retaining touch scrolling and accessible labels.
- Rename the player credential field to “Project Zomboid account password.”
- Add coverage for signed bootstrap/player sessions, tamper rejection, dual-cookie logout, role persistence, and realtime-setting persistence.

## Verification

- `npm run check`: 12 test files, 50 tests passed; TypeScript/Vue typecheck and production build passed.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `podman compose config`: valid.
- Production image: built as `localhost/doomed-zomboid-admin:latest` and smoke-tested read-only, unprivileged, with all Linux capabilities dropped.
- Health endpoint: HTTP 200 with only `{ "ok": true }`.
- Default user: `/admin` refused and protected APIs return 403.
- Moderator: only Overview, Survivors, and Audit are visible; admin APIs and non-moderation player actions return 403; kick succeeds.
- Admin player session: full navigation and APIs available immediately after promotion.
- Logout: both bootstrap and player sessions are cleared.
- Realtime setting: audited command succeeded in demo mode and the changed value survived an application-process restart.
- Desktop and 390 px mobile layouts: no document overflow, page errors, or console errors.

## Operational blockers before public deployment

1. Configure unique `DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET`, and `PZ_PLAYER_SESSION_SECRET` values. The current ignored local `.env` uses fallback secrets and is suitable only for loopback testing.
2. Rotate the RCON password, Discord token, and server password found in the tracked `outputs/approved-mod-set-2026-07-15/final/servertest.ini` snapshot, then remove the secret-bearing file from Git history. Redacting only the current working copy is insufficient.
3. If exposed beyond localhost/private VPN, serve through HTTPS and enable `DASHBOARD_SECURE_COOKIE=true`.

## Evidence

Screenshots are stored in `screenshots/`, including the admin and moderator desktop/mobile views, the live-settings screen, and the real player-login page.
