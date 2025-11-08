import { Connection, PublicKey } from '@solana/web3.js';

// ============================================================
// CHAIN CONFIGURATIONS
// ============================================================

export const CHAINS = {
  solana: {
    name: 'solana',
    network: 'solana-mainnet',
    rpc: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    usdcMint: process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    // ✅ FIX: For Solana X402 payments, we need the SERVER's signing wallet
    // This should NOT be MARKET_ADMIN_WALLET (that's for marketplace fees)
    // The server.js will provide this dynamically via getChainWithPayTo()
    paymentWallet: null, // Set dynamically by server
    
    parseAmount: (usd) => Math.round(usd * 1_000_000),
    formatAmount: (baseUnits) => (baseUnits / 1_000_000).toFixed(6).replace(/\.?0+$/, ''),
    
    async verifyPayment(txSignature, expectedTransfers) {
      const connection = new Connection(this.rpc, 'confirmed');
      let parsed = null;
      
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          parsed = await connection.getParsedTransaction(txSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          });
          if (parsed) break;
        } catch (e) {
          console.warn(`Solana verify attempt ${attempt + 1}/5 failed:`, e.message);
          if (attempt < 4) await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      if (!parsed || !parsed.meta) {
        return { ok: false, reason: 'tx-not-found' };
      }
      if (parsed.meta.err) {
        return { ok: false, reason: 'tx-failed', error: parsed.meta.err };
      }
      
      const preBalances = parsed.meta.preTokenBalances || [];
      const postBalances = parsed.meta.postTokenBalances || [];
      const creditedByOwner = new Map();
      
      for (const postBal of postBalances) {
        const preBal = preBalances.find(p => p.accountIndex === postBal.accountIndex);
        const preAmount = BigInt(preBal?.uiTokenAmount?.amount || 0);
        const postAmount = BigInt(postBal.uiTokenAmount?.amount || 0);
        const delta = postAmount - preAmount;
        
        if (delta > 0n && postBal.owner) {
          creditedByOwner.set(postBal.owner, (creditedByOwner.get(postBal.owner) || 0n) + delta);
        }
      }
      
      for (const { to, amountBase } of expectedTransfers) {
        const toStr = typeof to === 'string' ? to : to.toBase58();
        const got = creditedByOwner.get(toStr) || 0n;
        const expected = BigInt(amountBase);
        
        if (got !== expected) {
          console.error(`Solana amount mismatch: expected ${expected}, got ${got} for ${toStr}`);
          return { ok: false, reason: 'amount-mismatch', expected: String(expected), got: String(got) };
        }
      }
      
      return { ok: true, txSig: txSignature };
    }
  },
  
  base: {
    name: 'base',
    network: 'base-mainnet',
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
    usdcContract: process.env.BASE_USDC_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    chainId: 8453,
    paymentWallet: process.env.BASE_PAYMENT_WALLET || process.env.MARKET_ADMIN_WALLET_BASE || '0x402A4f9aAfF4c07e5e21396AE21A529971759F89',
    
    parseAmount: (usd) => Math.round(usd * 1_000_000),
    formatAmount: (baseUnits) => (baseUnits / 1_000_000).toFixed(6).replace(/\.?0+$/, ''),
    
    async verifyPayment(txHash, expectedTransfers) {
      const { createPublicClient, http } = await import('viem');
      const { base } = await import('viem/chains');
      
      const client = createPublicClient({
        chain: base,
        transport: http(this.rpc)
      });
      
      let receipt = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          receipt = await client.getTransactionReceipt({ hash: txHash });
          if (receipt) break;
        } catch (e) {
          console.warn(`Base verify attempt ${attempt + 1}/5 failed:`, e.message);
          if (attempt < 4) await new Promise(r => setTimeout(r, 3000));
        }
      }
      
      if (!receipt) {
        return { ok: false, reason: 'tx-not-found' };
      }
      if (receipt.status !== 'success') {
        return { ok: false, reason: 'tx-failed' };
      }
      
      const TRANSFER_EVENT_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      
      const transfers = receipt.logs
        .filter(log => 
          log.address.toLowerCase() === this.usdcContract.toLowerCase() &&
          log.topics[0] === TRANSFER_EVENT_SIG
        )
        .map(log => ({
          to: '0x' + log.topics[2].slice(26),
          value: BigInt(log.data)
        }));
      
      for (const { to, amountBase } of expectedTransfers) {
        const toStr = typeof to === 'string' ? to : to.toBase58?.() || to;
        const expected = BigInt(amountBase);
        
        const found = transfers.find(t => 
          t.to.toLowerCase() === toStr.toLowerCase() &&
          t.value === expected
        );
        
        if (!found) {
          console.error(`Base transfer not found: expected ${expected} to ${toStr}`);
          return { ok: false, reason: 'transfer-not-found' };
        }
      }
      
      return { ok: true, txSig: txHash };
    }
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getChain(networkName) {
  const normalizedName = networkName.toLowerCase().replace('-mainnet', '');
  const chain = CHAINS[normalizedName];
  
  if (!chain) {
    throw new Error(`Unsupported network: ${networkName}`);
  }
  
  console.log('🔍 === getChain DEBUG ===');
  console.log('  Input network:', networkName);
  console.log('  Normalized to:', normalizedName);
  console.log('  Found chain:', chain.name);
  console.log('  Chain network:', chain.network);
  console.log('  Payment wallet:', chain.paymentWallet);
  console.log('  USDC asset:', chain.usdcMint || chain.usdcContract);
  console.log('  Chain decimals:', chain.decimals);
  console.log('  Chain ID:', chain.chainId || 'N/A');
  console.log('========================');
  
  // ✅ FIX: Only validate paymentWallet for non-Solana chains
  // Solana wallet will be set by server.js dynamically
  if (chain.name !== 'solana' && !chain.paymentWallet) {
    console.error('❌ CRITICAL: paymentWallet is undefined for chain:', chain.name);
    throw new Error(`Chain ${chain.name} has no paymentWallet configured. Check .env file.`);
  }
  
  if (chain.name === 'base' && !chain.usdcContract) {
    console.error('❌ CRITICAL: usdcContract is undefined for Base chain');
    throw new Error('Base chain has no usdcContract configured. Check BASE_USDC_CONTRACT in .env');
  }
  
  return chain;
}

