// mcp-x4a.js
import 'dotenv/config';
import fetch from 'node-fetch';
import bs58 from 'bs58';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  Connection, PublicKey, Transaction, Keypair,
} from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

const RPC      = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const USDC     = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const X4A_BASE = process.env.X4A_BASE || 'https://x4a.app';
const PAYER_SECRET = (process.env.PAYER_SECRET || '').trim();
if (!PAYER_SECRET) throw new Error('Set PAYER_SECRET in .env');

const payer = (() => {
  if (PAYER_SECRET.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(PAYER_SECRET)));
  }
  return Keypair.fromSecretKey(bs58.decode(PAYER_SECRET));
})();

const conn = new Connection(RPC, 'confirmed');

async function payAndFetch(url, { method='GET', body } = {}) {
  // 1) Expect 402 challenge
  const first = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (first.status !== 402) {
    const data = await first.json().catch(()=> ({}));
    return { ok: first.ok, data, headers: first.headers };
  }
  const challenge = await first.json();
  const req = challenge.accepts?.[0];
  if (!req) throw new Error('Bad 402 challenge');

  const payTo      = new PublicKey(req.payTo);
  const amountBase = BigInt(req.maxAmountRequired);

  // 2) Build USDC transfer (create ATAs if needed)
  const payerATA = getAssociatedTokenAddressSync(USDC, payer.publicKey);
  const payToATA = getAssociatedTokenAddressSync(USDC, payTo);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });

  const payerAcc = await conn.getAccountInfo(payerATA);
  const payToAcc = await conn.getAccountInfo(payToATA);
  if (!payerAcc) tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, payerATA, payer.publicKey, USDC));
  if (!payToAcc) tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, payToATA, payTo, USDC));

  tx.add(createTransferCheckedInstruction(
    payerATA, USDC, payToATA, payer.publicKey, Number(amountBase), 6
  ));

  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, 'confirmed');

  // 3) Retry with X-PAYMENT
  const xPayment = Buffer.from(JSON.stringify({
    x402Version: 1,
    scheme: 'exact',
    network: 'solana',
    payload: { txSignature: sig },
  })).toString('base64');

  const second = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-PAYMENT': xPayment },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await second.json().catch(()=> ({}));
  return { ok: second.ok, data, headers: second.headers };
}

const server = new McpServer({ name: 'x4a-mcp', version: '1.0.0' });

// Tool: Paid Weather
server.tool(
  'weather_paid',
  'Call x4a /weather via x402 (pays in USDC)',
  { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  async ({ city }) => {
    const url = `${X4A_BASE}/weather?city=${encodeURIComponent(city)}`;
    const res = await payAndFetch(url);
    return { content: [{ type: 'text', text: JSON.stringify(res.data) }] };
  }
);

// Tool: Paid Grok
server.tool(
  'grok_query_paid',
  'Call x4a /grok-query via x402 (pays in USDC)',
  { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
  async ({ prompt }) => {
    const url = `${X4A_BASE}/grok-query?prompt=${encodeURIComponent(prompt)}`;
    const res = await payAndFetch(url);
    return { content: [{ type: 'text', text: JSON.stringify(res.data) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
