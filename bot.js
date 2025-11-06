import 'dotenv/config';
import { Telegraf } from 'telegraf';
import {
  getUserByTelegram,
  linkWalletTelegram,
  getStatus,
  getBought,
  getListed,
} from './db.js';

/* ------------------- Env / Bot init ------------------- */
const BOT_NAME = process.env.TELEGRAM_BOT_NAME || 'X4A Facilitator';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN in environment');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/* ------------------- Utils ------------------- */
function fmtSecs(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

// Simple HTML escape: Only <, &, " need it for text content
function htmlEscape(str = '') {
  if (typeof str !== 'string') {
    str = String(str);
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')  // Explicitly escape > for safety (though not always required)
    .replace(/"/g, '&quot;');
}

function short(addr = '') {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '–';
}

// Function to format timestamp to a readable date
function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      // timeZoneName: 'short', // Uncomment if you want timezone
    });
  } catch (e) {
    return 'Date Error';
  }
}

/* ------------------- Exported notify ------------------- */
// Let server.js import { tgNotify } and push messages to users
// Updated tgNotify to handle structured data for payment notifications
export async function tgNotify(telegramId, data) {
  try {
    if (!bot || !telegramId || !data) return;

    let messageText;

    // Handle structured data objects
    if (typeof data === 'object' && data.type) {
      switch (data.type) {
        
        // For /paywall success
        case 'payment_confirmation':
          messageText = [
            '✨ <b>Payment Confirmation!</b> ✨', // HTML bold
            '', // Empty line for spacing
            `<b>Tier:</b> <code>${htmlEscape(data.tier)}</code>`,
            `<b>Amount:</b> <code>${htmlEscape(data.amount)} USDC</code>`,
            `<b>Transaction:</b> <code>${htmlEscape(short(data.tx))}</code>`,
            `<b>Access Until:</b> ${htmlEscape(formatTimestamp(data.accessUntil))}`,
          ].join('\n');
          break;

        // For /paywall token-gated free unlock
        case 'gated_unlock':
          messageText = [
            '✅ <b>Token-Gated Unlock!</b>', // HTML bold
            '',
            `<b>Tier:</b> <code>${htmlEscape(data.tier)}</code>`,
            `<b>Amount:</b> <code>0 USDC</code>`,
            `<b>Access Until:</b> ${htmlEscape(formatTimestamp(data.accessUntil))}`,
          ].join('\n');
          break;
        
        // For /buy seller notification
        case 'sale_confirmation':
          messageText = [
            '🛍️ <b>You Made a Sale!</b>',
            '',
            `<b>Item:</b> <code>${htmlEscape(data.item)}</code>`,
            `<b>Amount:</b> <code>${htmlEscape(data.amount)} USDC</code>`,
            `<b>Buyer:</b> <code>${htmlEscape(short(data.buyer))}</code>`,
            `<b>Transaction:</b> <code>${htmlEscape(short(data.tx))}</code>`,
          ].join('\n');
          break;
        
        // For /buy buyer notification
        case 'purchase_confirmation':
          messageText = [
            '🛒 <b>Purchase Confirmed!</b>',
            '',
            `<b>Item:</b> <code>${htmlEscape(data.item)}</code>`,
            `<b>Receipt NFT:</b> <code>${htmlEscape(data.receiptMint ? short(data.receiptMint) : 'N/A')}</code>`,
            `<b>Transaction:</b> <code>${htmlEscape(short(data.tx))}</code>`,
          ].join('\n');
          break;

        // Fallback for unknown object types
        default:
          messageText = htmlEscape(data.message || 'Received an unknown notification type.');
      }
    } 
    // Handle simple string messages (legacy support)
    else if (typeof data === 'string') {
      messageText = htmlEscape(data);
    } 
    // Handle any other invalid format
    else {
      messageText = htmlEscape('Received an invalid notification.');
    }
    
    // Log the message for debugging
    console.log(`Sending Telegram notification to ${telegramId}: ${messageText.substring(0, 200)}...`);

    await bot.telegram.sendMessage(String(telegramId), messageText, {
      parse_mode: 'HTML',  // Switched to HTML
    });
  } catch (e) {
    console.error('Telegram notify error:', e?.message || e);
    console.error('Failed messageText:', messageText);  // Log the exact text that failed
    // Try to send a plain text fallback if formatting failed
    if (e.response && e.response.error_code === 400) {
      try {
        const plainText = `Notification failed to format. Details: ${htmlEscape(JSON.stringify(data))}. Check inventory manually.`;
        await bot.telegram.sendMessage(String(telegramId), plainText);
      } catch (e2) {
        console.error('Telegram double-fault error:', e2?.message || e2);
      }
    }
  }
}

