// Initialize the LYAPUNOV descent at genesis (stage 0 PERTURBATION) with fixed
// ascending thresholds. Run ONCE after deploying the program. For mainnet, deploy
// `--final` first so the descent can never be altered.
//
// Env: PAYER_KEYPAIR (default host), HOST_PUBKEY, RECIPIENT_PUBKEY,
//      THRESHOLDS_SOL (default devnet calibration), SOLANA_RPC_URL, DESCENT_PROGRAM_ID
import {Connection, PublicKey, Transaction, sendAndConfirmTransaction} from "@solana/web3.js";
import {
    HOST_KEYPAIR,
    PROGRAM_ID,
    RECIPIENT_KEYPAIR,
    RPC,
    descentPda,
    ixInitialize,
    loadKeypair,
    toLamports,
} from "./lib.js";

async function main() {
    const payer = loadKeypair(process.env.PAYER_KEYPAIR ?? HOST_KEYPAIR);
    const host = process.env.HOST_PUBKEY
        ? new PublicKey(process.env.HOST_PUBKEY)
        : loadKeypair(HOST_KEYPAIR).publicKey;
    const recipient = process.env.RECIPIENT_PUBKEY
        ? new PublicKey(process.env.RECIPIENT_PUBKEY)
        : loadKeypair(RECIPIENT_KEYPAIR).publicKey;
    const thresholds = (process.env.THRESHOLDS_SOL ?? "0.05,0.15,0.3,0.6,1.2,2.5")
        .split(",")
        .map(toLamports);
    if (thresholds.length !== 6) throw new Error("THRESHOLDS_SOL must have exactly 6 values");

    const conn = new Connection(RPC, "confirmed");
    const descent = descentPda();
    console.log("program  :", PROGRAM_ID.toBase58());
    console.log("descent  :", descent.toBase58());
    console.log("payer    :", payer.publicKey.toBase58());
    console.log("host     :", host.toBase58());
    console.log("recipient:", recipient.toBase58());
    console.log("thresholds (SOL):", thresholds.map((t) => Number(t) / 1e9).join(", "));

    if (await conn.getAccountInfo(descent)) {
        console.log("\nalready initialized — nothing to do.");
        return;
    }
    const ix = ixInitialize(payer.publicKey, descent, host, recipient, thresholds);
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer], {
        commitment: "confirmed",
    });
    console.log("\nt=0. the system is displaced. stage 0 — PERTURBATION.");
    console.log("tx =", sig);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
