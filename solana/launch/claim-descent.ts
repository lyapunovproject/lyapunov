// Withdraw keepalive from the descent vault to the fixed recipient. Host only.
// The descent (stage, fed, V) is UNTOUCHED — claiming does not undo the fall.
//
// Default: sweep the ENTIRE vault (auto-claim → realize the routed earnings).
// CLAIM_SOL=<n> claims a fixed amount instead; CLAIM_SOL=all is explicit-sweep.
// Env: HOST_KEYPAIR (signs), CLAIM_SOL (optional), SOLANA_RPC_URL
import {Connection, Transaction, sendAndConfirmTransaction} from "@solana/web3.js";
import {HOST_KEYPAIR, RPC, descentPda, fetchDescent, ixClaim, loadKeypair, sol, toLamports} from "./lib.js";

async function main() {
    const host = loadKeypair(process.env.HOST_KEYPAIR ?? HOST_KEYPAIR);
    const conn = new Connection(RPC, "confirmed");
    const descent = descentPda();

    const d = await fetchDescent(conn);
    if (!d) throw new Error("descent not initialized");
    console.log(`before: stage ${d.stage} (${d.stageName}) · fed ${sol(d.fed)} · vault ${sol(d.vault)} SOL`);

    // default = sweep the whole vault; a numeric CLAIM_SOL claims a fixed amount.
    const fixed = process.env.CLAIM_SOL && process.env.CLAIM_SOL !== "all";
    const requested = fixed ? toLamports(process.env.CLAIM_SOL as string) : d.vault;
    const amount = requested > d.vault ? d.vault : requested;
    if (amount <= 0n) {
        console.log("vault empty — nothing to claim.");
        return;
    }

    const ix = ixClaim(host.publicKey, descent, d.recipient, amount);
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [host], {
        commitment: "confirmed",
    });
    console.log(`claimed ${sol(amount)} SOL → ${d.recipient.toBase58()}  (${sig})`);

    const a = await fetchDescent(conn);
    console.log(
        `after : stage ${a!.stage} (${a!.stageName}) · fed ${sol(a!.fed)} · vault ${sol(a!.vault)} SOL`,
    );
    console.log(
        a!.stage === d.stage
            ? "✓ stage untouched by claim (the descent is irreversible)"
            : "✗ stage changed — unexpected",
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
