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

## MCP Client Setup

### Claude Desktop

Add the server to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`). Restart Claude Desktop after editing so it reloads the MCP registry.

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["@serenai/x402-mcp-server"],
      "env": {
        "X402_GATEWAY_URL": "https://x402.serendb.com",
        "WALLET_PRIVATE_KEY": "0x...",
        "BASE_RPC_URL": "https://mainnet.base.org"
      }
    }
  }
}
```

### Claude Code (web & CLI)

Claude Code reads MCP settings from `~/.claude.json`. You can either edit the file directly with the same JSON snippet above or run:

```bash
claude mcp add x402 -- npx @serenai/x402-mcp-server
```

Set the same environment variables you defined in the [Configuration](#configuration) section before launching Claude Code. Use `claude mcp list` or the `/mcp` command in chat to confirm the `x402` server is registered.

### Cursor

Cursor supports MCP servers via either the global file `~/.cursor/mcp.json` (applies to every workspace) or a project-scoped `.cursor/mcp.json`. In Cursor go to Settings → Features → Model Context Protocol to manage entries visually, or edit the JSON manually:

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["@serenai/x402-mcp-server"],
      "env": {
        "X402_GATEWAY_URL": "https://x402.serendb.com",
        "WALLET_PRIVATE_KEY": "0x...",
        "BASE_RPC_URL": "https://mainnet.base.org"
      }
    }
  }
}
```

Restart Cursor (or run `cursor-agent mcp list`) after editing to ensure the IDE reloads the server definition and exposes the `list_providers`, `get_provider_details`, and `pay_for_query` tools.

> **Troubleshooting:** If the client cannot start the server, make sure Node.js is available on your `PATH`, re-check the environment variables from [Configuration](#configuration), and restart the IDE so it reloads MCP settings.

### Other compatible clients

The x402 MCP server works with any tool that implements the Model Context Protocol. Popular options include Continue (VS Code / JetBrains), Cline (VS Code), CodeGPT, Windsurf, Zed, VS Code MCP, and Sourcegraph Cody. For details on configuring those editors, see the [official MCP client matrix](https://modelcontextprotocol.info/docs/clients/); the JSON snippets above can usually be dropped into each client’s MCP configuration file with the same `command`, `args`, and environment variables.

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

To monetize your database with pay-per-query access:

### 1. Sign Up for SerenDB

Create an account at [console.serendb.com](https://console.serendb.com) to get:

- A managed PostgreSQL database connection string
- API keys for the x402 gateway

### 2. Register Your Provider

```bash
curl -X POST https://x402.serendb.com/api/providers/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Database",
    "email": "provider@example.com",
    "walletAddress": "0xYourWalletAddress",
    "connectionString": "postgresql://serendb_owner:YOUR_PASSWORD@ep-your-db-123456.c-1.us-east-1.serendb.com/serendb?sslmode=require&channel_binding=require"
  }'
```

Returns your `providerId` and `apiKey`.

### 3. Configure Pricing

```bash
curl -X POST https://x402.serendb.com/api/providers/{providerId}/pricing \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "basePricePer1000Rows": 1.0,
    "markupMultiplier": 2.0
  }'
```

Pricing is in USDC atomic units (6 decimals). `100000` = $0.10 USD.

### 4. Receive Payments

When agents query your database:

1. Gateway returns `402` with `PaymentRequirements`
2. Agent signs EIP-3009 authorization
3. Gateway settles USDC to your wallet on Base
4. Query executes and results return to agent

Payments settle directly via `transferWithAuthorization` - no custodial balances required.

---

## License

Apache 2.0 - See [LICENSE](LICENSE)
