// LYAPUNOV / $LPNV — pump.fun launch (Solana), via PumpPortal's local
// (self-signed) transaction API. The host wallet becomes the pump.fun creator,
// so creator fees accrue to it — the proto-keepalive the fee-router routes into
// the descent.
//
// ⚠ pump.fun is MAINNET-ONLY. This script defaults to mainnet and spends real
//   SOL. It is DRY by default (builds + reports, sends nothing). Broadcast for
//   real ONLY when you mean it:  tsx create-pump-token.ts --broadcast
//
// Prereqs for a real launch:
//   • host keypair funded with SOL (dev buy + fees)   [~/.lyapunov-sol/host.json]
//   • METADATA_URI — upload metadata.json (+ image) to IPFS (Pinata etc.) and
//     pass the resulting URI. pump.fun's legacy IPFS endpoint is deprecated.
//
// Env:
//   METADATA_URI    IPFS URI of the token metadata JSON   (required to build the tx)
//   DEV_BUY_SOL     initial creator buy in SOL            (default 0.5)
//   HOST_KEYPAIR    creator keypair                       (default ~/.lyapunov-sol/host.json)
//   SOLANA_RPC_URL  (default mainnet — pump.fun is mainnet-only)
//
// Writes the new mint keypair to ./pump-mint.json — KEEP IT. Prints the mint;
// set it as LPNV_MINT for the site + fee-router.

import {Connection, Keypair, VersionedTransaction} from "@solana/web3.js";
import {writeFileSync, existsSync} from "node:fs";
import {HOST_KEYPAIR, loadKeypair} from "./lib.js";

const BROADCAST = process.argv.includes("--broadcast");
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const METADATA_URI = process.env.METADATA_URI;
const DEV_BUY_SOL = Number(process.env.DEV_BUY_SOL ?? "0.5");
const NAME = process.env.TOKEN_NAME ?? "LYAPUNOV";
const SYMBOL = process.env.TOKEN_SYMBOL ?? "LPNV";

async function main() {
    const host = loadKeypair(process.env.HOST_KEYPAIR ?? HOST_KEYPAIR);
    const conn = new Connection(RPC, "confirmed");
    const bal = await conn.getBalance(host.publicKey);

    const line = (k: string, v: string) => console.log("  " + k.padEnd(14) + v);
    console.log(`\n${BROADCAST ? "🚀 BROADCAST" : "🧪 DRY RUN"} — LYAPUNOV / $LPNV on pump.fun\n`);
    line("creator", host.publicKey.toBase58());
    line("name/symbol", `${NAME} / $${SYMBOL}`);
    line("dev buy", `${DEV_BUY_SOL} SOL`);
    line("metadata", METADATA_URI ?? "(unset — required to build the create tx)");
    line("rpc", RPC);
    line("host bal", `${(bal / 1e9).toFixed(4)} SOL`);

    if (!RPC.includes("mainnet")) {
        console.log("\n⚠ pump.fun is mainnet-only; the configured RPC is not mainnet. Aborting.");
        process.exit(1);
    }
    if (!METADATA_URI) {
        console.log(
            "\nNo METADATA_URI set. Upload launch/metadata.json (+ image) to IPFS, then re-run\n" +
                "with METADATA_URI=ipfs://… to build the create transaction.\n",
        );
        process.exit(0);
    }

    // Reuse an existing mint keypair if present, else mint a fresh one.
    let mint: Keypair;
    if (existsSync("./pump-mint.json")) {
        mint = loadKeypair("./pump-mint.json");
        line("mint*", `${mint.publicKey.toBase58()}  (*reusing ./pump-mint.json)`);
    } else {
        mint = Keypair.generate();
        writeFileSync("./pump-mint.json", JSON.stringify(Array.from(mint.secretKey)));
        line("mint", `${mint.publicKey.toBase58()}  (saved to ./pump-mint.json)`);
    }

    console.log("\n· building create tx via PumpPortal (trade-local) …");
    const res = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            publicKey: host.publicKey.toBase58(),
            action: "create",
            tokenMetadata: {name: NAME, symbol: SYMBOL, uri: METADATA_URI},
            mint: mint.publicKey.toBase58(),
            denominatedInSol: "true",
            amount: DEV_BUY_SOL,
            slippage: 10,
            priorityFee: 0.0005,
            pool: "pump",
        }),
    });
    if (!res.ok) throw new Error(`pumpportal ${res.status}: ${await res.text()}`);
    const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
    console.log(`  built: ${tx.serialize().length} bytes, ${tx.message.compiledInstructions.length} ix`);

    if (!BROADCAST) {
        console.log("\nDRY RUN complete — nothing sent, no SOL spent.");
        console.log("To launch for real:  tsx create-pump-token.ts --broadcast\n");
        process.exit(0);
    }

    if (bal < (DEV_BUY_SOL + 0.02) * 1e9)
        throw new Error(`Insufficient host balance for dev buy + fees: ${(bal / 1e9).toFixed(4)} SOL`);

    tx.sign([host, mint]); // the mint account signs its own creation
    console.log("🚀 sending …");
    const sig = await conn.sendTransaction(tx);
    await conn.confirmTransaction(sig, "confirmed");

    console.log("\n✅ $LPNV LIVE");
    console.log("  mint:    ", mint.publicKey.toBase58());
    console.log("  tx:      ", sig);
    console.log("  pump.fun: https://pump.fun/" + mint.publicKey.toBase58());
    console.log("\nNEXT: set LPNV_MINT for the site Buy CTA + the fee-router (creator fees → feed the descent).\n");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
