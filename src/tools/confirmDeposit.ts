// ABOUTME: MCP tool to confirm a USDC deposit and credit the balance
// ABOUTME: Calls gateway confirmDeposit endpoint with transaction hash

import type { GatewayClient } from '../gateway/client.js';
import type { WalletProvider } from '../wallet/types.js';

export interface ConfirmDepositInput {
  txHash: string;
  amount: string;
}

export interface ConfirmDepositOutput {
  success: boolean;
  wallet?: string;
  balance?: string;
  reserved?: string;
  available?: string;
  error?: string;
}

/**
 * Confirm a USDC deposit and credit the prepaid balance
 */
export async function confirmDeposit(
  input: ConfirmDepositInput,
  wallet: WalletProvider,
  gateway: GatewayClient
): Promise<ConfirmDepositOutput> {
  // Validate txHash
  const txHashError = validateTxHash(input.txHash);
  if (txHashError) {
    return { success: false, error: txHashError };
  }

  // Validate amount
  const amountError = validateAmount(input.amount);
  if (amountError) {
    return { success: false, error: amountError };
  }

  try {
    const agentWallet = await wallet.getAddress();
    const creditBalance = await gateway.confirmDeposit(agentWallet, input.txHash, input.amount);

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

function validateTxHash(txHash: string): string | null {
  if (!txHash) {
    return 'txHash is required';
  }

  // Transaction hash must be 0x followed by 64 hex characters
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return 'txHash must be a valid transaction hash (0x followed by 64 hex characters)';
  }

  return null;
}

function validateAmount(amount: string): string | null {
  if (!amount) {
    return 'amount is required';
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) {
    return 'amount must be a valid number';
  }
  if (numAmount <= 0) {
    return 'amount must be greater than zero';
  }

  return null;
}
