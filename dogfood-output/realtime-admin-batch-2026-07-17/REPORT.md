# Realtime Admin Settings QA

| Field | Value |
|---|---|
| Date | 2026-07-17 |
| App | Doomed Gaming Project Zomboid dashboard |
| Test target | Isolated production build at `http://127.0.0.1:8799/admin` |
| Scope | Voice, Factions, Anti-grief, validation, audit history, and responsive layout |

## Result

No blocking, functional, responsive, console, or accessibility-tree issues were found in this batch.

## Verified behavior

- The Live settings page renders all nine allowlisted groups: Access, Chat, PvP, Safehouses, Visibility, Factions, Voice, Anti-grief, and Maintenance.
- Factions exposes its enable toggle, survival-day requirement, and member requirement for faction tags.
- Voice exposes enable, minimum distance, maximum distance, and directional-audio controls.
- Anti-grief exposes destructive-fire protection, sledgehammer rules, container item limits, three towing restrictions, and the global ban/kick sound.
- Enabling `VoiceEnable` succeeded immediately and displayed confirmation feedback.
- Applying `VoiceMinDistance=12.5` succeeded, proving decimal values are accepted and preserved.
- Applying `VoiceMaxDistance=10` while the minimum was `12.5` was rejected before RCON execution, displayed an actionable error, and restored the input to `100`.
- Enabling `DisableVehicleTowing` succeeded immediately.
- Applying `FactionDaySurvivedToCreate=2` succeeded immediately.
- Enabling `NoFire` required an explicit confirmation and then succeeded.
- The audit log recorded successful changes and the rejected invalid range.
- At a 390 by 844 viewport, document, body, and client widths were all 390 pixels; there was no horizontal overflow.
- Browser console and page-error checks were empty.

## Automated verification

- 13 test files passed.
- 55 tests passed.
- Vue and server TypeScript checks passed.
- Client and server production builds passed.
- Production dependency audit reported zero vulnerabilities.
- `git diff --check` passed.

## Evidence

- [Desktop live settings](screenshots/live-settings-desktop-final.png)
- [Mobile live settings](screenshots/live-settings-mobile-final.png)
- [Audit log](screenshots/audit-log-desktop.png)
