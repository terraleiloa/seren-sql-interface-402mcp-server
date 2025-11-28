// ABOUTME: Primary MCP tool for executing paid queries against x402-protected APIs
// ABOUTME: Handles the full payment flow: 402 response -> sign -> retry

import type { WalletProvider } from '../wallet/types.js';
import type { GatewayClient } from '../gateway/client.js';
import type { PaymentPayload, PaymentRequirement } from '../gateway/types.js';
import { UserRejectedError } from '../wallet/types.js';
import { buildDomain, buildAuthorizationMessage, buildTypedData } from '../signing/eip712.js';
import { formatUsdc } from '../utils/usdc.js';

export interface PayForQueryInput {
  provider_id: string;
  request: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
}

export interface PayForQueryOutput {
  success: boolean;
  data?: unknown;
  cost?: string;
  txHash?: string;
  error?: string;
}

/**
 * Execute a paid query against an x402-protected API provider
 */
export async function payForQuery(
  input: PayForQueryInput,
  wallet: WalletProvider,
  gateway: GatewayClient
): Promise<PayForQueryOutput> {
  // Validate input
  const validationError = validateInput(input);
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
    const initialResult = await gateway.proxyRequest({
      providerId: input.provider_id,
      agentWallet,
      request: {
        method: input.request.method ?? 'GET',
        path: input.request.path,
        body: input.request.body,
        headers: input.request.headers,
      },
    });

    // If not 402, something is wrong or no payment needed
    if (initialResult.status !== 402 || !initialResult.paymentRequired) {
      return {
        success: true,
        data: initialResult.data,
      };
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
    const paidResult = await gateway.proxyRequest(
      {
        providerId: input.provider_id,
        agentWallet,
        request: {
          method: input.request.method ?? 'GET',
          path: input.request.path,
          body: input.request.body,
          headers: input.request.headers,
        },
      },
      paymentPayload
    );

    // Extract transaction hash from payment response
    let txHash: string | undefined;
    if (paidResult.paymentResponse) {
      const paymentResponse = gateway.decodePaymentResponse(paidResult.paymentResponse) as {
        txHash?: string;
      };
      txHash = paymentResponse.txHash;
    }

    return {
      success: true,
      data: paidResult.data,
      cost: formatUsdc(paymentRequirement.maxAmountRequired),
      txHash,
    };
  } catch (error) {
    if (error instanceof UserRejectedError) {
      return { success: false, error: 'User rejected the payment request' };
    }
    if (error instanceof Error) {
      if (error.message.includes('Gateway') || error.message.includes('unavailable')) {
        return { success: false, error: error.message };
      }
      if (error.message.includes('Payment') || error.message.includes('rejected')) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error occurred' };
  }
}

function validateInput(input: PayForQueryInput): string | null {
  if (!input.provider_id) {
    return 'provider_id is required';
  }
  if (!input.request) {
    return 'request is required';
  }
  if (!input.request.path) {
    return 'request.path is required';
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
