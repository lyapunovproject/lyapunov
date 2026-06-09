// Feed SOL into the descent (operator pacing / testing). Permissionless. The SOL
// pools in the keepalive vault; cumulative `fed` drives the stage forward; V only falls.
// Env: FEEDER_KEYPAIR (default host), FEED_SOL (default 0.05), SOLANA_RPC_URL
import {Connection, Transaction, sendAndConfirmTransaction} from "@solana/web3.js";
import {
    HOST_KEYPAIR,
    RPC,
    descentPda,
    fetchDescent,
    ixFeed,
    loadKeypair,
    lyapunovV,
    sol,
    toLamports,
} from "./lib.js";

const readout = (d: any, label: string) => {
    const t5 = d.thresholds[d.thresholds.length - 1];
    console.log(
        `${label}: stage ${d.stage} (${d.stageName})  ·  fed ${sol(d.fed)} SOL  ·  V ${lyapunovV(t5, d.fed).toFixed(6)}`,
    );
};

async function main() {
    const feeder = loadKeypair(process.env.FEEDER_KEYPAIR ?? HOST_KEYPAIR);
    const amount = toLamports(process.env.FEED_SOL ?? "0.05");
    const conn = new Connection(RPC, "confirmed");
    const descent = descentPda();

    const before = await fetchDescent(conn);
    if (!before) throw new Error("descent not initialized");
    readout(before, "before");

    const ix = ixFeed(feeder.publicKey, descent, amount);
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [feeder], {
        commitment: "confirmed",
    });
    console.log(`fed ${sol(amount)} SOL  (${sig})`);

    readout(await fetchDescent(conn), "after ");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
