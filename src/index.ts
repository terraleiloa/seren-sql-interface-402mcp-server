#!/usr/bin/env node
// ABOUTME: MCP Server entry point
// ABOUTME: Registers tools and starts the server

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config/index.js';

const server = new Server(
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

// Tools will be registered here in subsequent tasks

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`x402 MCP Server started (env: ${config.NODE_ENV})`);
}

main().catch(console.error);
