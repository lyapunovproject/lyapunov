// LYAPUNOV — web service: serves the static site and a cached on-chain state API.
// Reads the Solana `lyapunov_descent` program (the descent PDA) and exposes it at
// /api/state so the browser polls the server (cached) instead of hitting an RPC
// per visitor. Values are normalized to the 1e18 scale the frontend already uses,
// so fed/vault are reported in SOL and V as the unitless Lyapunov ratio.
const path = require('path');
const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');

const PORT = process.env.PORT || 10000;
const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey(process.env.DESCENT_PROGRAM_ID || '52UAvNR3QXHqdW8bRDhBRWpgJByPfs8w3681SXvSGJa9');
// Set once the pump.fun token is live (the mint address). Until then the Buy CTA
// renders a "launching" state.
const MINT = process.env.LPNV_MINT || 'pvysiEDLr6E9SsS4gETrDCikMdekAPBtYxK7AnZpump';

const STAGES = ['PERTURBATION','TRANSIENT','CONTRACTION','DISSIPATION','EQUILIBRIUM','ASYMPTOTIC','ATTRACTOR'];
const [DESCENT] = PublicKey.findProgramAddressSync([Buffer.from('descent')], PROGRAM_ID);

const E9 = 1000000000n;          // lamports per SOL
const E18 = 1000000000000000000n; // frontend works in 1e18 fixed-point

const connection = new Connection(RPC, 'confirmed');

// Account layout after the 8-byte Anchor discriminator:
//   host[32] recipient[32] thresholds[6*8] stage[1] fed[8] vault[8] feeders[8] ...
function decode(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u64 = (off) => dv.getBigUint64(off, true);
  const thresholds = [];
  for (let i = 0; i < 6; i++) thresholds.push(u64(72 + i * 8)); // lamports
  return {
    thresholds,
    stage: buf[120],
    fed: u64(121),     // lamports
    vault: u64(129),   // lamports
    feeders: Number(u64(137)),
  };
}

let cache = { at: 0, data: null };
async function readState() {
  const now = Date.now();
  if (cache.data && now - cache.at < 10_000) return cache.data;

  const info = await connection.getAccountInfo(DESCENT, 'confirmed');
  if (!info) throw new Error(`descent PDA ${DESCENT.toBase58()} not initialized`);
  const d = decode(info.data);

  const t5 = d.thresholds[5];
  const V = ((t5 * E18) / (t5 + d.fed)).toString();        // ratio * 1e18, 1.0 at genesis
  const toFixed18 = (lamports) => (lamports * E9).toString(); // SOL * 1e18

  const data = {
    chain: 'solana',
    cluster: RPC.includes('devnet') ? 'devnet' : (RPC.includes('mainnet') ? 'mainnet' : 'custom'),
    address: DESCENT.toBase58(),
    program: PROGRAM_ID.toBase58(),
    mint: MINT,
    buyUrl: MINT ? `https://pump.fun/coin/${MINT}` : null,
    explorerUrl: MINT ? `https://solscan.io/token/${MINT}` : null,
    stage: d.stage,
    stageName: STAGES[d.stage] || 'UNKNOWN',
    fed: toFixed18(d.fed),
    vault: toFixed18(d.vault),
    V,
    feeders: d.feeders,
    thresholds: d.thresholds.map(toFixed18),
    at: now,
  };
  cache = { at: now, data };
  return data;
}

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/api/state', async (_req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=10');
    res.json(await readState());
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
});
// Farcaster mini-app manifest (Express static ignores dotfile dirs, so serve it explicitly)
app.get('/.well-known/farcaster.json', (_req, res) => {
  res.set('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'site', '.well-known', 'farcaster.json'));
});
app.use(express.static(path.join(__dirname, 'site'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'site', 'index.html')));
app.listen(PORT, () => console.log(`lyapunov web service :${PORT} → descent ${DESCENT.toBase58()} via ${RPC}`));
