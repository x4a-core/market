// my-agent.js
import 'dotenv/config';
import axios from 'axios';
import { createX402AxiosInterceptor } from 'x402-axios';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

// *** FIX 1: Define your live server's URL ***
const SERVER_BASE_URL = 'https://x4app.app';

// 1. Setup the Agent's Wallet
const agentPrivateKey = process.env.AGENT_PRIVATE_KEY_BS58;
if (!agentPrivateKey) {
  throw new Error('AGENT_PRIVATE_KEY_BS58 not set in .env (this is your *agent* wallet, not your server wallet)');
}
const agentKeypair = Keypair.fromSecretKey(bs58.decode(agentPrivateKey));
const agentWallet = agentKeypair.publicKey;
console.log(`🤖 Agent Wallet: ${agentWallet.toBase58()}`);
console.log(`🎯 Targeting Server: ${SERVER_BASE_URL}\n`);

// 2. Define the Solana Signer for the X402 Client
const solanaSigner = async (tx) => {
  tx.partialSign(agentKeypair);
  return tx;
};

// 3. Create a new Axios instance with the X402 interceptor
const paidAxios = axios.create();
const x402Interceptor = createX402AxiosInterceptor({
  signers: { solana: solanaSigner },
});
paidAxios.interceptors.response.use(null, x402Interceptor);

// 4. Define the Agent's Tools

// Tool 1: Fetches the list of available tools from your server (unpaid)
async function getToolIndex() {
  console.log('Querying server for available tools at /tools...');
  try {
    // *** FIX 2: Use the live server URL ***
    const response = await axios.get(`${SERVER_BASE_URL}/tools`);
    return response.data;
  } catch (e) {
    console.error(`Failed to fetch tool index: ${e.message}`);
    return null;
  }
}

// Tool 2: The generic "HTTP Tool" that can pay for any URL
async function paidHttpTool(url) {
  console.log(`\nAttempting paid request to: ${url}`);
  try {
    const response = await paidAxios.get(url, {
      x402: { solana: { feePayer: agentWallet } },
    });
    return response.data;
  } catch (e) {
    console.error(`Paid request failed: ${e.message}`);
    if (e.response?.data) console.error('Server said:', e.response.data);
    return null;
  }
}

// 5. Run the Agent
async function runAgent() {
  const tools = await getToolIndex();
  if (!tools) {
    console.error("Could not fetch tools. Exiting.");
    return;
  }
  console.log('Available tools found:', tools);

  // Find the weather tool
  const weatherTool = tools.find(t => t.resourceUrl.includes('/weather'));
  if (weatherTool) {
    // *** FIX 3: Construct the full URL from the relative path ***
    const toolUrl = `${SERVER_BASE_URL}${weatherTool.resourceUrl}?city=San+Francisco`;
    const weatherData = await paidHttpTool(toolUrl);
    
    console.log('\n--- ✅ Agent Result (Weather) ---');
    console.log(weatherData);
    console.log('--------------------------------\n');
  }

  // Find the stock tool
  const stockTool = tools.find(t => t.resourceUrl.includes('/stock'));
  if (stockTool) {
    // *** FIX 4: Construct the full URL from the relative path ***
    const toolUrl = `${SERVER_BASE_URL}${stockTool.resourceUrl}?symbol=COIN`;
    const stockData = await paidHttpTool(toolUrl);

    console.log('\n--- ✅ Agent Result (Stock) ---');
    console.log(stockData);
    console.log('------------------------------');
  }
}

runAgent().catch(console.error);