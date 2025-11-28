# SerenAI Pay Per Query with x402 MCP Server

MCP server enabling AI agents to pay for x402-protected API queries using USDC on Base.

## Installation

```bash
npm install @serenai/x402-mcp-server
```

Or clone and build:

```bash
git clone https://github.com/serenorg/x402-mcp-server.git
cd x402-mcp-server
pnpm install
pnpm build
```

## Configuration

Create `.env` file:

```env
X402_GATEWAY_URL=https://x402.serendb.com
WALLET_PRIVATE_KEY=0x...  # For PrivateKeyWalletProvider
BASE_RPC_URL=https://mainnet.base.org
```

## Usage with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["@serenai/x402-mcp-server"],
      "env": {
        "X402_GATEWAY_URL": "https://x402.serendb.com",
        "WALLET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## MCP Tools

### `list_providers`

Lists available x402-protected API providers.

```json
{ "category": "finance", "type": "api" }
```

### `get_provider_details`

Gets details for a specific provider.

```json
{ "provider_id": "uuid-here" }
```

### `pay_for_query`

Executes a paid API query with automatic USDC payment.

```json
{
  "provider_id": "uuid-here",
  "request": {
    "method": "GET",
    "path": "/v1/data/endpoint",
    "headers": { "User-Agent": "MyAgent" }
  }
}
```

## Development

```bash
pnpm install
pnpm test        # Run tests in watch mode
pnpm test:ci     # Run tests with coverage
pnpm test:e2e    # Run E2E tests (requires live gateway)
pnpm build       # Build for production
```

## Architecture

- **Wallet Providers**: `PrivateKeyWalletProvider` (server) or `WalletConnectProvider` (user approval)
- **Transaction Relay**: `DirectRelay` (primary) with `PalomaRelay` (fallback)
- **Signing**: EIP-712 typed data for USDC `transferWithAuthorization`

---

## Becoming an x402 Provider

To set up your own x402-protected API:

### 1. Register with Gateway

Contact SerenAI to register your API endpoint:

- API base URL
- Authentication requirements
- Supported endpoints

### 2. Configure Pricing

Set per-endpoint pricing in the gateway catalog:

```json
{
  "providerId": "your-uuid",
  "name": "Your API",
  "baseUrl": "https://api.yourservice.com",
  "endpoints": [
    {
      "path": "/v1/data/*",
      "method": "GET",
      "priceUsdcAtomic": "100000"
    }
  ],
  "walletAddress": "0xYourWallet"
}
```

Pricing is in USDC atomic units (6 decimals). `100000` = $0.10 USD.

### 3. Handle x402 Flow

Your API receives requests with `X-PAYMENT` header containing:

- Signed authorization for USDC transfer
- User wallet address
- Payment amount

The gateway validates payment before proxying to your API.

### 4. Receive Payments

Payments settle directly to your wallet address on Base via USDC `transferWithAuthorization`.

---

## License

Apache 2.0 - See [LICENSE](LICENSE)
