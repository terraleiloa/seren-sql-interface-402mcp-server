#!/usr/bin/env node
// ABOUTME: MCP Server entry point
// ABOUTME: Registers tools and starts the server

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from './config/index.js';
import { payForQuery } from './tools/payForQuery.js';
import { listProviders } from './tools/listProviders.js';
import { getProviderDetails } from './tools/getProviderDetails.js';
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
    description: 'Execute a paid query against an x402-protected API provider. Makes a request, handles the 402 payment flow, and returns the result.',
    inputSchema: z.object({
      provider_id: z.string().describe('UUID of the API provider'),
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

// Register list_providers tool
server.registerTool(
  'list_providers',
  {
    description: 'List available x402-protected API providers from the gateway catalog. Optionally filter by category or provider type.',
    inputSchema: z.object({
      category: z.string().optional().describe('Filter by category (e.g., "finance", "analytics")'),
      type: z.enum(['database', 'api', 'both']).optional().describe('Filter by provider type'),
    }),
  },
  async (args) => {
    try {
      const result = await listProviders(args, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                providers: result.providers,
                count: result.providers?.length ?? 0,
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

// Register get_provider_details tool
server.registerTool(
  'get_provider_details',
  {
    description: 'Get detailed information about a specific x402-protected API provider including pricing, endpoints, and capabilities.',
    inputSchema: z.object({
      provider_id: z.string().describe('UUID of the API provider'),
    }),
  },
  async (args) => {
    try {
      const result = await getProviderDetails(args, gatewayClient);

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                provider: result.provider,
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
