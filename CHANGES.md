# X4A Marketplace Upgrade: Open Marketplace with Primary/Secondary Listings

## Summary of Changes

This upgrade removes all admin restrictions and enables a fully open P2P marketplace where:
1. **Anyone can list items** (no admin tokens required)
2. **Buyers can resell items** they've purchased
3. **Clear visual distinction** between primary and secondary listings

---

## Backend Changes (server.js)

### 1. Remove Admin Restrictions from Listing Endpoint

**Location:** `app.post('/api/list', ...)`

**Changes:**
- Remove `adminToken` validation
- Remove `MARKET_ADMIN_WALLET` check
- Keep validation for required fields only

```javascript
app.post('/api/list', express.json(), async (req, res) => {
  const { title, description, image_url, kind, supply, price_usdc_base, wallet, mint } = req.body;

  // Open to all users - validation only
  if (!wallet || !title || typeof supply !== 'number' || supply <= 0 || supply > 1_000_000_000 || typeof price_usdc_base !== 'number' || price_usdc_base <= 0) {
    return res.status(400).json({ ok: false, error: 'Missing/invalid fields (wallet, title, supply 1-1B, price > 0 required)' });
  }

  const id = crypto.randomUUID();
  try {
    insertListingRecord({ id, seller: wallet, title, description: description || null, image_url: image_url || null, kind, supply, price_usdc_base, mint: mint || null });
    res.json({ ok: true, id, message: 'Item listed successfully! Open marketplace.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
```

### 2. Add `listing_type` to Market Listings

**Location:** `app.get('/api/market', ...)`

```javascript
app.get('/api/market', (_req, res) => {
  try {
    const rows = getAllMarketListings();
    const listings = rows.map(row => ({
      ...row,
      usdcPrice: (row.price_usdc_base / 1e6).toFixed(6),
      sellerShort: row.seller ? row.seller.slice(0, 4) + '...' + row.seller.slice(-4) : '',
      listing_type: 'primary' // All initial listings are primary
    }));
    res.json({ ok: true, listings });
  } catch (e) {
    console.error("Failed to get market listings:", e.message);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});
```

### 3. Add Relist Endpoint for Secondary Market

**New Endpoint:** `POST /api/secondary/relist`

```javascript
app.post('/api/secondary/relist', express.json(), async (req, res) => {
  try {
    const { purchase_id, price_usdc_base } = req.body;
    const wallet = req.headers['x-wallet']?.toString();
    
    if (!wallet || !purchase_id || !price_usdc_base || price_usdc_base <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid input (x-wallet header, purchase_id, price_usdc_base required)" });
    }

    // Verify ownership through bought items
    const bought = getBought(wallet);
    const ownedItem = bought.find(item => item.purchase_id === purchase_id);
    
    if (!ownedItem) {
      return res.status(403).json({ ok: false, error: "You don't own this item or it doesn't exist" });
    }

    const id = insertSecondaryListing({ 
      original_id: ownedItem.id, 
      seller: wallet, 
      price_usdc_base,
      purchase_id 
    });
    
    res.json({ ok: true, id, message: 'Item listed on secondary market!' });
  } catch (e) {
    console.error("Failed to relist:", e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});
```

### 4. Update Secondary Listings to Show Type

**Location:** `app.get('/api/secondary', ...)`

```javascript
app.get('/api/secondary', (req, res) => {
  try {
    const listings = getSecondaryListings().map(row => ({
      ...row,
      usdcPrice: (row.price_usdc_base / 1e6).toFixed(6),
      sellerShort: row.seller ? row.seller.slice(0, 4) + '...' + row.seller.slice(-4) : '??',
      listing_type: 'secondary' // Mark as secondary
    }));
    res.json({ ok: true, listings });
  } catch (e) {
    console.error("Failed to get secondary listings:", e.message);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});
```

### 5. Add Secondary Buy Route

**New Route:** `GET /buy/secondary/:id`

```javascript
app.get('/buy/secondary/:id', async (req, res) => {
  // Similar to primary buy but for secondary listings
  // Includes proper challenge and verification
  // See full implementation in server.js
});
```

---

## Frontend Changes (index.html)

### 1. Remove Admin Restrictions from UI

**In JavaScript section, remove these checks:**

```javascript
// OLD - REMOVE:
const MARKET_ADMIN_TOKEN = 'hl11109rtTT!!';
const ADMIN_WALLET = 'zYWREtSXNZWkqek6gEKa5EbagQsbjCuszRQzJkX4AAM';

// In connectAnyWallet function - REMOVE:
if (walletPubkey === ADMIN_WALLET) listLink.classList.remove('hidden');
else { listLink.classList.add('hidden'); banner('Closed beta: only admin can list', false); }

// NEW - REPLACE WITH:
// Show list link for all connected wallets
listLink.classList.remove('hidden');
```

### 2. Update Navigation

**In HTML header:**

```html
<a id="navList" href="#list" class="text-[var(--muted)] hover:text-[var(--brand)]">List Item</a>
```

Remove the `hidden` class from #navList initially.

### 3. Update List Section UI

