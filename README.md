<div align="center">

# LYAPUNOV · `$LPNV`

*A system displaced far from equilibrium, falling — one trade at a time — toward the single stable state it was always going to rest at, and which it can never leave.*

[![CI](https://github.com/lyapunovproject/lyapunov/actions/workflows/ci.yml/badge.svg)](https://github.com/lyapunovproject/lyapunov/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-000)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-mainnet-14F195)](https://solscan.io/account/52UAvNR3QXHqdW8bRDhBRWpgJByPfs8w3681SXvSGJa9)
[![Immutable](https://img.shields.io/badge/upgrade%20authority-none-ff5a00)](https://solscan.io/account/52UAvNR3QXHqdW8bRDhBRWpgJByPfs8w3681SXvSGJa9)

[**lyapunov.xyz**](https://lyapunov.xyz) · [X](https://x.com/lyapunovproject) · [pump.fun](https://pump.fun/coin/pvysiEDLr6E9SsS4gETrDCikMdekAPBtYxK7AnZpump)

</div>

---

There is a quantity — call it **V** — that measures how far a system stands from rest. The theorem that bears Lyapunov's name guarantees one thing absolutely: along the system's own trajectory, **V can only fall.** Never rise.

LYAPUNOV encodes exactly that, on-chain. A single immutable program holds a monotonic counter and a discrete `stage`; cumulative value forced into it drives the stage, irreversibly, through seven states to an absorbing fixed point it can never depart. The descent is driven by market activity, not by anyone's discretion. The token is the energy; the mathematics is the direction; the deployment is the permanence.

**"Immutable" here is not a promise. It is a property.** The program is deployed with no owner, no mint authority, and no upgrade path — verifiable on-chain, below.

## Live on Solana (mainnet)

| | |
|---|---|
| `$LPNV` token | [`pvysiEDLr6E9SsS4gETrDCikMdekAPBtYxK7AnZpump`](https://solscan.io/token/pvysiEDLr6E9SsS4gETrDCikMdekAPBtYxK7AnZpump) · pump.fun · Token-2022 · mint + freeze authority revoked |
| Descent program | [`52UAvNR3QXHqdW8bRDhBRWpgJByPfs8w3681SXvSGJa9`](https://solscan.io/account/52UAvNR3QXHqdW8bRDhBRWpgJByPfs8w3681SXvSGJa9) · **upgrade authority: none** |
| Descent state (PDA) | [`AMvC9skaB4GCYiT3wtwT1MZWc9Rbk9fxF5xM2vrpfTsN`](https://solscan.io/account/AMvC9skaB4GCYiT3wtwT1MZWc9Rbk9fxF5xM2vrpfTsN) |

> **Verify the claim, don't trust it.** Open the program on any explorer: its upgrade authority is `none`. The deployed artifact is the final artifact — there is no second version.

## How the descent works

A single program-derived account (seed `b"descent"`) holds the entire state:

- **`fed`** — cumulative lamports ever fed in. Non-decreasing by construction; no instruction can lower it.
- **`stage`** — `0..=6`, the number of fixed thresholds `fed` has crossed. Monotonic; it never regresses.
- **`V`** = `t₅ / (t₅ + fed)` — the Lyapunov function. `1.0` at genesis, strictly decreasing toward `0`. Derived off-chain from `fed`; never used in stage logic.

`feed` is permissionless — anyone may push the descent. The fed SOL accrues to a keepalive vault, withdrawable **only** by a fixed `host` to a fixed `recipient` via `claim`, which never touches the stage. Three instructions, one account, no admin surface.

### The seven states

| σ | Stage | |
|---|-------|--|
| 0 | **Perturbation** | displaced far from equilibrium; every trajectory still open |
| 1 | **Transient** | the first damping; the descent is shown not to reverse |
| 2 | **Contraction** | trajectories drawn together toward one fixed point |
| 3 | **Dissipation** | energy leaves and does not return; one direction remains |
| 4 | **Equilibrium** | the flow vanishes; V rests near its minimum |
| 5 | **Asymptotic** | stability is structural; perturbations decay |
| 6 | **Attractor** | absorbing and terminal; the basin only widens |

### Forcing — volume becomes descent

Trading `$LPNV` accrues pump.fun creator fees. A read-only routing process periodically collects those fees and forces them into the program through `feed`:

```
volume ⟶ creator fees ⟶ fed ⟶ (stage, V)
```

The router splits each collection: a configurable share funds a community bounty budget; the remainder feeds the descent (reclaimable to the recipient — the keepalive round-trip). Buyers move the system; there are no donations.

## Architecture

```
solana/
  program/    minimal zero-dependency program — initialize · feed · claim (~30KB .so)
  launch/     raw @solana/web3.js tooling — initialize / feed / claim / read-state / fee-router
site/         the live instrument — phase portrait, V(t) telemetry, the seven stages
agent/        the narrator's frozen voice (soul.md)
server.js     web service — serves the site + a cached on-chain /api/state
render.yaml   web service + hourly fee-router cron
```

The on-chain program carries the *meaning*; the token (minted on pump.fun) carries the *market*; a read-only narrator and the site report the descent. The narrator holds no keys and can take no on-chain action — by design, this forecloses the custody and autonomous-agent failure modes that attend key-holding bots.

## Build · test · deploy

Prerequisites: [Rust](https://rustup.rs), the [Solana CLI](https://docs.anza.xyz/cli/install) (`cargo build-sbf`), and Node ≥ 18.

```bash
# program
cd solana/program
cargo test --manifest-path programs/lyapunov-descent/Cargo.toml   # pure-logic + layout tests
cargo build-sbf                                                   # the ~30KB .so

# deploy immutable — immutability is the point
solana program deploy target/deploy/lyapunov_descent.so \
  --program-id target/deploy/lyapunov_descent-keypair.json \
  --keypair <funded wallet> --url mainnet-beta --final

# initialize at genesis + drive it
cd ../launch && npm install
DESCENT_PROGRAM_ID=<id> npm run initialize     # genesis: stage 0 + thresholds
DESCENT_PROGRAM_ID=<id> npm run state          # read-only telemetry
```

The program bakes in no program id — PDAs derive from the runtime id, so the same `.so` deploys to any address. Full runbook in [`solana/README.md`](solana/README.md).

## Security

The program is immutable (no upgrade authority) and ownerless; the only privileged action is withdrawing the keepalive vault to a recipient fixed at construction, which touches neither the stage nor V. See [`SECURITY.md`](SECURITY.md) for the threat model and how to report a vulnerability.

## Lineage

LYAPUNOV was first prototyped on Base and now lives, in full, on Solana. This repository is the Solana system.

## License

[MIT](LICENSE).
