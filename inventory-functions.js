async function loadInventory(activeTab = 'listed'){
  if(!walletPubkey) return;
  const grid = document.getElementById('inventoryGrid');
  skeletonGrid(grid, 6);
  try{
    // Load inventory data
    const r = await fetch('/api/inventory/'+walletPubkey);
    const data = await r.json();
    
    if(data.ok){
      INVENTORY = {
        listed: (data.listed || []).map(it => ({ ...it, usdcPrice: formatUsdcPrice((it.price_usdc_base || it.usdcPrice), CONFIG.decimals) })),
        bought: (data.bought || []).map(it => ({ ...it, usdcPrice: formatUsdcPrice((it.price_usdc_base || it.usdcPrice), CONFIG.decimals) }))
      };
      
      // Calculate quantities for bought items
      const qtyMap = {};
      INVENTORY.bought.forEach(item => {
        const key = `${item.id}-${item.price_usdc_base}`;
        qtyMap[key] = (qtyMap[key] || 0) + 1;
      });
      INVENTORY.bought.forEach(item => {
        const key = `${item.id}-${item.price_usdc_base}`;
        item.qty = qtyMap[key];
      });
      
      // ✅ NEW: Load secondary listings for this wallet
      const secRes = await fetch('/api/secondary/user/' + walletPubkey);
      const secData = await secRes.json();
      INVENTORY.secondary = (secData.listings || []).map(it => ({ 
        ...it, 
        usdcPrice: formatUsdcPrice((it.price_usdc_base || it.usdcPrice), CONFIG.decimals) 
      }));
      
      document.getElementById('tabListed').className = activeTab === 'bought' ? 'btn btn-ghost' : 'btn btn-primary';
      document.getElementById('tabBought').className = activeTab === 'bought' ? 'btn btn-primary' : 'btn btn-ghost';
      currentInventoryPage = 1;
      renderInventory();
    }
  }catch(e){
    console.error(e);
    banner('Failed to load inventory', false);
  }
}