**Replace the "Admin Only" header:**

```html
<!-- OLD -->
<h2 class="text-2xl font-semibold mb-6">List New Item (Admin Only • Closed Beta)</h2>

<!-- NEW -->
<h2 class="text-2xl font-semibold mb-6">List New Item</h2>
<p class="text-[var(--muted)] mb-4">Create your own listing on the open marketplace. Anyone can list!</p>
```

**Update the submit button:**

```html
<!-- OLD -->
<button id="submitList" class="btn btn-primary clean-shadow" disabled>List (Admin)</button>

<!-- NEW -->
<button id="submitList" class="btn btn-primary clean-shadow" disabled>List Item</button>
```

**Update helper text:**

```html
<!-- OLD -->
<p class="text-xs text-[var(--muted)] mt-3">Listings are immutable (no delist) to prevent scams. Max supply: 1000. Virtual items stored off-chain in DB.</p>

<!-- NEW -->
<p class="text-xs text-[var(--muted)] mt-3">
  Open marketplace! Listings are immutable. Max supply: 1 billion. Virtual items stored off-chain in DB.
  Fee: 10% to facilitate network.
</p>
```

### 4. Add Primary/Secondary Tags to Cards

**Update renderMarket() function:**

```javascript
function renderMarket(){
  const container = document.getElementById('grid');
  const empty = document.getElementById('grid-empty');
  const q = (document.getElementById('search').value || '').toLowerCase();
  const kind = document.getElementById('filterKind').value || '';
  container.innerHTML = '';
  
  const filtered = MARKET.filter(it => {
    if(kind && it.kind !== kind) return false;
    if(!q) return true;
    const hay = (it.title + ' ' + (it.description||'') + ' ' + (it.seller||'')).toLowerCase();
    return hay.includes(q);
  });
  
  if(!filtered.length){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  for(const it of filtered){
    const soldOut = it.remaining <= 0;
    
    // NEW: Determine listing type tag
    const listingTypeTag = it.listing_type === 'secondary' 
      ? '<div class="absolute top-2 left-2 pill" style="background: #FEF3C7; color: #F59E0B; border-color: #F59E0B;">Secondary</div>'
      : '<div class="absolute top-2 left-2 pill" style="background: #EEF2FF; color: #1B4BFF; border-color: #1B4BFF;">Primary</div>';
    
    const card = document.createElement('div');
    card.className = `card overflow-hidden flex flex-col animate-fade-in ${it.mint ? 'cursor-pointer' : ''}`;
    card.setAttribute('onclick', `showTokenInsights(event, '${it.mint || ''}')`);
    card.setAttribute('data-mint', it.mint || '');
    
    card.innerHTML =
      `<div class="aspect-[4/3] bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
        <img src="${it.image_url || 'https://via.placeholder.com/400x300?text=No+Image'}" alt="${it.title}" class="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
        <div class="absolute top-2 right-2 pill">${it.kind}</div>
        ${it.isVirtual ? '<div class="absolute top-12 right-2 pill pill-virtual">Virtual</div>' : ''}
        ${listingTypeTag}
      </div>
      <div class="p-4 flex-1 flex flex-col">
        <div class="flex items-start justify-between gap-2 mb-1">
          <h3 class="font-semibold">${it.title}</h3>
          <span class="text-xs text-[var(--muted)]">by ${it.sellerShort}</span>
        </div>
        <p class="text-[var(--muted)] text-sm mt-1 line-clamp-2">${it.description || ''}</p>
        <div class="mt-auto pt-3 flex items-center justify-between">
          <div class="text-xl font-bold"><span class="text-[var(--ok)]">${it.usdcPrice}</span> <span class="text-xs text-[var(--muted)]">USDC</span></div>
          <button data-id="${it.id}" class="btn ${soldOut?'btn-ghost':'btn-primary clean-shadow'}" ${soldOut?'disabled':''}>${soldOut?'Sold Out':'Buy Now'}</button>
        </div>
        <div class="text-xs text-[var(--muted)] mt-2">Supply: <span class="font-mono">${it.remaining} left</span> ${it.isVirtual ? '(Off-Chain DB)' : ''}</div>
      </div>`;
    container.appendChild(card);
  }

  container.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startBuy(btn.dataset.id);
    });
  });
}
```

### 5. Add Relist Button to Inventory

**Update renderInventory() for bought items:**

```javascript
${activeTab === 'bought'
  ? `<div class="mt-auto pt-3 text-sm text-[var(--muted)]">
      <div>Paid: <span class="font-bold text-[var(--ok)]">${priceStr} USDC</span> ${it.qty > 1 ? `<span class="ml-2 text-xs font-mono">Qty: ${it.qty}</span>` : ''}</div>
      <div>Bought on ${new Date(((it.created_at||0) * 1000)).toLocaleString()}</div>
      <div class="text-xs mt-1">Collection: <span class="font-mono">${isVirtual ? 'Virtual (Off-Chain)' : short(it.mint)}</span></div>
      <div class="text-xs mt-1">Receipt: ${it.receiptMint ? short(it.receiptMint)+' (NFT)' : 'Off-Chain DB'}</div>
      <button data-purchase-id="${it.purchase_id}" class="btn btn-ghost mt-2 w-full text-sm">Relist on Secondary Market</button>
    </div>`
  : `...`
}
```

