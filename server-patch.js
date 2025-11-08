// ============================================================
// PATCH FOR server.js
// ============================================================
// Apply these changes to fix Solana X402 payments

// 1. UPDATE THE IMPORT at the top of server.js:
// OLD:
import { getChain, getAllChains } from './chains.js';

// NEW:
import { getChain, getChainWithPayTo, getAllChains } from './chains.js';


// 2. UPDATE handleX402Tool function around line 300:
// FIND this section:
/*
  let chain;
  try {
    chain = getChain(network);
  } catch (e) {
    return res.status(400).json({ ok: false, error: `Unsupported network: ${network}` });
  }
  
  const amountBase = chain.parseAmount(priceUsd);
  
  // ✅ FIX: Build payTo correctly for each chain
  const payTo = network === 'solana' 
    ? activeKeypair().publicKey.toBase58()
    : chain.paymentWallet;
*/

// REPLACE WITH:
  let chain;
  try {
    // ✅ FIX: Use getChainWithPayTo for Solana to inject the server's keypair
    chain = getChainWithPayTo(network, activeKeypair().publicKey);
  } catch (e) {
    return res.status(400).json({ ok: false, error: `Unsupported network: ${network}` });
  }
  
  const amountBase = chain.parseAmount(priceUsd);
  const payTo = chain.paymentWallet; // Now this works for both chains


// 3. UPDATE handlePaywall function around line 650:
// FIND this section:
/*
  // Get chain configuration
  let chain;
  try {
    chain = getChain(network);
  } catch (e) {
    return res.status(400).json({ ok: false, error: `Unsupported network: ${network}` });
  }
  
  const payTo = network === 'solana' 
    ? activeKeypair().publicKey 
    : { toBase58: () => chain.paymentWallet };
*/

// REPLACE WITH:
  // Get chain configuration
  let chain;
  try {
    // ✅ FIX: Use getChainWithPayTo for Solana
    chain = getChainWithPayTo(network, activeKeypair().publicKey);
  } catch (e) {
    return res.status(400).json({ ok: false, error: `Unsupported network: ${network}` });
  }
  
  // Now chain.paymentWallet works for both Solana and EVM
  const payTo = network === 'solana' 
    ? activeKeypair().publicKey 
    : { toBase58: () => chain.paymentWallet };


// ============================================================
// SUMMARY OF CHANGES
// ============================================================
/*
The issue was that:
1. chains.js set paymentWallet to process.env.MARKET_ADMIN_WALLET for Solana
2. But MARKET_ADMIN_WALLET is for marketplace fees, NOT X402 payments
3. X402 payments should go to the server's signing keypair

The fix:
1. Changed chains.js to set Solana paymentWallet to null by default
2. Added getChainWithPayTo() helper that injects the server's keypair for Solana
3. Updated server.js to use getChainWithPayTo() instead of getChain()

Now:
- Solana X402 payments go to the server's active keypair
- Base X402 payments go to BASE_PAYMENT_WALLET from .env
- Marketplace fees still go to MARKET_ADMIN_WALLET (separate from X402)
*/
