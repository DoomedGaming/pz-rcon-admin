# Changelog

Notable changes to PZ RCON Admin are recorded here. The admin app and its
[telemetry companion](https://github.com/DoomedGaming/pz-rcon-admin-telemetry)
use matching version numbers and are released together.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.3] - 2026-07-29

### Fixed

- Zombie removal now requires and validates the Build 42 RCON center and radius arguments instead of sending the bare command that reports success without removing zombies.
- The World Director can copy an online survivor's telemetry position into the zombie-removal coordinates and preserves reanimated player corpses.

## [0.7.2] - 2026-07-28

### Added

- Discord request notifications now include a clearly labeled excerpt of the original request details for context.

## [0.7.1] - 2026-07-28

### Added

- Discord Request Center notifications now link directly to the matching `/mod` request dialog.
- Request Center fields now show their minimum lengths, live character progress, and when each requirement is met.

## [0.7.0] - 2026-07-28

### Added

- Added encrypted Discord channel webhook configuration for focused moderator notifications.
- Added Discord notifications for new Request Center activity, staff request actions, and successful kick, ban, or whitelist-removal actions.

### Security

- Discord notifications are emitted only from moderation workflows rather than the general audit store, suppress all mentions, sanitize user-controlled text, and never return the webhook secret to the browser.

## [0.6.1] - 2026-07-28

### Added

- Added `/mod` as the normal shared Moderator/Admin console route while keeping `/admin` as an unlinked bootstrap and break-glass entry.

### Changed

- Staff logout now returns to the player portal instead of exposing the bootstrap password form.
- Kick, ban, and whitelist removal now require a reason in both the interface and API, with the reason retained in administrator audit history.

## [0.6.0] - 2026-07-28

### Changed

- Restricted the Audit log navigation, recent-activity summary, and audit API to administrators.

## [0.5.3] - 2026-07-28

### Fixed

- Added separate RCON polling controls to first-run setup and Admin Configuration, and clarified the RCON and telemetry polling labels.

## [0.5.2] - 2026-07-22

### Fixed

- The setup and Configuration forms now default telemetry FTP polling to five seconds and allow the five-second minimum used by the dashboard and telemetry exporter.

## [0.5.1] - 2026-07-22

### Fixed

- Survivor-to-survivor teleports now use a telemetry position no older than 15 seconds and the reliable coordinate command when available, and surface rejected teleport replies instead of reporting false success.

### Changed

- Reduced the telemetry exporter and dashboard polling interval to 5 seconds, while moving configuration-file FTP polling to its own 60-second default interval.

## [0.5.0] - 2026-07-18

### Added

- Added a public project landing page and complete setup documentation deployed through GitHub Pages.
- Added automatic FTP/FTPS polling for `servertest.ini` and `SandboxVars.lua`, including live in-memory refresh when server settings or mod lists change.

### Fixed

- Corrected the Docker environment example to use the renamed `PZRconAdminTelemetry` snapshot path and describe both supported telemetry installation variants.

## [0.4.0] - 2026-07-18

### Added

- The player portal map now follows the signed-in survivor when a telemetry update reports new coordinates. The administrator map still preserves its manually panned position.
- Added this changelog so operators can review changes before upgrading.

## [0.3.0] - 2026-07-18

### Changed

- Renamed the telemetry companion and its paths from `DoomedTelemetry` to `PZRconAdminTelemetry`.
- Documented separate direct-install and Steam Workshop telemetry packages.
- Added lockstep release metadata and validation for the admin and telemetry repositories.

## [0.2.0] - 2026-07-18

### Added

- Added an encrypted in-app Configuration page for updating RCON, telemetry, player sign-in, file-access, and community settings after first-run setup.
- Added automatic process exit after configuration changes so Docker or a service manager can restart the app with the new settings.

## [0.1.2] - 2026-07-18

### Fixed

- Allowed a new instance to serve its token-protected first-run setup flow on a configured network binding.

## [0.1.1] - 2026-07-18

### Fixed

- Corrected the GitHub Container Registry workflow's image build platform.

[Unreleased]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.7.3...HEAD
[0.7.3]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.3.0
[0.2.0]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.2.0
[0.1.2]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.1.2
[0.1.1]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.1.1
