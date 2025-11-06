// db.js
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/* ---------- Setup ---------- */
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'x402.db'));
db.pragma('journal_mode = wal');
db.pragma('synchronous = normal');      // good balance for WAL
db.pragma('foreign_keys = on');         // enforce FK integrity

/* ---------- Tables ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT UNIQUE,
  telegram_id TEXT UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT NOT NULL,
  tier        TEXT NOT NULL,
  amount_base INTEGER NOT NULL CHECK (amount_base >= 0),
  tx_sig      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS entitlements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT NOT NULL,
  tier        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id              TEXT PRIMARY KEY,
  seller          TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  kind            TEXT NOT NULL, -- digital | physical | service | crypto | virtual
  supply          INTEGER NOT NULL CHECK (supply >= 0),
  remaining       INTEGER NOT NULL CHECK (remaining >= 0),
  price_usdc_base INTEGER NOT NULL CHECK (price_usdc_base >= 0),
  mint            TEXT,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  TEXT NOT NULL,
  buyer       TEXT NOT NULL,
  quantity    INTEGER DEFAULT 1 CHECK (quantity > 0),
  tx_sig      TEXT NOT NULL,
  receiptMint TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);
`);

/* ---------- Migrations ---------- */
// listings.mint column
const listColCheck = db.prepare(`
  SELECT name FROM pragma_table_info('listings') WHERE name='mint'
`).get();
if (!listColCheck) {
  db.exec(`ALTER TABLE listings ADD COLUMN mint TEXT`);
  console.log('✅ DB migrated: added listings.mint column');
}

// purchases.receiptMint column
const purchaseColCheck = db.prepare(`
  SELECT name FROM pragma_table_info('purchases') WHERE name='receiptMint'
`).get();
if (!purchaseColCheck) {
  db.exec(`ALTER TABLE purchases ADD COLUMN receiptMint TEXT`);
  console.log('✅ DB migrated: added purchases.receiptMint column');
}

/* ---------- Indexes (perf) ---------- */
db.exec(`
CREATE INDEX IF NOT EXISTS idx_listings_remaining_created
  ON listings (remaining DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_seller
  ON listings (seller, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_created
  ON purchases (buyer, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entitlements_wallet_expires
  ON entitlements (wallet, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_wallet_created
  ON payments (wallet, created_at DESC);
`);

/* ---------- Prepared Statements ---------- */
const upsertUserByWallet = db.prepare(`
  INSERT INTO users (wallet) VALUES (?)
  ON CONFLICT(wallet) DO NOTHING
`);
const linkTelegram = db.prepare(`
  INSERT INTO users (wallet, telegram_id) VALUES (?, ?)
  ON CONFLICT(wallet) DO UPDATE SET telegram_id=excluded.telegram_id
`);

const _getUserByWalletStmt   = db.prepare(`SELECT * FROM users WHERE wallet = ?`);
const _getUserByTelegramStmt = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`);

const insertPayment      = db.prepare(`INSERT INTO payments (wallet, tier, amount_base, tx_sig) VALUES (?, ?, ?, ?)`);
const insertEntitlement  = db.prepare(`INSERT INTO entitlements (wallet, tier, expires_at) VALUES (?, ?, ?)`);
const getEntitlementLatest = db.prepare(`
  SELECT * FROM entitlements WHERE wallet = ? ORDER BY expires_at DESC LIMIT 1
`);
const getEntitlementByTier = db.prepare(`
  SELECT * FROM entitlements WHERE wallet = ? AND tier = ? ORDER BY expires_at DESC LIMIT 1
`);

const insertListing = db.prepare(`
  INSERT INTO listings (id, seller, title, description, image_url, kind, supply, remaining, price_usdc_base, mint)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getAllListings   = db.prepare(`SELECT * FROM listings WHERE remaining > 0 ORDER BY created_at DESC`);
const getListingById   = db.prepare(`SELECT * FROM listings WHERE id = ?`);
const decrementRemaining = db.prepare(`
  UPDATE listings
     SET remaining = remaining - 1
   WHERE id = ?
     AND remaining > 0
`);

