# PZ RCON Admin

A reusable, self-hosted administration dashboard and player portal for Project Zomboid Build 42 servers. Its first-run screen encrypts credentials on the backend, supports per-community branding without source edits, polls the live player list, tracks observed sessions, exposes common administration workflows, and records an audit trail of administrator actions.

Canonical repository: <https://github.com/DoomedGaming/pz-rcon-admin>

Project site and setup guide: <https://doomedgaming.github.io/pz-rcon-admin/>

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release-by-release changes. PZ RCON Admin and its telemetry companion keep matching version numbers, so both changelogs use the same release version when either component changes.

## What it can administer

| Area | Available now | Data source |
| --- | --- | --- |
| Server status | RCON connectivity, online count, poll health | RCON |
| Players | Online list, teleport, kick, ban, whitelist removal, god mode, invisibility, no-clip | RCON |
| Player assistance | Give item, grant XP, spawn vehicle, give key, targeted lightning/horde | RCON |
| Player history | First/last observed, session count, observed online time | Dashboard polling |
| Player portal | Read-only access to a survivor's own history and character telemetry | PZ account DB + dashboard data |
| Request Center | Private self-service help requests with staff assignment, replies, and status tracking | Local dashboard store + optional telemetry |
| User settings | Per-account Green, Amber, Blue, Violet, or Rose theme with Green as the default | Local dashboard store |
| Dashboard roles | User by default, with explicit Moderator and Admin promotion | Local dashboard store |
| Communication | Server-wide announcements | RCON |
| Server control | Save, reload options, check mod updates, safe save-then-shutdown | RCON |
| World control | Helicopter, gunshot, player-targeted lightning/hordes, zombie removal | RCON |
| Configuration | Searchable `servertest.ini` and `SandboxVars.lua`, with secret redaction | Auto-refreshed FTP/FTPS files or read-only local overrides |
| Live settings | Allowlisted access, chat, PvP, safehouse, visibility, faction, voice, anti-grief, and save options with no restart | RCON `changeoption` |
| Mods | Mod IDs, Workshop IDs, and direct Workshop links | Auto-refreshed `servertest.ini` |
| Audit | Timestamped command and action history with secret-bearing commands redacted | Local dashboard store |
| Provider operations | Configurable link to the operator's hosting panel | Operator configuration |

## Make it yours

The same build can serve different communities without source edits. The first-run form includes the community name, initials, tagline, portal copy, join address, community links, restart schedule, announcement, and provider link. Public values are trimmed and length-limited before they reach the browser; unsafe link protocols are discarded. If the community name is omitted, the dashboard uses `PublicName` from `servertest.ini`, then falls back to `Project Zomboid`. Initials are derived automatically when omitted.

Environment variables remain available as optional deployment overrides. Their equivalent names are shown here for automation and process-manager users; an env file is not required:

```dotenv
PZ_BRAND_NAME=Rosewood After Dark
PZ_BRAND_INITIALS=RAD
PZ_BRAND_TAGLINE=No one survives alone
PZ_PORTAL_TITLE=Welcome home, survivor.
PZ_PORTAL_DESCRIPTION=See who is online and review your latest character snapshot.

PZ_PLAYER_JOIN_ADDRESS=pz.example.com:16261
PZ_PLAYER_DISCORD_URL=https://discord.gg/your-community
PZ_PLAYER_RULES_URL=https://example.com/rules
PZ_PLAYER_MODS_URL=https://steamcommunity.com/sharedfiles/filedetails/?id=your-collection-id
PZ_PLAYER_RESTART_SCHEDULE=Nightly at 4:00 AM Central
PZ_PLAYER_ANNOUNCEMENT=Welcome to the new season.

PZ_PROVIDER_NAME=My hosting provider
PZ_PROVIDER_URL=https://provider.example.com/my-server
```

Players can independently choose Green, Amber, Blue, Violet, or Rose in their account settings. Their choice follows them into the staff console if they are promoted.