### 6. Add Relist Handler

```javascript
// Add to renderInventory() after creating cards
grid.querySelectorAll('button[data-purchase-id]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const purchaseId = btn.dataset.purchaseId;
    const price = prompt('Enter your selling price (in USDC):');
    if (!price || isNaN(price) || Number(price) <= 0) {
      return banner('Invalid price', false);
    }
    
    try {
      const priceBase = Math.round(Number(price) * 1e6);
      const res = await fetch('/api/secondary/relist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet': walletPubkey
        },
        body: JSON.stringify({ purchase_id: purchaseId, price_usdc_base: priceBase })
      });
      
      const data = await res.json();
      if (data.ok) {
        banner('Listed on secondary market!', true);
        loadInventory();
      } else {
        banner(data.error || 'Failed to relist', false);
      }
    } catch (e) {
      banner('Error: ' + e.message, false);
    }
  });
});
```

### 7. Remove Admin Validation from submitList

```javascript
async function submitList() {
  if (!walletPubkey) return banner('Connect wallet', false);
  // REMOVE: if (walletPubkey !== ADMIN_WALLET) return banner('Closed beta: only admin can list', false);
  // REMOVE: if (!MARKET_ADMIN_TOKEN) return banner('Set MARKET_ADMIN_TOKEN in JS (closed beta)', false);

  const title  = document.getElementById('listTitle').value.trim();
  const desc   = document.getElementById('listDesc').value.trim();
  const image  = document.getElementById('listImage').value.trim();
  const kind   = document.getElementById('listKind').value;
  const supply = Number(document.getElementById('listSupply').value);
  const priceRaw = (document.getElementById('listPrice').value || '').trim().replace(',', '.');
  const price  = Number(priceRaw);
  const mint   = document.getElementById('listMint').value.trim();

  if (!title || supply < 1 || supply > 1000 || !(price > 0)) return banner('Invalid form (supply 1–1000, price > 0)', false);
  if (mint && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return banner('Invalid Solana mint/contract', false);

  try {
    const r = await fetch('/api/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // REMOVE: 'X-Market-Admin-Token': MARKET_ADMIN_TOKEN
      body: JSON.stringify({
        title, description: desc, image_url: image,
        kind, supply,
        price_usdc_base: Math.round(price * 1e6),
        wallet: walletPubkey,
        mint
      })
    });
    const data = await r.json();
    if (data.ok) {
      banner('Listed: '+title+'! (ID: '+data.id+')', true);
      ['listTitle','listDesc','listImage','listSupply','listPrice','listMint'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      document.getElementById('submitList').disabled = true;
      setTimeout(() => document.getElementById('submitList').disabled = false, 2000);
      loadMarket(); loadInventory();
    } else {
      banner(data.error || 'List failed', false);
    }
  } catch (e) { banner(e.message, false); }
}
```

### 8. Update CSS for Tags

**Add to `<style>` section:**

```css
.pill-primary {
  background: #EEF2FF;
  color: #1B4BFF;
  border-color: #1B4BFF;
}

.pill-secondary {
  background: #FEF3C7;
  color: #F59E0B;
  border-color: #F59E0B;
}

.dark .pill-primary {
  background: #1e293b;
  color: #60a5fa;
  border-color: #3b82f6;
}

.dark .pill-secondary {
  background: #3f3521;
  color: #facc15;
  border-color: #facc15;
}
```

---

## Database Schema Updates (if needed)

### Add to secondary_listings table:

```sql
ALTER TABLE secondary_listings ADD COLUMN purchase_id TEXT;
```

### Update db.js insertSecondaryListing:

```javascript
export function insertSecondaryListing({ original_id, seller, price_usdc_base, purchase_id }) {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO secondary_listings (id, original_id, seller, price_usdc_base, purchase_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = Math.floor(Date.now() / 1000);
  stmt.run(id, original_id, seller, price_usdc_base, purchase_id || null, now);
  return id;
}
```

---

## Testing Checklist

- [ ] Any wallet can list items (no admin check)
- [ ] Primary listings show "Primary" tag
- [ ] Secondary listings show "Secondary" tag
- [ ] Bought items show "Relist" button
- [ ] Relist creates secondary listing
- [ ] Secondary purchases work correctly
- [ ] Fees are split properly (seller + platform)
- [ ] Navigation shows "List Item" for all users
- [ ] No admin-only messaging in UI

---

## Key Benefits

1. **Fully Open** - Anyone can participate
2. **Clear Provenance** - Primary vs Secondary clearly marked
3. **Liquidity** - Buyers can become sellers
4. **Fair Fees** - 10% platform fee on all transactions
5. **Transparent** - All listings visible with seller info

---

## Files Included

1. **server.js** - Complete updated backend (already created)
2. **CHANGES.md** - This comprehensive guide
3. Partial frontend snippets (apply to your index.html)

The marketplace is now fully decentralized and open to all users!
