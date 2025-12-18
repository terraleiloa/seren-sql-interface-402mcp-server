// ABOUTME: MCP tool to deposit USDC to prepaid credit balance via x402 payment flow
// ABOUTME: Handles full payment flow: 402 response -> sign -> settle -> credit balance

import type { GatewayClient } from '../gateway/client.js';
import type { WalletProvider } from '../wallet/types.js';
import type { PaymentPayload, PaymentRequirement, CreditBalance } from '../gateway/types.js';
import { UserRejectedError } from '../wallet/types.js';
import { buildDomain, buildAuthorizationMessage, buildTypedData } from '../signing/eip712.js';

export interface DepositCreditsInput {
  amount: string;
}

export interface DepositCreditsOutput {
  success: boolean;
  deposited?: string;
  balance?: CreditBalance;
  txHash?: string;
  error?: string;
}

/**
 * Deposit USDC to prepaid credit balance via x402 payment flow
 */
export async function depositCredits(
  input: DepositCreditsInput,
  wallet: WalletProvider,
  gateway: GatewayClient
): Promise<DepositCreditsOutput> {
  // Validate amount
  const validationError = validateAmount(input.amount);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    // Ensure wallet is connected
    const connected = await wallet.isConnected();
    if (!connected) {
      await wallet.connect();
    }

    const agentWallet = await wallet.getAddress();

    // Make initial request to get payment requirements
    const initialResult = await gateway.depositCredits(input.amount);

    // If not 402, something unexpected happened
    if (initialResult.status !== 402 || !initialResult.paymentRequired) {
      // Already succeeded without payment (shouldn't happen)
      if (initialResult.data) {
        return {
          success: true,
          deposited: initialResult.data.deposited,
          balance: initialResult.data.balance,
          txHash: initialResult.data.transaction,
        };
      }
      return { success: false, error: 'Unexpected response from gateway' };
    }

    // Extract payment requirement
    const paymentRequirement = initialResult.paymentRequired.accepts[0];
    if (!paymentRequirement) {
      return { success: false, error: 'No payment method available' };
    }

    // Build and sign the payment authorization
    const paymentPayload = await buildPaymentPayload(
      paymentRequirement,
      agentWallet,
      wallet
    );

    // Retry request with payment
    const paidResult = await gateway.depositCredits(input.amount, paymentPayload);

    // Check if settlement failed (got another 402 after sending payment)
    if (paidResult.status === 402) {
      const errorMsg =
        (paidResult.paymentRequired as { error?: string })?.error ??
        'Payment settlement failed';
      return { success: false, error: errorMsg };
    }

    if (!paidResult.data) {
      return { success: false, error: 'Deposit failed: no response data' };
    }

    return {
      success: true,
      deposited: paidResult.data.deposited,
      balance: paidResult.data.balance,
      txHash: paidResult.data.transaction,
    };
  } catch (error) {
    if (error instanceof UserRejectedError) {
      return { success: false, error: 'User rejected the payment request' };
    }
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error occurred' };
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

async function buildPaymentPayload(
  requirement: PaymentRequirement,
  fromAddress: `0x${string}`,
  wallet: WalletProvider
): Promise<PaymentPayload> {
  // Get EIP-712 domain from payment requirement
  const eip712Config = requirement.extra?.eip712;
  const domain = buildDomain({
    chainId: eip712Config?.chainId ?? 8453,
    verifyingContract: eip712Config?.verifyingContract ?? requirement.asset,
    name: eip712Config?.name,
    version: eip712Config?.version,
  });

  // Calculate validity window
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60; // Valid from 1 minute ago
  const validBefore = now + requirement.maxTimeoutSeconds;

  // Build authorization message
  const message = buildAuthorizationMessage({
    from: fromAddress,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    validAfter,
    validBefore,
  });

  // Build typed data and sign
  const typedData = buildTypedData(domain, message);
  const signature = await wallet.signTypedData(typedData.domain, typedData.message);

  return {
    x402Version: 1,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: {
      signature,
      authorization: {
        from: fromAddress,
        to: requirement.payTo,
        value: requirement.maxAmountRequired,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: message.nonce,
      },
    },
  };
}