/* ------------------- Commands ------------------- */
bot.start(async (ctx) => {
  const msg = [
    `👋 Welcome to ${htmlEscape(BOT_NAME)}`,
    htmlEscape('This bot links your Solana wallet to receive purchase receipts, ownership confirmations, and paywall status.'),
    '',
    '<b>Commands</b>',
    '/link &lt;wallet&gt; — link wallet',
    '/status — check your access',
    '/inventory — view purchased + listed items',
    '/help — help text',
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.help(async (ctx) => {
  const msg = [
    '🛒 <b>X4A Marketplace Guide</b>',
    '• Use /link &lt;wallet&gt; to connect your wallet',
    '• Items purchased may mint on-chain receipt NFTs',
    '• Use /inventory to see what you bought and what you listed',
    htmlEscape('• Listings are immutable (no delist) to prevent scams'),
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.command('link', async (ctx) => {
  try {
    const text = ctx.message?.text || '';
    const [, maybeWallet] = text.trim().split(/\s+/, 2);

    if (!maybeWallet) {
      return ctx.reply(htmlEscape('Usage: /link &lt;walletPublicKey&gt;'), { parse_mode: 'HTML' });
    }

    const wallet = maybeWallet.trim();

    // Base58 Solana pubkey 32..44 chars
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      return ctx.reply('❌ Invalid Solana address', { parse_mode: 'HTML' });
    }

    // Link or update mapping
    linkWalletTelegram(wallet, ctx.from.id);

    const msg = [
      '✅ <b>Wallet Linked</b>',
      `<code>${htmlEscape(wallet)}</code>`,
      htmlEscape('You will now receive purchase confirmations.'),
    ].join('\n');

    return ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('link error:', e);
    return ctx.reply('❌ Error linking. Try again.', { parse_mode: 'HTML' });
  }
});

bot.command('status', async (ctx) => {
  try {
    const row = getUserByTelegram(ctx.from.id);
    if (!row?.wallet) {
      return ctx.reply(htmlEscape('No wallet linked. Use /link &lt;wallet&gt; first.'), { parse_mode: 'HTML' });
    }

    const st = getStatus(row.wallet);
    if (!st?.active) {
      const msg = `🔒 No active access for <code>${htmlEscape(row.wallet)}</code>`;
      return ctx.reply(msg, { parse_mode: 'HTML' });
    }

    const msg = [
      '✅ <b>Active Access</b>',
      `Tier: ${htmlEscape(st.tier || '-')}`,
      `Time Left: ~${htmlEscape(fmtSecs(st.secondsLeft))}`,
      `Wallet: <code>${htmlEscape(row.wallet)}</code>`,
    ].join('\n');

    return ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('status error:', e);
    return ctx.reply('❌ Could not fetch status.', { parse_mode: 'HTML' });
  }
});

bot.command('inventory', async (ctx) => {
  try {
    const row = getUserByTelegram(ctx.from.id);
    if (!row?.wallet) {
      return ctx.reply(htmlEscape('❌ No wallet linked. Use /link &lt;wallet&gt;'), { parse_mode: 'HTML' });
    }

    const wallet = row.wallet;
    const listed = getListed(wallet) || [];
    const bought = getBought(wallet) || [];

    let msg = `📦 <b>Your X4A Inventory</b>\nWallet: <code>${htmlEscape(wallet)}</code>\n\n`;

    // Bought
    msg += `🛍️ <b>Bought Items</b> (${bought.length})\n`;
    if (bought.length === 0) {
      msg += '_None yet_\n';
    } else {
      for (const i of bought.slice(0, 30)) { // reasonable cap for a single message
        const title = htmlEscape(i.title || 'Untitled');
        const receipt = i.receiptMint ? `<code>${htmlEscape(short(i.receiptMint))}</code>` : 'Off-Chain DB';
        msg += `• ${title} — <b>Receipt:</b> ${receipt}\n`;
      }
      if (bought.length > 30) {
        msg += `…and ${bought.length - 30} more\n`;
      }
    }

    // Listed
    msg += `\n📤 <b>Your Listings</b> (${listed.length})\n`;
    if (listed.length === 0) {
      msg += '_No listings_\n';
    } else {
      for (const i of listed.slice(0, 30)) {
        const title = htmlEscape(i.title || 'Untitled');
        const rem = `${i.remaining ?? 0}/${i.supply ?? 0}`;
        msg += `• ${title} — Remaining: ${htmlEscape(rem)}\n`;
      }
      if (listed.length > 30) {
        msg += `…and ${listed.length - 30} more\n`;
      }
    }

    return ctx.reply(msg, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('inventory error:', e);
    return ctx.reply('❌ Could not fetch inventory.', { parse_mode: 'HTML' });
  }
});

/* ------------------- Launch & Shutdown ------------------- */
bot.launch()
  .then(() => console.log('✅ Telegram bot started'))
  .catch((err) => {
    console.error('❌ Telegram bot error:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));