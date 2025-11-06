# X4A Open Marketplace - Quick Reference

## 🎯 What Changed?

**Before:** Admin-only closed beta marketplace
**After:** Open P2P marketplace with primary + secondary listings

---

## 📦 Files to Replace

```
✅ server.js   → Updated backend (no admin restrictions)
✅ db.js       → Added secondary_listings table + functions
✅ bot.js      → Enhanced notifications + new commands
```

---

## 🔧 Frontend Updates Required

### 1. Remove Admin Checks
```javascript
// DELETE these lines from index.html:
const MARKET_ADMIN_TOKEN = 'hl11109rtTT!!';
const ADMIN_WALLET = 'zYWREtSXNZWkqek6gEKa5EbagQsbjCuszRQzJkX4AAM';

// In connectAnyWallet(), REPLACE admin check with:
listLink.classList.remove('hidden'); // Show for everyone
```

### 2. Add Tag Styling
```css
.pill-primary { background: #EEF2FF; color: #1B4BFF; border-color: #1B4BFF; }
.pill-secondary { background: #FEF3C7; color: #F59E0B; border-color: #F59E0B; }
```

### 3. Show Tags in Cards
```javascript
// In renderMarket():
const tag = it.listing_type === 'secondary' 
  ? '<div class="pill pill-secondary">Secondary</div>'
  : '<div class="pill pill-primary">Primary</div>';
```

### 4. Add Relist Button
```javascript
// In renderInventory() for bought items:
<button data-purchase-id="${it.purchase_id}" class="btn btn-ghost">
  🔄 Relist on Secondary Market
</button>
```

---

## 🔌 New API Endpoints

### Relist Item
```bash
POST /api/secondary/relist
Headers: { "X-Wallet": "wallet_address" }
Body: { 
  "purchase_id": 123, 
  "price_usdc_base": 5000000 
}
```

### Buy Secondary Item
```bash
GET /buy/secondary/:id?wallet=buyer_wallet
# Follows X402 flow (402 → Payment → Verify)
```

### Get Secondary Listings
```bash
GET /api/secondary
Response: { 
  "ok": true, 
  "listings": [{ 
    "id": "uuid",
    "listing_type": "secondary",
    ...
  }]
}
```

---

## 🗄️ Database Changes

### New Table
```sql
secondary_listings (
  id TEXT PRIMARY KEY,
  original_purchase_id INTEGER,
  original_listing_id TEXT,
  seller TEXT,
  price_usdc_base INTEGER,
  status TEXT DEFAULT 'active',
  created_at INTEGER
)
```

### New Functions
- `insertSecondaryListing({ purchase_id, seller, price_usdc_base })`
- `getSecondaryListings()` 
- `getSecondaryListing(id)`
- `getUserSecondary(wallet)`
- `completeSecondaryPurchase({ listing_id, buyer, tx_sig })`

---

## 🤖 Bot Updates

### New Commands
- `/stats` - Show marketplace stats
- `/about` - About X4A

### Enhanced
- `/inventory` - Now shows 3 sections (owned, primary, secondary)

### New Notifications
- `secondary_sale` - Your secondary item sold
- `secondary_purchase` - You bought from secondary

---

## ⚡ Quick Deploy

```bash
# 1. Backup
cp x402.db x402.db.backup

# 2. Replace files
cp server.js db.js bot.js /your/project/

# 3. Update frontend (see FULL_UPGRADE_GUIDE.md)

# 4. Restart
npm start
node bot.js

# 5. Test
curl http://localhost:3001/api/market
curl http://localhost:3001/api/secondary
```

---

## ✅ Testing Quick Check

```bash
# List item (any wallet)
curl -X POST http://localhost:3001/api/list \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","kind":"X402-Coin","supply":10,"price_usdc_base":1000000,"wallet":"WALLET"}'

# Check listings include listing_type
curl http://localhost:3001/api/market | jq '.listings[0].listing_type'
# Should return: "primary"

# Relist item
curl -X POST http://localhost:3001/api/secondary/relist \
  -H "Content-Type: application/json" \
  -H "X-Wallet: YOUR_WALLET" \
  -d '{"purchase_id":1,"price_usdc_base":2000000}'

# Check secondary
curl http://localhost:3001/api/secondary | jq '.listings[0].listing_type'
# Should return: "secondary"
```

---

## 🎨 UI Tags Reference

| Type | Badge Color | Text | Border |
|------|-------------|------|--------|
| Primary | Blue (#EEF2FF) | #1B4BFF | #1B4BFF |
| Secondary | Gold (#FEF3C7) | #F59E0B | #F59E0B |

---

## 💰 Fee Structure

- **Platform Fee:** 10% (configurable via `MARKET_FEE_BPS`)
- **Seller Receives:** 90%
- **Split:** Automatic on-chain verification

---

## 🔍 Debugging

```javascript
// Check if secondary table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='secondary_listings';

// View all secondary listings
SELECT * FROM secondary_listings WHERE status='active';

// Check purchase ownership
SELECT buyer FROM purchases WHERE id=?;
```

---

## 📞 Key Environment Variables

```bash
MARKET_FEE_BPS=1000          # 10% fee (default)
MARKET_ADMIN_WALLET=<addr>   # Fee recipient
DB_VOLUME_PATH=/var/data     # Database location
```

---

## 🚨 Common Issues

**Issue:** "Purchase not found" when relisting
**Fix:** Verify `purchase_id` exists in bought items

**Issue:** "Item already listed"
**Fix:** Check if item has active secondary listing already

**Issue:** Tags not showing
**Fix:** Add CSS classes (pill-primary, pill-secondary)

**Issue:** Admin token still required
**Fix:** Remove all admin checks from frontend JS

---

## 📚 Full Documentation

See **FULL_UPGRADE_GUIDE.md** for complete details

---

**Ready to deploy? Follow FULL_UPGRADE_GUIDE.md step-by-step! 🚀**
