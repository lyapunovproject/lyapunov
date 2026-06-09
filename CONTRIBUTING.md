# Contributing

Contributions are welcome — bug reports, fixes, tooling, tests, docs, and visualizations of the descent.

## Development setup

- [Rust](https://rustup.rs) + the [Solana CLI](https://docs.anza.xyz/cli/install) (provides `cargo build-sbf`)
- Node.js ≥ 18

## Program — `solana/program`

```bash
cd solana/program
cargo fmt --all                                                   # format
cargo test --manifest-path programs/lyapunov-descent/Cargo.toml   # pure-logic + layout tests
cargo build-sbf                                                   # build the on-chain .so
```

The runtime (the on-chain handlers) is gated to the `solana` target, so `cargo test` runs the pure logic on the host without the SBF toolchain.

## Tooling & site — `solana/launch`, `site`, `server.js`

```bash
cd solana/launch && npm install     # raw @solana/web3.js scripts (no Anchor/IDL)
node server.js                      # serves site/ + /api/state (reads the descent)
```

## Pull requests

- Keep changes focused — one concern per PR.
- Run `cargo fmt --all` and the tests before pushing; CI runs fmt + tests + an SBF build.
- Explain the *what* and the *why*. Clear, conventional commit messages are appreciated but not required.

## A note on the on-chain program

The mainnet descent program is **immutable** (no upgrade authority). Changes under `solana/program` affect *future* deployments only — they cannot modify the live program. Treat anything touching account validation, PDA derivation, or CPIs as security-sensitive and cover it with a test.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