// ✅ NEW: Helper to get chain with dynamic Solana paymentWallet
export function getChainWithPayTo(networkName, solanaPayTo) {
  const chain = getChain(networkName);
  
  // If Solana, override the paymentWallet with the server's active keypair
  if (chain.name === 'solana' && solanaPayTo) {
    return {
      ...chain,
      paymentWallet: typeof solanaPayTo === 'string' ? solanaPayTo : solanaPayTo.toBase58()
    };
  }
  
  return chain;
}

export function getAllChains() {
  const enabledChains = [];
  
  enabledChains.push({
    name: CHAINS.solana.name,
    network: CHAINS.solana.network,
    rpc: CHAINS.solana.rpc.includes('mainnet') ? 'https://***' : CHAINS.solana.rpc,
    usdcAddress: CHAINS.solana.usdcMint,
    decimals: CHAINS.solana.decimals
  });
  
  if (process.env.ENABLE_BASE === 'true') {
    console.log('✅ Base chain is enabled');
    console.log('   BASE_PAYMENT_WALLET:', process.env.BASE_PAYMENT_WALLET || 'NOT SET');
    console.log('   BASE_USDC_CONTRACT:', process.env.BASE_USDC_CONTRACT || 'NOT SET');
    
    enabledChains.push({
      name: CHAINS.base.name,
      network: CHAINS.base.network,
      rpc: 'https://***',
      usdcAddress: CHAINS.base.usdcContract,
      decimals: CHAINS.base.decimals,
      chainId: CHAINS.base.chainId
    });
  } else {
    console.log('⚠️ Base chain is disabled (ENABLE_BASE != true)');
  }
  
  return enabledChains;
}
