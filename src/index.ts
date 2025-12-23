#!/usr/bin/env node
// ABOUTME: MCP Server entry point
// ABOUTME: Registers tools and starts the server

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from './config/index.js';
import { payForQuery } from './tools/payForQuery.js';
import { queryDatabase } from './tools/queryDatabase.js';
import { listPublishers } from './tools/listPublishers.js';
import { getPublisherDetails } from './tools/getPublisherDetails.js';
import { getPublisherPricingDetails } from './tools/getPublisherPricingDetails.js';
import { checkCreditBalance } from './tools/checkCreditBalance.js';
import { depositCredits } from './tools/depositCredits.js';
import { confirmDeposit } from './tools/confirmDeposit.js';
import { GatewayClient } from './gateway/client.js';
import { PrivateKeyWalletProvider } from './wallet/privatekey.js';
import type { WalletProvider } from './wallet/types.js';

const server = new McpServer(
  {
    name: 'x402-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize gateway client (singleton)
const gatewayClient = new GatewayClient();

// Wallet provider will be initialized on first use
let walletProvider: WalletProvider | null = null;

async function getWalletProvider(): Promise<WalletProvider> {
  if (walletProvider) {
    return walletProvider;
  }

  // For now, only support private key wallet
  // WalletConnect integration will require additional setup
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('WALLET_PRIVATE_KEY environment variable required');
  }

  const provider = new PrivateKeyWalletProvider();
  await provider.connect(privateKey);
  walletProvider = provider;
  return provider;
}

// Register pay_for_query tool
server.registerTool(
  'pay_for_query',
  {
    description: 'Execute a paid query against an x402-protected data publisher. Makes a request, handles the 402 payment flow, and returns the result. Large responses are automatically truncated to ~32k chars (~8k tokens) to prevent context overflow.',
    inputSchema: z.object({
      publisher_id: z.string().describe('UUID of the data publisher'),
      request: z.object({
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().describe('HTTP method (defaults to GET)'),
        path: z.string().describe('Request path'),
        body: z.any().optional().describe('Request body for POST/PUT'),
        headers: z.record(z.string()).optional().describe('Additional headers'),
      }),
    }),
  },
  async (args) => {
    try {
      const wallet = await getWalletProvider();
      const result = await payForQuery(args, wallet, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                data: result.data,
                cost: result.cost,
                txHash: result.txHash,
                truncated: result.truncated,
                originalSizeBytes: result.originalSizeBytes,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Register query_database tool
server.registerTool(
  'query_database',
  {
    description: 'Execute a paid SQL query against a database-type x402-protected publisher. Makes a query request, handles the 402 payment flow with row-based pricing, and returns the results. Large responses are automatically truncated to ~32k chars (~8k tokens) to prevent context overflow.',
    inputSchema: z.object({
      publisher_id: z.string().describe('UUID of the database publisher'),
      sql: z.string().describe('SQL SELECT query to execute'),
    }),
  },
  async (args) => {
    try {
      const wallet = await getWalletProvider();
      const result = await queryDatabase(args, wallet, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                rows: result.rows,
                rowCount: result.rowCount,
                estimatedCost: result.estimatedCost,
                actualCost: result.actualCost,
                executionTime: result.executionTime,
                txHash: result.txHash,
                truncated: result.truncated,
                originalSizeBytes: result.originalSizeBytes,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Register list_publishers tool
server.registerTool(
  'list_publishers',
  {
    description: 'List available x402-protected data publishers from the gateway catalog. Returns compact summaries (id, name, type, categories, description). Use get_publisher_details to get full info including usageExample for a specific publisher.',
    inputSchema: z.object({
      category: z.string().optional().describe('Filter by category (e.g., "finance", "analytics")'),
      type: z.enum(['database', 'api', 'both']).optional().describe('Filter by publisher type'),
    }),
  },
  async (args) => {
    try {
      const result = await listPublishers(args, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                publishers: result.publishers,
                count: result.publishers?.length ?? 0,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Register get_publisher_details tool
server.registerTool(
  'get_publisher_details',
  {
    description: 'Get detailed information about a specific x402-protected data publisher including pricing, endpoints, capabilities, and usageExample. Use this after list_publishers to get full details for a publisher you want to query.',
    inputSchema: z.object({
      publisher_id: z.string().describe('UUID of the data publisher'),
    }),
  },
  async (args) => {
    try {
      const result = await getPublisherDetails(args, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                publisher: result.publisher,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Register get_publisher_pricing_details tool
server.registerTool(
  'get_publisher_pricing_details',
  {
    description: 'Get detailed pricing configuration (basePricePer1000Rows, markupMultiplier) for a specific x402-protected data publisher.',
    inputSchema: z.object({
      publisher_id: z.string().describe('UUID of the data publisher'),
    }),
  },
  async (args) => {
    try {
      const result = await getPublisherPricingDetails(args, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                pricing: result.pricing,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Register check_credit_balance tool
server.registerTool(
  'check_credit_balance',
  {
    description: 'Check your prepaid credit balance. Returns current balance, reserved amount, and available funds.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const wallet = await getWalletProvider();
      const result = await checkCreditBalance(wallet, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                wallet: result.wallet,
                balance: result.balance,
                reserved: result.reserved,
                available: result.available,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Register deposit_credits tool
server.registerTool(
  'deposit_credits',
  {
    description: 'Deposit USDC to your prepaid credit balance via x402 payment flow. Signs and submits the payment automatically.',
    inputSchema: z.object({
      amount: z.string().describe('Amount of USDC to deposit (e.g., "10.00")'),
    }),
  },
  async (args) => {
    try {
      const wallet = await getWalletProvider();
      const result = await depositCredits(args, wallet, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                deposited: result.deposited,
                balance: result.balance,
                txHash: result.txHash,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// Register confirm_deposit tool
server.registerTool(
  'confirm_deposit',
  {
    description: 'Confirm a USDC deposit and credit your prepaid balance. Call this after sending USDC to the gateway deposit address with your transaction hash.',
    inputSchema: z.object({
      txHash: z.string().describe('The transaction hash of your USDC transfer (0x followed by 64 hex characters)'),
      amount: z.string().describe('Amount of USDC deposited (e.g., "10.00")'),
    }),
  },
  async (args) => {
    try {
      const wallet = await getWalletProvider();
      const result = await confirmDeposit(args, wallet, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                wallet: result.wallet,
                balance: result.balance,
                reserved: result.reserved,
                available: result.available,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`x402 MCP Server started (env: ${config.NODE_ENV})`);
}

main().catch(console.error);
