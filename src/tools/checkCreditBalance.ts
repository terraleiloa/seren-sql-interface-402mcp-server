// ABOUTME: MCP tool to check prepaid credit balance for connected wallet
// ABOUTME: Uses wallet address to query gateway for credit info

import type { GatewayClient } from '../gateway/client.js';
import type { WalletProvider } from '../wallet/types.js';

export interface CheckCreditBalanceOutput {
  success: boolean;
  wallet?: string;
  balance?: string;
  reserved?: string;
  available?: string;
  error?: string;
}

/**
 * Check prepaid credit balance for the connected wallet
 */
export async function checkCreditBalance(
  wallet: WalletProvider,
  gateway: GatewayClient
): Promise<CheckCreditBalanceOutput> {
  try {
    const walletAddress = await wallet.getAddress();
    const creditBalance = await gateway.getCreditBalance(walletAddress);

    return {
      success: true,
      wallet: creditBalance.agentWallet,
      balance: creditBalance.balance,
      reserved: creditBalance.reserved,
      available: creditBalance.available,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
