// ABOUTME: MCP tool to get instructions for depositing USDC to credit balance
// ABOUTME: Returns gateway wallet address and step-by-step deposit instructions

import type { GatewayClient } from '../gateway/client.js';
import type { WalletProvider } from '../wallet/types.js';
import { config } from '../config/index.js';

export interface DepositCreditsInput {
  amount: string;
}

export interface DepositCreditsOutput {
  success: boolean;
  instructions?: string;
  steps?: string[];
  amount?: string;
  gatewayWallet?: string;
  agentWallet?: string;
  error?: string;
}

/**
 * Get instructions for depositing USDC to prepaid credit balance
 */
export async function depositCredits(
  input: DepositCreditsInput,
  wallet: WalletProvider,
  _gateway: GatewayClient
): Promise<DepositCreditsOutput> {
  // Check if deposit wallet is configured
  if (!config.GATEWAY_DEPOSIT_WALLET) {
    return {
      success: false,
      error: 'Deposit wallet not configured. Set GATEWAY_DEPOSIT_WALLET environment variable.',
    };
  }

  // Validate amount
  const validationError = validateAmount(input.amount);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    const agentWallet = await wallet.getAddress();
    const depositWallet = config.GATEWAY_DEPOSIT_WALLET;

    const steps = [
      `1. Open your USDC wallet on Base network`,
      `2. Send ${input.amount} USDC to the gateway deposit address: ${depositWallet}`,
      `3. Wait for the transaction to be confirmed on Base`,
      `4. Use confirm_deposit with your transaction hash to credit your balance`,
      `5. Use check_credit_balance to verify your new balance`,
    ];

    const instructions = `To deposit ${input.amount} USDC to your prepaid credit balance:\n\n${steps.join('\n')}\n\nIMPORTANT: After sending USDC, you must call confirm_deposit with your transaction hash to credit your balance.`;

    return {
      success: true,
      instructions,
      steps,
      amount: input.amount,
      gatewayWallet: depositWallet,
      agentWallet,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
