# Contributing to PZ RCON Admin

Thank you for helping improve PZ RCON Admin. Please open an issue before beginning a large change so the approach can be discussed first.

By submitting a contribution, you confirm that you have the right to submit it and agree that it will be distributed under the same [PolyForm Noncommercial License 1.0.0](LICENSE.md) as the project. Contributions do not create a commercial-use exception.

Before opening a pull request:

```bash
npm ci
npm run check
```

Do not commit server passwords, RCON credentials, FTP credentials, session secrets, private configuration, player databases, telemetry snapshots, or runtime dashboard data. Use placeholders in tests and documentation.

Report security vulnerabilities privately to the repository owner instead of opening a public issue that exposes users or credentials.
