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

  // Prepaid credits deposit wallet (optional - must be configured to use deposit_credits)
  GATEWAY_DEPOSIT_WALLET: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),

  // Direct RPC - only needed for balance checks, not settlement
  // Settlement is handled by the gateway
  BASE_RPC_URL: z.string().url().default('https://mainnet.base.org'),

  // Development
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const config = configSchema.parse(process.env);

// Validate wallet config
if (config.WALLET_TYPE === 'walletconnect' && !config.WALLETCONNECT_PROJECT_ID) {
  throw new Error('WALLETCONNECT_PROJECT_ID required when WALLET_TYPE=walletconnect');
}
