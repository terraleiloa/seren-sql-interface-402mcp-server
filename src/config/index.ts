// ABOUTME: Environment configuration with Zod validation
// ABOUTME: Validates all required config at startup

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const configSchema = z.object({
  // Gateway - handles payment verification and on-chain settlement
  X402_GATEWAY_URL: z.string().url().default('https://x402.serendb.com'),

  // Wallet - how user signs EIP-712 authorizations
  WALLET_TYPE: z.enum(['browser', 'walletconnect', 'hardware']).default('browser'),
  WALLETCONNECT_PROJECT_ID: z.string().optional(),

  // Direct RPC - only needed for balance checks, not settlement
  // Settlement is handled by the gateway
  BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),

  // Development
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Query timeout configuration (in milliseconds)
  QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(120000), // 2 minutes default
  QUERY_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),
  QUERY_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000), // 1 second delay between retries
});

export const config = configSchema.parse(process.env);

// Validate wallet config
if (config.WALLET_TYPE === 'walletconnect' && !config.WALLETCONNECT_PROJECT_ID) {
  throw new Error('WALLETCONNECT_PROJECT_ID required when WALLET_TYPE=walletconnect');
}
