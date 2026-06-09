// Read-only descent telemetry — the same surface the narrator + site poll.
// Holds no keys. Env: SOLANA_RPC_URL, DESCENT_PROGRAM_ID
import {Connection} from "@solana/web3.js";
import {PROGRAM_ID, RPC, descentPda, fetchDescent, lyapunovV, sol} from "./lib.js";

async function main() {
    const conn = new Connection(RPC, "confirmed");
    const d = await fetchDescent(conn);
    if (!d) {
        console.log("descent PDA not initialized yet:", descentPda().toBase58());
        return;
    }
    const t5 = d.thresholds[d.thresholds.length - 1];
    console.log("program  :", PROGRAM_ID.toBase58());
    console.log("descent  :", descentPda().toBase58());
    console.log("stage    :", d.stage, `(${d.stageName})`);
    console.log("fed      :", sol(d.fed), "SOL");
    console.log("vault    :", sol(d.vault), "SOL");
    console.log("feeders  :", d.feeders);
    console.log("V        :", lyapunovV(t5, d.fed).toFixed(9), "(1.0 at genesis, → 0)");
    console.log("thresholds (SOL):", d.thresholds.map((t) => Number(t) / 1e9).join(", "));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
