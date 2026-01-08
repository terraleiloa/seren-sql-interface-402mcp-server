// ABOUTME: MCP tool for executing paid SQL queries against database publishers
// ABOUTME: Handles the full payment flow: 402 response -> sign -> retry

import type { WalletProvider } from '../wallet/types.js';
import type { GatewayClient } from '../gateway/client.js';
import type { PaymentPayload, PaymentRequirement, QueryResult } from '../gateway/types.js';
import { isInsufficientCreditError } from '../gateway/types.js';
import { UserRejectedError } from '../wallet/types.js';
import { buildDomain, buildAuthorizationMessage, buildTypedData } from '../signing/eip712.js';
import { formatUsdc } from '../utils/usdc.js';
import { truncateResponse } from '../utils/truncate.js';
import { depositCredits } from './depositCredits.js';

export interface QueryDatabaseInput {
  publisher_id: string;
  sql: string;
}

export interface QueryDatabaseOutput {
  success: boolean;
  rows?: unknown[];
  rowCount?: number;
  estimatedCost?: string;
  actualCost?: string;
  executionTime?: number;
  txHash?: string;
  error?: string;
  truncated?: boolean;
  originalSizeBytes?: number;
  depositInfo?: {
    deposited: string;
    txHash: string;
  };
}

/**
 * Execute a paid SQL query against a database publisher
 */
export async function queryDatabase(
  input: QueryDatabaseInput,
  wallet: WalletProvider,
  gateway: GatewayClient
): Promise<QueryDatabaseOutput> {
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
    const initialResult = await gateway.queryDatabase({
      publisherId: input.publisher_id,
      agentWallet,
      sql: input.sql,
    });

    // If not 402, something unexpected or no payment needed
    if (initialResult.status !== 402 || !initialResult.paymentRequired) {
      // This shouldn't happen for database queries, but handle it
      if (initialResult.data) {
        const truncated = truncateResponse(initialResult.data.rows);
        return {
          success: true,
          rows: truncated.data as unknown[],
          rowCount: initialResult.data.rowCount,
          estimatedCost: initialResult.data.estimatedCost,
          actualCost: initialResult.data.actualCost,
          executionTime: initialResult.data.executionTime,
          truncated: truncated.truncated || undefined,
          originalSizeBytes: truncated.originalSizeBytes,
        };
      }
      return { success: false, error: 'Unexpected response from gateway' };
    }

    // Check if this is an insufficient credit error (prepaid credits publisher)
    // Auto-deposit the minimum required amount and retry the query
    if (isInsufficientCreditError(initialResult.paymentRequired)) {
      const creditError = initialResult.paymentRequired;

      // Auto-deposit the minimum required amount
      const depositResult = await depositCredits(
        { amount: creditError.minimumRequired },
        wallet,
        gateway
      );

      if (!depositResult.success) {
        return {
          success: false,
          error: `Auto-deposit failed: ${depositResult.error}. You need ${creditError.minimumRequired} USDC to use this publisher.`,
        };
      }

      // Retry the original query after successful deposit
      const retryResult = await gateway.queryDatabase({
        publisherId: input.publisher_id,
        agentWallet,
        sql: input.sql,
      });

      // Handle retry result
      if (retryResult.status === 402) {
        const errorMsg =
          (retryResult.paymentRequired as { error?: string })?.error ??
          'Query failed after deposit - insufficient balance';
        return { success: false, error: errorMsg };
      }

      if (!retryResult.data) {
        return { success: false, error: 'No data returned after deposit' };
      }

      const truncatedRetry = truncateResponse(retryResult.data.rows);
      return {
        success: true,
        rows: truncatedRetry.data as unknown[],
        rowCount: retryResult.data.rowCount,
        estimatedCost: retryResult.data.estimatedCost,
        actualCost: retryResult.data.actualCost,
        executionTime: retryResult.data.executionTime,
        truncated: truncatedRetry.truncated || undefined,
        originalSizeBytes: truncatedRetry.originalSizeBytes,
        depositInfo: {
          deposited: depositResult.deposited!,
          txHash: depositResult.txHash!,
        },
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
    const paidResult = await gateway.queryDatabase(
      {
        publisherId: input.publisher_id,
        agentWallet,
        sql: input.sql,
      },
      paymentPayload
    );

    // Check if settlement failed (got another 402 after sending payment)
    if (paidResult.status === 402) {
      const errorMsg =
        (paidResult.paymentRequired as { error?: string })?.error ??
        'Payment settlement failed';
      return { success: false, error: errorMsg };
    }

    if (!paidResult.data) {
      return { success: false, error: 'No data returned from gateway' };
    }

    // Extract transaction hash from settlement or payment response
    let txHash: string | undefined;
    if (paidResult.data.settlement?.transaction) {
      txHash = paidResult.data.settlement.transaction;
    } else if (paidResult.paymentResponse) {
      const paymentResponse = gateway.decodePaymentResponse(paidResult.paymentResponse) as {
        transaction?: string;
      };
      txHash = paymentResponse.transaction;
    }

    const truncatedResult = truncateResponse(paidResult.data.rows);
    return {
      success: true,
      rows: truncatedResult.data as unknown[],
      rowCount: paidResult.data.rowCount,
      estimatedCost: paidResult.data.estimatedCost,
      actualCost: paidResult.data.actualCost,
      executionTime: paidResult.data.executionTime,
      txHash,
      truncated: truncatedResult.truncated || undefined,
      originalSizeBytes: truncatedResult.originalSizeBytes,
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

function validateInput(input: QueryDatabaseInput): string | null {
  if (!input.publisher_id) {
    return 'publisher_id is required';
  }
  if (!input.sql) {
    return 'sql is required';
  }
  // Basic SQL validation - must start with SELECT
  const trimmedSql = input.sql.trim().toUpperCase();
  if (!trimmedSql.startsWith('SELECT')) {
    return 'Only SELECT queries are allowed';
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
