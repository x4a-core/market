# Changelog

All notable changes to the X4A Marketplace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-01-XX

### 🚀 Major Features

#### Multi-Chain Payment Support
- **Added support for Base (Ethereum L2) payments** alongside Solana
- Users can now pay with USDC on either Solana or Base chain
- Full X402 Protocol compliance maintained across all chains
- Chain selection UI implemented for all payment flows

#### Enhanced Database Schema
- Added `network` column to `purchases` table
- Added `network` column to `payments` table
- Added `network` column to `secondary_purchases` table
- Created indexes for efficient network-based queries
- Full backward compatibility with existing data

#### Telegram Bot Enhancements
- Network badges (🟣 Solana / 🔵 Base) in all notifications
- Direct blockchain explorer links per transaction
- `/chains` command to view supported networks
- Enhanced `/link` command with EVM wallet support
- Network display in `/inventory` command

### ✨ Improvements

#### Marketplace
- Chain selector modal for all purchases
- Real-time network switching (MetaMask/Phantom)
- Network tracking on all listings
- Multi-chain secondary market support

#### Paywall System
- Multi-chain tier unlocks (Basic, Premium, AI-Agent)
- Chain-specific payment verification
- Network-aware entitlement tracking

#### X4AGENT Tools
- All 9 tools now support multi-chain payments
- Chain selection for weather, stock, web search, etc.
- Network-specific payment receipts

### 🔧 Technical Changes

#### Backend (`server.js`)
- Implemented `chains.js` module for chain abstraction
- Added `getChain()` function for dynamic chain selection
- Enhanced `verifyPayment()` for EVM chains
- Multi-chain challenge generation
- Network parameter in all X402 endpoints

#### Frontend (`index.html`)
- `handleSolanaPayment()` function for SPL token transfers
- `handleBasePayment()` function for ERC20 transfers
- `showChainSelector()` modal component
- ethers.js integration for EVM chains
- Chain-aware transaction building

#### Database (`db.js`)
- Migration system for adding `network` columns
- Updated prepared statements to include network
- `insertPaymentRecord()` now accepts `network` parameter
- `completePurchase()` tracks transaction network

#### Telegram Bot (`bot.js`)
- `getNetworkBadge()` helper function
- `getExplorerLink()` for chain-specific explorers
- Enhanced notification templates with network info
- Multi-chain wallet support in `/link`

### 🐛 Bug Fixes
- Fixed social icon website fallback (replaced Facebook icon with globe)
- Improved error handling for unsupported networks
- Enhanced payment verification timeout handling
- Fixed ATA creation race conditions on Solana

### 📚 Documentation
- Added comprehensive multi-chain upgrade guide
- X402 Protocol compliance documentation
- API reference with multi-chain examples
- Deployment guide for both chains
- Troubleshooting guide for common issues

### 🔒 Security
- Enhanced payment verification across chains
- Network mismatch detection
- Chain-specific amount validation
- Improved error messages for failed verifications

### ⚡ Performance
- Optimized RPC calls with connection pooling
- Reduced verification retry logic
- Faster chain detection and switching
- Improved database query performance with indexes

---

## [1.0.0] - Previous Release

### Features
- Solana USDC payments via X402 Protocol
- Marketplace for X402-Coin and Agent items
- Paywall system with tier-based access
- X4AGENT tool suite
- Telegram bot notifications
- Primary and secondary markets
- Virtual and on-chain listings
- Token gating support

---

## Upgrade Instructions

### From 1.x to 2.0.0

1. **Database Migration**
```bash
   # Automatic migration on startup
   npm start
   # Columns will be added automatically with defaults
```

2. **Environment Variables**
```bash
   # Add to .env
   ENABLE_BASE=true
   BASE_RPC=https://mainnet.base.org
   BASE_USDC_CONTRACT=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
   BASE_PAYMENT_WALLET=0xYourBaseWallet
   MARKET_ADMIN_WALLET_BASE=0xYourAdminWallet
```

3. **Dependencies**
```bash
   npm install ethers@6 viem @coinbase/onchainkit
```

4. **Deploy**
```bash
   npm run build
   npm start
```

See [MULTI_CHAIN_UPGRADE.md](./MULTI_CHAIN_UPGRADE.md) for detailed instructions.

---

## Breaking Changes

### v2.0.0
- **Database Schema**: New `network` columns added (backward compatible)
- **API Responses**: All endpoints now include `network` field
- **Telegram Notifications**: Format changed to include network badges
- **Payment Verification**: Now requires network parameter in X-PAYMENT header

### Migration Path
All changes are backward compatible. Existing Solana-only installations will continue to work without modification. Base support is opt-in via environment variables.

---

## Deprecations

None in this release.

---

## Roadmap

### v2.1.0 (Planned)
- [ ] Ethereum mainnet support
- [ ] Polygon support
- [ ] Automated cross-chain bridging
- [ ] Multi-chain analytics dashboard

### v2.2.0 (Planned)
- [ ] zkSync Era support
- [ ] Arbitrum support
- [ ] Chain abstraction layer improvements
- [ ] Gas optimization for EVM chains

### v3.0.0 (Future)
- [ ] Cross-chain atomic swaps
- [ ] Unified liquidity pools
- [ ] DAO governance integration
- [ ] Mobile app (React Native)

---

## Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/x4a-marketplace/issues)
- **Discord**: [Join our community](https://discord.gg/x4a)
- **Email**: ops@x4a.app

---

## Contributors

Thanks to all contributors who made this release possible!

- [@yourusername](https://github.com/yourusername) - Lead Developer
- [@contributor1](https://github.com/contributor1) - Multi-chain Integration
- [@contributor2](https://github.com/contributor2) - Frontend Enhancements

---

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