const insertPurchase = db.prepare(`
  INSERT INTO purchases (listing_id, buyer, quantity, tx_sig, receiptMint)
  VALUES (?, ?, ?, ?, ?)
`);

const getInventoryListed = db.prepare(`
  SELECT * FROM listings WHERE seller = ? ORDER BY created_at DESC
`);
const getInventoryBought = db.prepare(`
  SELECT
    p.*,
    p.receiptMint,
    l.title, l.description, l.image_url, l.kind, l.supply, l.remaining,
    l.price_usdc_base, l.mint, l.created_at AS listing_created_at
  FROM purchases p
  JOIN listings l ON p.listing_id = l.id
  WHERE p.buyer = ?
  ORDER BY p.created_at DESC
`);

/* ---------- Small helpers ---------- */
function asInt(n, fallback = 0) {
  // Coerce numbers/strings to safe integers
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

/* ---------- Exported Functions ---------- */
export function getUserByWallet(wallet) {
  return _getUserByWalletStmt.get(wallet) || null;
}
export function getUserByTelegram(telegramId) {
  return _getUserByTelegramStmt.get(String(telegramId)) || null;
}
export function ensureUser(wallet) {
  if (!wallet) return;
  upsertUserByWallet.run(wallet);
}
export function linkWalletTelegram(wallet, telegramId) {
  linkTelegram.run(wallet, String(telegramId));
}

export function insertPaymentRecord({ wallet, tier, amountBase, txSig }) {
  insertPayment.run(wallet, tier, asInt(amountBase, 0), txSig || null);
}

export function grantOrExtendEntitlement({ wallet, tier, durationSec }) {
  const now = Math.floor(Date.now() / 1000);
  const current = getEntitlementByTier.get(wallet, tier);
  const base = current && current.expires_at > now ? current.expires_at : now;
  const expires = base + Number(durationSec || 0);
  insertEntitlement.run(wallet, tier, asInt(expires, now));
  return expires;
}

export function getStatus(wallet) {
  const ent = getEntitlementLatest.get(wallet);
  const now = Math.floor(Date.now() / 1000);
  if (!ent) return { active: false, wallet, tier: null, expiresAt: null, secondsLeft: 0 };
  const left = Math.max(0, ent.expires_at - now);
  return { active: left > 0, wallet, tier: ent.tier, expiresAt: ent.expires_at, secondsLeft: left };
}

/* ---- Marketplace ---- */
export function insertListingRecord({
  id, seller, title, description, image_url, kind, supply, price_usdc_base, mint = null
}) {
  const supplyInt = asInt(supply, 0);
  const priceInt  = asInt(price_usdc_base, 0);
  insertListing.run(
    id, seller, title, description || null, image_url || null, kind,
    supplyInt, supplyInt, priceInt, mint || null
  );
}
export function getAllMarketListings() {
  return getAllListings.all();
}
export function getListing(id) {
  return getListingById.get(id);
}
export function getListed(wallet) {
  return getInventoryListed.all(wallet);
}
export function getBought(wallet) {
  return getInventoryBought.all(wallet);
}

/* ---- Atomic Purchase (prevents race on last unit) ---- */
const recordPurchaseTransaction = db.transaction(({ listing_id, buyer, tx_sig, receiptMint }) => {
  const result = decrementRemaining.run(listing_id);
  if (result.changes === 0) {
    throw new Error('Sold out');
  }
  insertPurchase.run(listing_id, buyer, 1, tx_sig, receiptMint || null);
});

export function completePurchase(data) {
  recordPurchaseTransaction(data);
}

/* ---- Optional: Close DB on shutdown ---- */
export function closeDB() {
  try { db.close(); } catch {}
}

// Secondary listings
export function insertSecondaryListing({ original_id, seller, price_usdc_base }) { /* SQL */ }
export function getSecondaryListings() { /* SQL */ }
export function getUserSecondary(wallet) { /* SQL */ }
export function completeSecondaryPurchase({ listing_id, buyer, tx_sig }) { /* SQL + commission */ }
