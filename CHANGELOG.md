# Changelog

Notable changes to PZ RCON Admin are recorded here. The admin app and its
[telemetry companion](https://github.com/DoomedGaming/pz-rcon-admin-telemetry)
use matching version numbers and are released together.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/DoomedGaming/pz-rcon-admin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.3.0
[0.2.0]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.2.0
[0.1.2]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.1.2
[0.1.1]: https://github.com/DoomedGaming/pz-rcon-admin/releases/tag/v0.1.1