The command inventory was verified against the live Build 42 server's own `help` response. It currently reports 42 RCON commands. The raw console exposes that authoritative help text, while the graphical controls include the safe and useful subset whose syntax was confirmed live. Teleport is also available as a guarded player action because the current official command-class reference includes both [`TeleportCommand`](https://projectzomboid.com/modding/zombie/commands/serverCommands/TeleportCommand.html) and [`TeleportToCommand`](https://projectzomboid.com/modding/zombie/commands/serverCommands/TeleportToCommand.html), even though the live server's earlier help snapshot omitted them. When a destination has a position from the last 15 seconds of telemetry, survivor-to-survivor teleport uses the reliable coordinate form; otherwise it uses the native two-player form. The app requires the source player to be online, validates coordinate input, confirms the destination, audits the command, and reports an actionable error if the running server rejects it. Other older commands found in online guides—such as weather start/stop, statistics, and access-level assignment—remain raw-console only unless their syntax is verified against the running server.

## Important capability boundary

Vanilla RCON does **not** expose a complete character sheet. It can identify online players and execute administration commands, but fields such as health, zombie kills, skill levels, traits, inventory, profession, and precise position require another source.

The dashboard therefore distinguishes:

1. **Live RCON data** — authoritative online state and command results.
2. **Observed history** — sessions and online duration measured after this dashboard starts polling.
3. **Deep telemetry** — the separate [PZ RCON Admin Telemetry](https://github.com/DoomedGaming/pz-rcon-admin-telemetry) companion exports health, kills, survived hours, profession, position, traits, skill levels, carried weight, and the key ID of a vehicle the survivor is currently occupying. It is available either as a directly installed server utility or as a Build 42 Steam Workshop mod. The dashboard retrieves its snapshot through a configured FTP/FTPS endpoint. `/api/telemetry/player` remains available as an authenticated alternative for custom senders.

Hosting-provider operations are separate from RCON. A stopped process cannot be started with RCON. Starting/restarting at the provider level, backups, file management, and account permissions remain in the provider panel. The optional provider link is only a URL; the app stores no hosting-account credentials.

## Deep telemetry

Deep telemetry connects two separately maintained components released with the same version number:

1. [PZ RCON Admin Telemetry](https://github.com/DoomedGaming/pz-rcon-admin-telemetry) is a credential-free, server-only Project Zomboid Build 42.19+ companion. Choose its `direct-install` package or its `workshop` package—never both. Either version refreshes `Lua/PZRconAdminTelemetry/players.json` when the online survivor count changes and otherwise throttles writes to once per real minute while the server is active.
2. The dashboard's built-in FTP bridge retrieves that file from a host that exposes the server files over FTP or FTPS, validates its schema and limits, then updates the survivor registry in one batch.

For the direct package, upload `direct-install/media/lua/server/PZRconAdminTelemetry_Server.lua` from the companion repository to `media/lua/server/PZRconAdminTelemetry_Server.lua` in the game server tree. Do **not** add the direct package to `Mods` or `WorkshopItems`. Provider game updates or **Verify game files** may remove this file, so re-check the path after either operation.

For the Workshop package, publish or subscribe to its Steam item, add the numeric Workshop item ID to `WorkshopItems`, and add the Mod ID `PZRconAdminTelemetry` to `Mods`. Remove the direct-install file before enabling the mod. See the companion repository's [direct-install instructions](https://github.com/DoomedGaming/pz-rcon-admin-telemetry/tree/main/direct-install) and [Workshop instructions](https://github.com/DoomedGaming/pz-rcon-admin-telemetry/tree/main/workshop) for the complete procedures.

Enter the FTP or FTPS values supplied by the hosting provider under **Optional server-file access** during first-run setup. The following equivalent environment overrides resemble G-Portal, but any compatible file host works:

```dotenv
PZ_TELEMETRY_FTP_HOST=your-provider-ftp-host
PZ_TELEMETRY_FTP_PORT=your-provider-ftp-port
PZ_TELEMETRY_FTP_USER=your-provider-ftp-user
PZ_TELEMETRY_FTP_PASSWORD=your-provider-ftp-password
PZ_TELEMETRY_FTP_SECURE=false
PZ_TELEMETRY_FTP_PATH=Lua/PZRconAdminTelemetry/players.json
PZ_TELEMETRY_FTP_POLL_SECONDS=5
PZ_CONFIG_FTP_PATH=Server/servertest.ini
PZ_SANDBOX_FTP_PATH=Server/servertest_SandboxVars.lua
PZ_CONFIG_FTP_POLL_SECONDS=60
```

Then rebuild or restart the dashboard. It immediately retrieves telemetry, `servertest.ini`, and `SandboxVars.lua`. Telemetry refreshes on `PZ_TELEMETRY_FTP_POLL_SECONDS`, while the two configuration files use `PZ_CONFIG_FTP_POLL_SECONDS`. Changed configuration is applied in memory without a dashboard restart, so mod counts and searchable settings do not become stale. Its Overview and Mods & Settings pages report whether FTP is configured, connected, waiting for the first snapshot, or returning an actionable error. FTP and RCON credentials stay on the backend and are never included in the browser API or server telemetry utility.

### Lockstep versions

The dashboard and telemetry companion intentionally use the same semantic version. [`release.json`](release.json) records the exact pairing, and `npm run check` verifies the sibling telemetry checkout when both repositories are next to each other. When either component changes, run `npm run release:version -- X.Y.Z` from this repository to update both sibling checkouts, then release both with the same `vX.Y.Z` tag. The unchanged repository receives a metadata-only release if necessary.

## Player portal

The player portal is the default page at `/`. A survivor signs in with the personal Project Zomboid username and password paired with their account. This is **not** the shared server password. After an existing Admin grants that account the Moderator or Admin dashboard role, the normal console link opens the shared staff route at `/mod`.

RCON cannot validate player accounts. When enabled, the backend retrieves `db/servertest.db` from the configured FTP/FTPS host into a private temporary directory, finds the case-insensitive account in the `whitelist` table, verifies the Build 42 MD5-plus-bcrypt password representation, and immediately removes the database copy. The raw password, stored hash, and database are never returned to the browser or written to dashboard history.

Enable the portal in first-run setup with the same server-file credentials or separate player-database credentials. Equivalent environment overrides are:

```dotenv
PZ_PLAYER_AUTH_ENABLED=true
PZ_PLAYER_SESSION_SECRET=a-separate-random-string-at-least-32-characters
PZ_PLAYER_DB_FTP_PATH=db/servertest.db
PZ_PLAYER_DB_WORLD=servertest
```

The player API derives the username from a signed, HttpOnly session. Every account starts as **User**, which can reach only its own portal data. A **Moderator** can open the staff overview, survivor registry, and moderation actions. Kick, ban, and whitelist removal require a reason in both the interface and API, and the reason is recorded in the administrator audit log. An **Admin** can additionally view that audit log and manage dashboard roles, server and world commands, live settings, configuration, and the raw RCON console. Dashboard roles are independent from Project Zomboid's in-game access levels.

Signed-in players can open **Request Center** to ask for general help, report that they are stuck, report another survivor, request safehouse assistance, or ask for voice-chat help. A request is private to the account that created it and dashboard staff. Players can view and reply only to their own requests; they never receive RCON or moderation access. A player may have up to five active requests at once. When deep telemetry has a current position for the player, the request stores that location snapshot so staff can review where the problem occurred without exposing another survivor's location.

Moderators and Admins share the **Request queue** in `/mod`. Staff can claim a request, exchange private replies, approve or deny it, mark claimed or approved work completed, or explicitly reopen a denied or completed request. The available states are `Open`, `Claimed`, `Approved`, `Denied`, and `Completed`, with guarded transitions and a single active assignee. Request creation, replies, assignments, and status changes are persisted in `data/dashboard.json` and written to the audit log. The player portal refreshes every 15 seconds and the staff console every 10 seconds, so changes appear during play without a dashboard or game-server restart.

Signed-in players can also open **Settings** from the survivor portal and choose a full interface theme. Green remains the default; Amber, Blue, Violet, and Rose are also available. Each palette changes backgrounds, panels, navigation, borders, text tones, and highlights. The selection is saved per Project Zomboid username in `data/dashboard.json`, applies immediately without a game-server or dashboard restart, and follows moderators or administrators into the control console.

`DASHBOARD_PASSWORD` remains a bootstrap and break-glass credential. The unlinked `/admin` route is reserved for this emergency access. Use it before the first Project Zomboid account has been promoted, grant that account Admin, then use the normal Project Zomboid login and `/mod` console route for routine access. Signing out of the console returns to `/` instead of displaying the bootstrap form. Role assignments are stored in `data/dashboard.json` and take effect on the next request. The separate route reduces accidental exposure; the password and role checks remain the actual security boundary.

## Live settings

The Admin-only **Live settings** page uses the running server's `changeoption optionName "newValue"` RCON command. Changes are typed, restricted to an explicit allowlist, confirmed when they can disrupt play, and written to the audit log. The page never edits `SandboxVars.lua`, changes maps or mods, calls `reloadoptions`, or restarts the server.

Successful changes are retained in the dashboard data file so a dashboard process restart does not fall back to an older imported INI snapshot when `showoptions` is truncated. Visibility/nameplate options are applied by the server without a server restart, but players who are already connected must log out and back in before their client refreshes those values; the page marks those controls explicitly.

The live panel includes access limits, chat controls, PvP safety, safehouse rules, visibility, factions, voice chat, anti-grief restrictions, pause-while-empty, and the automatic save interval. Voice distance accepts bounded decimal values and prevents the full-volume distance from exceeding the maximum audible distance. The anti-grief group covers destructive fire, sledgehammer damage, container item limits, vehicle, trailer, and burnt-wreck towing restrictions, and the global moderation sound. Zombie population, loot, time, weather cycles, vehicle spawning and population, map selection, and Workshop configuration remain read-only because they are not guaranteed runtime changes.

The unauthenticated landing page reports whether RCON is reachable, the current player count, and the configured map. Optional community identity, join details, and links remain generic or hidden unless the operator explicitly sets them:

```dotenv
PZ_PLAYER_JOIN_ADDRESS=example.com:16261
PZ_PLAYER_DISCORD_URL=https://discord.gg/your-group
PZ_PLAYER_RULES_URL=https://example.com/server-rules
PZ_PLAYER_MODS_URL=https://steamcommunity.com/sharedfiles/filedetails/?id=your-collection-id
PZ_PLAYER_RESTART_SCHEDULE=Nightly at 4:00 AM Central
PZ_PLAYER_ANNOUNCEMENT=Check the group chat before the next session.
```

Only `http://` and `https://` links are accepted. These values contain no credentials and are returned by `/api/player/session`; do not place private passwords or administration URLs in them.

**Security limitation:** the current G-Portal FTP endpoint does not offer FTPS, so the account database's password hashes cross that connection without transport encryption. Keep password login on localhost or a private VPN unless you accept that risk. If the portal is internet-facing, the website itself must use HTTPS, `DASHBOARD_SECURE_COOKIE=true`, a unique `PZ_PLAYER_SESSION_SECRET`, and a separate bootstrap administrator password. Steam OpenID mapped to the account's SteamID is the preferred future public-login method because players would not enter their game password into the website.

## Interactive player map

Authenticated player and administrator views include an interactive, pan-and-zoom map built from the latest position reported by deep telemetry. The player portal shows the signed-in survivor plus other **currently online** survivors with reported positions. Other players' offline last-known locations and non-map character telemetry remain administrator-only. The administrator console uses its separately protected overview and can show every survivor with a reported position. Online markers represent the latest live snapshot; offline markers in the admin view are explicitly labeled as a **last known** location with the snapshot age.

The basemap is deliberately pinned to the Project Zomboid Map Project's official top-down **Build 42.19** image pyramid. Game `x` and `y` coordinates map directly to its 19,968 by 16,128 pixel coordinate space, while `z` is shown as the reported floor. Pinning the build prevents a remote map update from silently changing the coordinate transform used by this dashboard.

Browsers never contact the external tile host directly. Map images are requested through the dashboard's same-origin `/map-tiles` gateway, which requires either a valid player session or a valid administrator session. The gateway accepts only the pinned host, allowed zoom levels, and in-range WebP tile coordinates; it is not a general-purpose proxy. It forwards no usernames, player records, or dashboard credentials to the map provider.

Map imagery remains an external dependency on <https://map.projectzomboid.com/> and is displayed with attribution to the Project Zomboid Map Project and The Indie Stone. If that service or the network is unavailable, the dashboard keeps the survivor coordinates and last-update information visible instead of failing the rest of the portal.

The hosted image pyramid is not documented as a general third-party tile API. Before making this dashboard public or serving it at scale, confirm permission for that use or generate and host a private top-down pyramid from game files you are licensed to use with the open-source [PZmap renderer](https://github.com/CalvyPZ/PZmap).

**Custom-map limitation:** the current basemap covers the pinned official Build 42.19 world only. It does not load arbitrary Workshop or private mod-map tiles. A survivor on added or replacement terrain may therefore appear over inaccurate vanilla imagery when coordinates overlap, or be reported as outside map coverage when they do not. Supporting a custom map requires an intentionally configured tile pyramid and coordinate offset for that map; the dashboard does not guess either value.

## Setup

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

On the first start, the terminal prints a one-time `/setup` URL. Open that URL, enter the token and configuration, and save. The token is invalidated immediately and the dashboard exits cleanly so its process supervisor can restart it with the encrypted values. Docker Compose handles this automatically through `restart: unless-stopped`; when using `npm run dev` directly, run the command again after setup.

The store defaults to `~/.config/pz-rcon-admin/`:

- `config.enc.json` contains AES-256-GCM authenticated ciphertext.
- `master.key` contains a randomly generated 256-bit key.
- The directory is restricted to mode `0700`; both files are mode `0600`.
- Setup status and save responses never return configured values or secret values.

The key and ciphertext are deliberately outside the repository. This protects credentials from accidental commits, source archives, and casual file inspection. Because the key lives on the same machine, an attacker who can read files as the dashboard's operating-system account can decrypt the store; use normal account isolation and disk encryption for that threat.

Open <http://127.0.0.1:5173> for the player portal or <http://127.0.0.1:5173/mod> for the signed-in staff console. The unlinked `/admin` path remains available only for deliberate bootstrap access. Existing `/player` links continue to render the player portal. The API listens on `127.0.0.1:8787` and Vite proxies `/api` during development.

To migrate an existing protected env file without printing its values:

```bash
npm run config:import -- /absolute/path/to/pz-rcon-admin.env
npm run dev
```

The importer preserves existing credentials, imports RCON values from a readable `servertest.ini` when necessary, and generates independent session-signing secrets when they were previously using fallbacks. Move or delete the plaintext env file only after the encrypted start has been verified.

Environment variables and `.env.example` remain supported for automated deployments. Explicit process variables override stored values; values absent from the process are filled from the encrypted store.

### Updating configuration

After setup, an Admin can open **Configuration** in the control console to correct RCON, telemetry, server-file, player sign-in, and community settings. Non-secret values are loaded into the form, but stored passwords, tokens, and session keys are represented only by a configured/not-configured marker. Leave a secret field blank to keep it, enter a new value to replace it, or use the explicit remove/rotate control where available.

Saving validates the complete merged configuration, encrypts it atomically, records a value-free audit entry, and exits the dashboard after the response is delivered. A Docker or service-manager restart policy then starts it with the new values, while the browser waits and reconnects. A direct `npm start` or `npm run dev` process has no external supervisor and must be started again manually. Environment variables continue to take precedence and must be changed in the deployment environment rather than through this page.

To preview the full interface without connecting to a live server:

```bash
PZ_DEMO=true npm run dev
```

## Production

```bash
npm run build
npm start
```

The production server serves both the API and built interface from <http://127.0.0.1:8787> by default. The root opens the player portal, the normal staff console is at <http://127.0.0.1:8787/mod>, and the unlinked bootstrap administrator entry remains at `/admin`.

Keep the loopback binding unless the dashboard is placed behind HTTPS. A new instance may bind to a non-loopback address only to serve its token-protected setup flow. The setup form requires a dashboard password before it writes the encrypted configuration; subsequent network-bound starts fail closed if that password cannot be loaded. Use a strong, unique RCON password; RCON grants full server control.

## Docker deployment

The supplied image uses a multi-stage build. The runtime image contains only the compiled application and production dependencies, runs as the unprivileged `node` user, and includes a health check.

```bash
docker compose up -d --build
docker compose logs dashboard
```

Open the one-time setup URL printed by `docker compose logs dashboard` and save the configuration. The container exits and `restart: unless-stopped` starts it again automatically; the setup page waits for the healthy dashboard and opens the deliberate bootstrap route at `/admin`. The same automatic restart occurs after an Admin saves later changes from **Configuration**, returning them to `/mod`. Open <http://127.0.0.1:8787> for the player portal or <http://127.0.0.1:8787/mod> for routine staff access. The encrypted configuration, its key, player history, and audit entries are retained in the `zomboid-admin-data` volume when the container is replaced or upgraded.

### GitHub Container Registry

Every push to `main` publishes a `linux/amd64` image to:

```text
ghcr.io/doomedgaming/pz-rcon-admin
```

The workflow uses GitHub's built-in token, generates an SBOM and provenance attestations, and does not require a repository registry secret. Pull requests build the image without publishing it.

Available tags are:

- `latest` and `main` for the current default branch;
- `sha-<commit>` for an immutable source revision;
- `X.Y.Z` and `X.Y` when matching Git tags such as `v0.1.1` are pushed.

The Compose file uses `ghcr.io/doomedgaming/pz-rcon-admin:latest` by default while retaining the local `build` definition. To deploy the registry image without rebuilding:

```bash
docker compose pull dashboard
docker compose up -d --no-build dashboard
```

While the GitHub repository and package are private, authenticate the Docker host once using a GitHub personal access token with `read:packages`. Do not store that token in the application's environment file:

```bash
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username YOUR_GITHUB_USERNAME --password-stdin
```

Override the image or pin a release without editing Compose:

```bash
PZ_RCON_ADMIN_IMAGE=ghcr.io/doomedgaming/pz-rcon-admin:X.Y.Z \
docker compose up -d --no-build dashboard
```

FTP/FTPS installs retrieve searchable mod and server configuration automatically. To override FTP with protected local copies, mount them read-only. The host paths are not secrets and can be supplied directly in the shell:

```bash
PZ_CONFIG_HOST_PATH=/absolute/host/path/to/servertest.ini \
PZ_SANDBOX_HOST_PATH=/absolute/host/path/to/servertest_SandboxVars.lua \
docker compose \
  -f compose.yaml \
  -f compose.config-files.yaml \
  up -d --build
```

Useful operations:

```bash
docker compose ps
docker compose logs -f dashboard
docker compose pull
docker compose up -d --build
docker compose down
```

The Compose service binds to `127.0.0.1` by default and the setup form requires a separate dashboard password. To place it behind an HTTPS reverse proxy, change the non-secret `DASHBOARD_BIND_ADDRESS`, enable secure cookies in setup, and keep the dashboard password enabled. Optional environment overrides remain available, but credentials do not need to be present in a Compose env file.

## Verification

```bash
npm run check
```

This runs Vue/server type checks, unit tests for the player parser, configuration redaction and command builders, then a production build.

## Local data

Runtime history is written to `data/dashboard.json` with owner-only file permissions. It is ignored by Git. Delete that file only if you intentionally want to erase dashboard-observed player history and the local audit log.

## License

PZ RCON Admin is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).

Noncommercial use, modification, and redistribution are permitted under that license. Commercial use is not permitted. Preserve the license and its required copyright notice when sharing original or modified copies.

Third-party dependencies and external services remain governed by their own terms; see [Third-Party Notices](THIRD_PARTY_NOTICES.md).

Contributions are accepted under the same noncommercial terms; see [Contributing](CONTRIBUTING.md).

Project Zomboid and its related names, game content, and assets belong to their respective owners. PZ RCON Admin is an unofficial community project and is not affiliated with or endorsed by The Indie Stone.

The canonical source is maintained at <https://github.com/DoomedGaming/pz-rcon-admin>.
