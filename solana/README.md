# LYAPUNOV · `$LPNV` — Solana

The Solana sibling of the Base build. Same system, same law: a state displaced
far from equilibrium, falling — one buy at a time — toward the single stable
point it was always going to rest at, and which it can never leave.

```
program/   lyapunov_descent — immutable descent program (~30KB, zero-dep)
           (initialize → monotonic stage 0..6, fed, V, keepalive vault)
launch/    pump.fun launch ($LPNV) + initialize / feed / claim / read-state / fee-router (raw web3.js)
```

The token is launched on **pump.fun**; the separate descent program carries the
irreversible state. A read-only narrator + site poll `stage` / `fed` / `V`.

---

## The descent program

`programs/lyapunov-descent/src/lib.rs` — a minimal **zero-dependency**
program. Hand-rolled to keep the binary ~30KB, so the immutable mainnet deploy
costs **~0.21 SOL of rent** instead of ~1.5 SOL for the equivalent Anchor build.
One PDA (seed `b"descent"`) holds, at fixed byte offsets identical to the Base
layout (so the site/server decode is shared):

- `stage` (0..=6) — **never regresses**. A Lyapunov function only decreases.
- `fed` (lamports) — cumulative SOL fed; drives the stage across fixed thresholds.
- `vault` (lamports) — the keepalive, claimable **only** by `host` → `recipient`.
- `thresholds[6]` — strictly ascending, fixed at `initialize`, forever.

Instructions (1-byte tag + little-endian args; no IDL):

| tag | ix | who | effect |
|----|----|-----|--------|
| 0 | `initialize(host, recipient, thresholds)` | once | genesis at stage 0 (PERTURBATION) |
| 1 | `feed(amount)` | anyone | SOL → vault; `fed` rises; stage advances irreversibly |
| 2 | `claim(amount)` | host only | vault → recipient; **stage untouched** |

`V = t5 / (t5 + fed)` — 1.0 at genesis, falling monotonically toward 0. Computed
off-chain from the account (`read-state.ts`); never used in stage logic.

The seven stages: **PERTURBATION → TRANSIENT → CONTRACTION → DISSIPATION →
EQUILIBRIUM → ASYMPTOTIC → ATTRACTOR** (terminal, uncapped).

The program bakes in no program id (PDAs derive from the runtime id), so the same
`.so` deploys to any address — devnet test and mainnet alike.

### Live addresses

- `$LPNV` mint (mainnet): `pvysiEDLr6E9SsS4gETrDCikMdekAPBtYxK7AnZpump` (pump.fun · Token-2022 · mint+freeze authority revoked)
- Descent program (mainnet, **immutable** — upgrade authority `none`): `52UAvNR3QXHqdW8bRDhBRWpgJByPfs8w3681SXvSGJa9`
- Descent PDA (mainnet, genesis stage 0): `AMvC9skaB4GCYiT3wtwT1MZWc9Rbk9fxF5xM2vrpfTsN`
- thresholds (SOL): `0.05, 0.15, 0.3, 0.6, 1.2, 2.5`. Deployed `--final` for ~0.21 SOL. (devnet validation instance: `3ksCh6Jtk79xwEVvwAbXex3KctxL2YEEhjYiBe8tSkhp`)

---

## Runbook

### Build + test

```bash
cd program
cargo test --manifest-path programs/lyapunov-descent/Cargo.toml   # host: pure-logic + layout tests
cargo build-sbf                                                   # the ~30KB .so
```

### Deploy

```bash
# fresh program keypair (the .so is id-agnostic), then:
# devnet (iterate / test)
solana program deploy target/deploy/lyapunov_descent.so \
  --program-id target/deploy/lyapunov_descent-keypair.json \
  --keypair ~/.lyapunov-sol/host.json --url devnet

# mainnet — the meaning IS the immutability: deploy --final so it can never change
solana program deploy target/deploy/lyapunov_descent.so \
  --program-id target/deploy/lyapunov_descent-keypair.json \
  --keypair <funded wallet> --url mainnet-beta --final
```

### Initialize + drive (launch/)

```bash
cd launch && npm install
DESCENT_PROGRAM_ID=<id> npm run initialize        # genesis: stage 0 + thresholds
DESCENT_PROGRAM_ID=<id> npm run state             # read-only telemetry
DESCENT_PROGRAM_ID=<id> FEED_SOL=0.05 npm run feed
DESCENT_PROGRAM_ID=<id> CLAIM_SOL=0.01 npm run claim
```

Env overrides: `SOLANA_RPC_URL`, `DESCENT_PROGRAM_ID`, `THRESHOLDS_SOL`,
`HOST_KEYPAIR`, `RECIPIENT_KEYPAIR`, `PAYER_KEYPAIR`.

---

## pump.fun launch (`$LPNV`)

> pump.fun is **mainnet-only**. `$LPNV` is already live (mint above). To launch a
> token from scratch, `launch/create-pump-token.ts` (DRY by default; needs a
> `METADATA_URI` from IPFS, `--broadcast` to send). The launching wallet becomes
> the creator, so pump.fun creator fees accrue to it.

### Drive the descent from volume (`fee-router.ts`)

Creator fees become the descent's fuel: the router collects pump.fun creator fees
to the creator wallet and `feed`s the SOL gained into the descent — trading volume
moves the system; no donations. Mainnet-only (token + descent both on mainnet),
run as the creator wallet. DRY by default:

```bash
CREATOR_KEYPAIR=<launch wallet> DESCENT_PROGRAM_ID=<mainnet id> SOLANA_RPC_URL=<mainnet rpc> tsx fee-router.ts        # dry
CREATOR_KEYPAIR=<launch wallet> DESCENT_PROGRAM_ID=<mainnet id> SOLANA_RPC_URL=<mainnet rpc> tsx fee-router.ts --run  # route
```

---

## Keys

Dedicated project keypairs live outside the repo in `~/.lyapunov-sol/`
(`host.json`, `recipient.json`, program-id backups) — all gitignored. **Back them
up off-machine**: a program-id keypair is required to redeploy to the same address,
and (post-`--final`) the descent's pacing is fixed forever.
