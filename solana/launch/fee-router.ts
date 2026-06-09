// LYAPUNOV fee-router (Solana) — hybrid split: turn volume into descent + budget.
// Collects the creator's pump.fun CREATOR FEES, then splits each collection:
//   • BOUNTY_BPS (default 20%) → the bounty-budget wallet (funds pump.fun GO bounties)
//   • the rest (default 80%)   → feed()s the descent (drives the fall; reclaimable as
//                                earnings via `claim` → recipient — the round-trip)
// Both legs go out in ONE creator-signed transaction. Volume drives the descent;
// no donations.
//
// ⚠ PRODUCTION / MAINNET driver. pump.fun (and creator fees) live on mainnet, so the
//   descent program must also be on mainnet (set DESCENT_PROGRAM_ID + SOLANA_RPC_URL).
//   Run as the wallet that LAUNCHED the token (the creator). DRY by default; --run to send.
//
// Env: CREATOR_KEYPAIR, DESCENT_PROGRAM_ID, SOLANA_RPC_URL, MIN_FEE_SOL (0.01),
//      GAS_RESERVE_SOL (0.02), BOUNTY_BPS (2000 = 20%), BOUNTY_WALLET
import {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    VersionedTransaction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import {HOST_KEYPAIR, PROGRAM_ID, RPC, descentPda, fetchDescent, ixFeed, loadKeypair, lyapunovV, sol, toLamports} from "./lib.js";

const RUN = process.argv.includes("--run");
const MIN_FEE = toLamports(process.env.MIN_FEE_SOL ?? "0.01");
const GAS_RESERVE = toLamports(process.env.GAS_RESERVE_SOL ?? "0.02");
const BOUNTY_BPS = BigInt(process.env.BOUNTY_BPS ?? "2000"); // 20%
const BOUNTY_WALLET = new PublicKey(
    process.env.BOUNTY_WALLET ?? "EX85S7NkA1eV2nXvwxCd4PPjAjiZpRPRB13zq3YLtVaj",
);

async function collectCreatorFee(conn: Connection, creator: any) {
    const res = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            publicKey: creator.publicKey.toBase58(),
            action: "collectCreatorFee",
            priorityFee: 0.0005,
        }),
    });
    if (!res.ok) throw new Error(`pumpportal ${res.status}: ${await res.text()}`);
    const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
    tx.sign([creator]);
    const sig = await conn.sendTransaction(tx);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("  collect:", sig);
}

async function main() {
    const creator = loadKeypair(process.env.CREATOR_KEYPAIR ?? HOST_KEYPAIR);
    const conn = new Connection(RPC, "confirmed");
    const descent = descentPda();

    console.log(`\n${RUN ? "🔁 ROUTE" : "🧪 DRY"} — LYAPUNOV fee-router (Solana) · ${Number(BOUNTY_BPS) / 100}% bounty\n`);
    if (RUN && !RPC.includes("mainnet"))
        throw new Error("fee-router routes pump.fun creator fees — mainnet only. Set SOLANA_RPC_URL to mainnet.");

    const d = await fetchDescent(conn);
    if (!d) throw new Error(`descent not found at ${descent.toBase58()} (set DESCENT_PROGRAM_ID for this cluster)`);
    const t5 = d.thresholds[d.thresholds.length - 1];
    const balBefore = BigInt(await conn.getBalance(creator.publicKey));

    const line = (k: string, v: string) => console.log("  " + k.padEnd(14) + v);
    line("program", PROGRAM_ID.toBase58());
    line("creator", creator.publicKey.toBase58());
    line("creator bal", `${sol(balBefore)} SOL  (reserve ${sol(GAS_RESERVE)})`);
    line("descent", `stage ${d.stage} (${d.stageName}) · fed ${sol(d.fed)} · V ${lyapunovV(t5, d.fed).toFixed(6)}`);
    line("split", `${Number(BOUNTY_BPS) / 100}% → bounty (${BOUNTY_WALLET.toBase58()}) · ${100 - Number(BOUNTY_BPS) / 100}% → descent`);
    line("min fee", `${sol(MIN_FEE)} SOL`);

    if (!RUN) {
        console.log("\nDRY — would collect fees → split 20% to the bounty wallet, feed 80% to the descent. Re-run with --run.\n");
        return;
    }

    console.log("\n· collecting pump.fun creator fees …");
    await collectCreatorFee(conn, creator);

    const balAfter = BigInt(await conn.getBalance(creator.publicKey));
    const gained = balAfter - balBefore;
    line("collected", `${sol(gained)} SOL`);
    if (gained < MIN_FEE) {
        console.log(`\nGained ${sol(gained)} < floor ${sol(MIN_FEE)} — holding (no dust splits). Done.\n`);
        return;
    }

    // distribute, keeping the gas reserve on the creator wallet
    const avail = gained < balAfter - GAS_RESERVE ? gained : balAfter - GAS_RESERVE;
    if (avail <= 0n) {
        console.log("  below gas reserve — holding. Done.\n");
        return;
    }
    const bounty = (avail * BOUNTY_BPS) / 10000n;
    const feedAmt = avail - bounty;

    const tx = new Transaction();
    if (bounty > 0n)
        tx.add(SystemProgram.transfer({fromPubkey: creator.publicKey, toPubkey: BOUNTY_WALLET, lamports: bounty}));
    if (feedAmt > 0n) tx.add(ixFeed(creator.publicKey, descent, feedAmt));
    console.log(`· routing ${sol(bounty)} → bounty  ·  feeding ${sol(feedAmt)} → descent …`);
    const sig = await sendAndConfirmTransaction(conn, tx, [creator], {commitment: "confirmed"});

    const after = await fetchDescent(conn);
    console.log(`\n✅ routed (${sig})`);
    console.log(`  bounty budget +${sol(bounty)} SOL → ${BOUNTY_WALLET.toBase58()}`);
    console.log(
        `  descent fed ${sol(d.fed)} → ${sol(after!.fed)}  ·  stage ${d.stage} → ${after!.stage}` +
            (after!.stage > d.stage ? "  ⟵ ADVANCED" : ""),
    );
    console.log("  (the 80% in the descent vault is reclaimable to your recipient via `npm run claim` — your earnings.)\n");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
