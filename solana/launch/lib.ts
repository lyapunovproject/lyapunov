// Shared helpers for the LYAPUNOV (Solana) launch scripts.
// Raw @solana/web3.js — no Anchor/IDL (the program is hand-rolled, no framework).
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {readFileSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";

// devnet is the default home of the descent program (pump.fun itself is mainnet-only).
export const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
    process.env.DESCENT_PROGRAM_ID ?? "3ksCh6Jtk79xwEVvwAbXex3KctxL2YEEhjYiBe8tSkhp",
);
export const SEED = Buffer.from("descent");

export const STAGES = [
    "PERTURBATION",
    "TRANSIENT",
    "CONTRACTION",
    "DISSIPATION",
    "EQUILIBRIUM",
    "ASYMPTOTIC",
    "ATTRACTOR",
] as const;

export const HOST_KEYPAIR = process.env.HOST_KEYPAIR ?? join(homedir(), ".lyapunov-sol/host.json");
export const RECIPIENT_KEYPAIR =
    process.env.RECIPIENT_KEYPAIR ?? join(homedir(), ".lyapunov-sol/recipient.json");

export function loadKeypair(v: string | undefined): Keypair {
    if (!v) throw new Error("keypair path/secret not set");
    const t = v.trim();
    if (t.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(t)));
    try {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(t, "utf8"))));
    } catch {
        return Keypair.fromSecretKey(bs58.decode(t));
    }
}

export function descentPda(): PublicKey {
    return PublicKey.findProgramAddressSync([SEED], PROGRAM_ID)[0];
}

// ── instruction builders (1-byte tag + little-endian args) ──────────────────
const sys = () => ({pubkey: SystemProgram.programId, isSigner: false, isWritable: false});

export function ixInitialize(
    payer: PublicKey,
    descent: PublicKey,
    host: PublicKey,
    recipient: PublicKey,
    thresholdsLamports: bigint[],
): TransactionInstruction {
    const data = Buffer.alloc(1 + 32 + 32 + 48);
    data[0] = 0;
    host.toBuffer().copy(data, 1);
    recipient.toBuffer().copy(data, 33);
    thresholdsLamports.forEach((t, i) => data.writeBigUInt64LE(t, 65 + i * 8));
    return new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
            {pubkey: payer, isSigner: true, isWritable: true},
            {pubkey: descent, isSigner: false, isWritable: true},
            sys(),
        ],
        data,
    });
}

export function ixFeed(feeder: PublicKey, descent: PublicKey, amountLamports: bigint): TransactionInstruction {
    const data = Buffer.alloc(9);
    data[0] = 1;
    data.writeBigUInt64LE(amountLamports, 1);
    return new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
            {pubkey: feeder, isSigner: true, isWritable: true},
            {pubkey: descent, isSigner: false, isWritable: true},
            sys(),
        ],
        data,
    });
}

export function ixClaim(
    host: PublicKey,
    descent: PublicKey,
    recipient: PublicKey,
    amountLamports: bigint,
): TransactionInstruction {
    const data = Buffer.alloc(9);
    data[0] = 2;
    data.writeBigUInt64LE(amountLamports, 1);
    return new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
            {pubkey: host, isSigner: true, isWritable: true},
            {pubkey: descent, isSigner: false, isWritable: true},
            {pubkey: recipient, isSigner: false, isWritable: true},
        ],
        data,
    });
}

// ── account decode (fixed offsets — identical to the Anchor layout) ─────────
export interface DescentState {
    host: PublicKey;
    recipient: PublicKey;
    thresholds: bigint[];
    stage: number;
    stageName: string;
    fed: bigint;
    vault: bigint;
    feeders: number;
    bump: number;
}

export function decodeDescent(data: Buffer): DescentState {
    const u64 = (o: number) => data.readBigUInt64LE(o);
    const thresholds: bigint[] = [];
    for (let i = 0; i < 6; i++) thresholds.push(u64(72 + i * 8));
    return {
        host: new PublicKey(data.subarray(8, 40)),
        recipient: new PublicKey(data.subarray(40, 72)),
        thresholds,
        stage: data[120],
        stageName: STAGES[data[120]] ?? "UNKNOWN",
        fed: u64(121),
        vault: u64(129),
        feeders: Number(u64(137)),
        bump: data[161],
    };
}

export async function fetchDescent(conn: Connection): Promise<DescentState | null> {
    const info = await conn.getAccountInfo(descentPda(), "confirmed");
    return info ? decodeDescent(Buffer.from(info.data)) : null;
}

// V = t5 / (t5 + fed) — 1.0 at genesis, falling monotonically.
export const lyapunovV = (t5: bigint, fed: bigint) => Number(t5) / Number(t5 + fed);
export const sol = (lamports: bigint | number) => Number(lamports) / 1e9;
export const toLamports = (s: string) => BigInt(Math.round(parseFloat(s) * 1e9));