function renderInventory(){
  const grid = document.getElementById('inventoryGrid');
  const empty = document.getElementById('inventoryEmpty');
  const pagEl = document.getElementById('inventoryPagination');
  const activeTab = document.querySelector('#tabListed.btn-primary') ? 'listed' : 'bought';
  
  let items = activeTab === 'listed' ? (INVENTORY.listed||[]) : (INVENTORY.bought||[]);
  let displayItems = items;
  
  if(activeTab === 'bought'){
    const seen = new Set();
    displayItems = [];
    items.forEach(it => {
      const key = `${it.id}-${it.price_usdc_base}`;
      if(!seen.has(key)){
        seen.add(key);
        displayItems.push(it);
      }
    });
  }
  
  const totalItems = displayItems.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const start = (currentInventoryPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pagedItems = displayItems.slice(start, end);
  
  grid.innerHTML = '';
  
  if(totalItems === 0){
    empty.classList.remove('hidden');
    empty.textContent = activeTab === 'listed' ? 'No items listed yet.' : 'No items bought yet.';
    pagEl.innerHTML = '';
    
    // ✅ NEW: Show secondary listings even if no primary listings
    if(activeTab === 'listed' && INVENTORY.secondary && INVENTORY.secondary.length > 0){
      renderSecondaryListings(grid);
    }
    return;
  }
  
  empty.classList.add('hidden');
  
  for(const it of pagedItems){
    const priceStr = it.usdcPrice;
    const isVirtual = !it.mint;
    const card = document.createElement('div');
    card.className = `card overflow-hidden flex flex-col ${it.mint ? 'cursor-pointer' : ''}`;
    card.setAttribute('onclick', `showTokenInsights(event, '${it.mint || ''}')`);
    card.setAttribute('data-mint', it.mint || '');

    let buyBtn = '';
    if (activeTab === 'bought') {
      buyBtn = `<button data-id="${it.id}" data-original-id="${it.id}" class="btn btn-primary clean-shadow mt-2" onclick="startSecondaryList(event, '${it.id}')">List for Sale</button>`;
    } else if (activeTab === 'listed') {
      buyBtn = `<button class="edit-btn mt-2 w-full text-xs" onclick="event.stopPropagation();openEdit('${it.id}')">Edit Listing</button>`;
    }

    card.innerHTML = `
      <div class="aspect-[4/3] bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
        <img src="${it.image_url || 'https://http.cat/404'}" 
            class="w-full h-full object-cover"
            onerror="this.onerror=null; this.src='https://http.cat/404';">
        <div class="absolute top-2 right-2 pill">${it.kind}</div>
        ${isVirtual ? '<div class="absolute top-2 left-2 pill pill-virtual">Virtual</div>' : ''}
      </div>
      <div class="p-4 flex-1 flex flex-col">
        <h3 class="font-semibold mb-1">${escapeHtml(it.title)}</h3>
        <p class="text-[var(--muted)] text-sm line-clamp-2">${escapeHtml(it.description || '')}</p>
        ${activeTab === 'listed'
          ? `<div class="mt-auto pt-3 text-sm text-[var(--muted)]">
              <div>Price: <span class="font-bold text-[var(--ok)]">${priceStr} USDC</span></div>
              <div>Remaining: <span class="font-mono">${it.remaining}</span></div>
              <div class="text-xs mt-1">Collection: <span class="font-mono">${isVirtual ? 'Virtual (Off-Chain)' : short(it.mint)}</span></div>
              <button class="edit-btn mt-2 w-full text-xs" onclick="event.stopPropagation();openEdit('${it.id}')">Edit Listing</button>
            </div>`
          : `<div class="mt-auto pt-3 text-sm text-[var(--muted)]">
              <div>Paid: <span class="font-bold text-[var(--ok)]">${priceStr} USDC</span> ${it.qty > 1 ? `<span class="ml-2 text-xs font-mono">Qty: ${it.qty}</span>` : ''}</div>
              <div>Bought on ${new Date(((it.created_at||0) * 1000)).toLocaleString()}</div>
              <div class="text-xs mt-1">Collection: <span class="font-mono">${isVirtual ? 'Virtual (Off-Chain)' : short(it.mint)}</span></div>
              <div class="text-xs mt-1">Receipt: ${it.receiptMint ? short(it.receiptMint)+' (NFT)' : 'Off-Chain DB'}</div>
              ${buyBtn}
            </div>`
        }
      </div>`;
    grid.appendChild(card);
  }
  
  // ✅ NEW: Show secondary listings after primary listings
  if(activeTab === 'listed' && INVENTORY.secondary && INVENTORY.secondary.length > 0){
    renderSecondaryListings(grid);
  }
  
  if(totalPages <= 1){
    pagEl.innerHTML = '';
    return;
  }
  
  const prevDisabled = currentInventoryPage === 1;
  const nextDisabled = currentInventoryPage === totalPages;
  pagEl.innerHTML = `
    <button id="prevInventoryPage" class="btn btn-ghost px-3 ${prevDisabled ? 'opacity-50 cursor-not-allowed' : ''}" ${prevDisabled ? 'disabled' : ''}>← Prev</button>
    <span>Page ${currentInventoryPage} of ${totalPages}</span>
    <button id="nextInventoryPage" class="btn btn-ghost px-3 ${nextDisabled ? 'opacity-50 cursor-not-allowed' : ''}" ${nextDisabled ? 'disabled' : ''}>Next →</button>
  `;
  const prevBtn = pagEl.querySelector('#prevInventoryPage');
  const nextBtn = pagEl.querySelector('#nextInventoryPage');
  if(prevBtn) prevBtn.addEventListener('click', () => { if(!prevDisabled){ currentInventoryPage--; renderInventory(); } });
  if(nextBtn) nextBtn.addEventListener('click', () => { if(!nextDisabled){ currentInventoryPage++; renderInventory(); } });
}

// ✅ NEW: Render secondary listings section
function renderSecondaryListings(grid) {
  if (!INVENTORY.secondary || INVENTORY.secondary.length === 0) return;
  
  // Add section header
  const header = document.createElement('div');
  header.className = 'col-span-full mt-8 mb-4';
  header.innerHTML = `
    <h3 class="text-2xl font-bold text-[var(--primary)]">
      📋 Your Secondary Market Listings
    </h3>
    <p class="text-sm text-[var(--muted)] mt-1">
      Items you've listed for resale
    </p>
  `;
  grid.appendChild(header);
  
  // Render each secondary listing
  for (const item of INVENTORY.secondary) {
    const priceStr = item.usdcPrice;
    const isVirtual = !item.original_mint;
    
    const card = document.createElement('div');
    card.className = `card overflow-hidden flex flex-col ${item.original_mint ? 'cursor-pointer' : ''}`;
    card.setAttribute('onclick', `showTokenInsights(event, '${item.original_mint || ''}')`);
    card.setAttribute('data-mint', item.original_mint || '');
    
    card.innerHTML = `
      <div class="aspect-[4/3] bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
        <img src="${item.image_url || 'https://http.cat/404'}" 
            class="w-full h-full object-cover"
            onerror="this.onerror=null; this.src='https://http.cat/404';">
        <div class="absolute top-2 right-2 pill">${item.kind}</div>
        ${isVirtual ? '<div class="absolute top-2 left-2 pill pill-virtual">Virtual</div>' : ''}
        <div class="absolute bottom-2 left-2 right-2">
          <div class="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
            🔄 SECONDARY LISTING
          </div>
        </div>
      </div>
      <div class="p-4 flex-1 flex flex-col">
        <h3 class="font-semibold mb-1">${escapeHtml(item.title)}</h3>
        <p class="text-[var(--muted)] text-sm line-clamp-2">${escapeHtml(item.description || '')}</p>
        <div class="mt-auto pt-3 text-sm text-[var(--muted)]">
          <div>Price: <span class="font-bold text-[var(--ok)]">${priceStr} USDC</span></div>
          <div class="text-xs mt-1">Listed: ${new Date((item.created_at||0) * 1000).toLocaleDateString()}</div>
          <div class="text-xs mt-1">Collection: <span class="font-mono">${isVirtual ? 'Virtual (Off-Chain)' : short(item.original_mint)}</span></div>
          
          <div class="flex gap-2 mt-3">
            <button 
              class="btn btn-ghost text-xs flex-1" 
              onclick="event.stopPropagation();changeSecondaryPrice('${item.id}', ${item.price_usdc_base})">
              💰 Change Price
            </button>
            <button 
              class="btn btn-ghost text-xs flex-1 text-red-500 hover:bg-red-50" 
              onclick="event.stopPropagation();cancelSecondaryListing('${item.id}')">
              ❌ Cancel
            </button>
          </div>
        </div>
      </div>
    `;
    
    grid.appendChild(card);
  }
}

// ✅ NEW: Cancel secondary listing
async function cancelSecondaryListing(listingId) {
  if (!confirm('Cancel this listing? The item will return to your inventory.')) return;
  
  try {
    banner('Cancelling listing...', true);
    
    const res = await fetch(`/api/secondary/cancel/${listingId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wallet': walletPubkey
      }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      banner('✅ Listing cancelled! Item returned to inventory.', true);
      // Refresh inventory to show item back in "bought" tab
      await loadInventory('bought');
    } else {
      banner('❌ ' + (data.error || 'Failed to cancel listing'), false);
    }
  } catch (e) {
    console.error('Cancel error:', e);
    banner('❌ Failed to cancel listing', false);
  }
}

// ✅ NEW: Change secondary listing price
async function changeSecondaryPrice(listingId, currentPrice) {
  const currentUSDC = (currentPrice / 1e6).toFixed(6);
  const newPriceStr = prompt(`Current price: ${currentUSDC} USDC\n\nEnter new price (in USDC):`, currentUSDC);
  
  if (!newPriceStr || newPriceStr.trim() === '') return;
  
  const newPrice = parseFloat(newPriceStr);
  if (isNaN(newPrice) || newPrice <= 0) {
    return banner('❌ Invalid price', false);
  }
  
  const newPriceBase = Math.floor(newPrice * 1e6);
  
  try {
    banner('Updating price...', true);
    
    const res = await fetch(`/api/secondary/update-price/${listingId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wallet': walletPubkey
      },
      body: JSON.stringify({ price_usdc_base: newPriceBase })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      banner('✅ Price updated successfully!', true);
      // Refresh inventory to show new price
      await loadInventory('listed');
    } else {
      banner('❌ ' + (data.error || 'Failed to update price'), false);
    }
  } catch (e) {
    console.error('Update price error:', e);
    banner('❌ Failed to update price', false);
  }
}

// Tab event listeners
document.getElementById('tabListed')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (e.target.classList.contains('btn-primary')) return;
  loadInventory('listed');
});

document.getElementById('tabBought')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (e.target.classList.contains('btn-primary')) return;
  loadInventory('bought');
});
