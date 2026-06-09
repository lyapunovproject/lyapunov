# Security Policy

## Trust model

The LYAPUNOV descent program is deployed **immutable**: no upgrade authority, no owner, no mint authority. The deployed bytes are the final bytes — verify on any explorer that the program's upgrade authority is `none`.

The program exposes three instructions:

- `initialize` — one-time, sets the fixed `host`, `recipient`, and ascending thresholds.
- `feed` — permissionless; increases `fed` and advances the `stage`. Cannot decrease `fed` or lower the stage.
- `claim` — `host`-only; withdraws the keepalive vault to the `recipient` fixed at construction. It never alters `stage` or `V`, and cannot exceed the vaulted balance.

There is no admin function that can pause, drain beyond the vault, re-point the recipient, or change the descent.

## Scope

- `solana/program` — the on-chain descent program.
- `solana/launch` — off-chain operational tooling.
- `site/`, `server.js` — the read-only telemetry surface (holds no keys).

## Reporting a vulnerability

Please report privately — **do not** open a public issue for security-sensitive findings.

- **GitHub** → the repository's *Security* tab → *Report a vulnerability* (private advisory).
- **X** → DM [@lyapunovproject](https://x.com/lyapunovproject).

We aim to acknowledge within 72 hours. Because the program is immutable, an on-chain patch is not possible after deployment; reports about the live program inform public disclosure and any future redeploy to a new address.
