# Query SEC Filings Database Scripts

## Query Filing Dates Count

This script queries the SEC Filings Intelligence database to count distinct filing dates.

### Prerequisites

1. Set up your environment variables in `.env.local` or `.env`:
   ```env
   WALLET_PRIVATE_KEY=0x...
   X402_GATEWAY_URL=https://x402.serendb.com
   BASE_RPC_URL=https://mainnet.base.org
   ```

2. Make sure you have USDC in your wallet on Base network to pay for queries.

### Usage

Run the script using tsx (TypeScript executor):

```bash
npx tsx scripts/query-sec-filing-dates.ts
```

Or if you have tsx installed globally:

```bash
tsx scripts/query-sec-filing-dates.ts
```

### What it does

1. Searches for the SEC Filings Intelligence publisher in the finance category
2. Connects your wallet
3. Explores the database schema to find relevant tables/columns
4. Executes a query to count distinct filing dates
5. Displays the results, cost, and transaction hash

### Expected Output

```
🔍 Searching for SEC Filings Intelligence publisher...
✅ Found publisher: SEC Filings Intelligence (4d4f0175-7fed-411e-8ad5-c206b9824e28)
✅ Wallet connected: 0x...
📊 Querying database for filing dates count...
✅ Query successful!
📊 Results:
[
  {
    "filing_date_count": 12345
  }
]
💰 Actual cost: 0.050 USDC
⏱️  Execution time: 234ms
🔗 Transaction hash: 0x...
```

### Alternative: Using MCP Tools Directly

If you have the MCP server configured in Cursor or another MCP client, you can use the tools directly:

1. **Find the publisher ID:**
   ```json
   {
     "category": "finance",
     "type": "database"
   }
   ```

2. **Query the database:**
   ```json
   {
     "publisher_id": "4d4f0175-7fed-411e-8ad5-c206b9824e28",
     "sql": "SELECT COUNT(DISTINCT filing_date) as filing_date_count FROM filings WHERE filing_date IS NOT NULL"
   }
   ```

### Troubleshooting

- **"Publisher not found"**: The publisher name might have changed. Check available publishers by listing them.
- **"Insufficient funds"**: Make sure you have USDC in your wallet on Base network.
- **"Table not found"**: The table/column names might be different. Use the schema exploration query first to see available tables.









