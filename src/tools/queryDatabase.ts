// ABOUTME: MCP tool for executing paid SQL queries against database publishers
// ABOUTME: Handles the full payment flow: 402 response -> sign -> retry

import type { WalletProvider } from '../wallet/types.js';
import type { GatewayClient } from '../gateway/client.js';
import type { PaymentPayload, PaymentRequirement, QueryResult } from '../gateway/types.js';
import { isInsufficientCreditError } from '../gateway/types.js';
import { UserRejectedError } from '../wallet/types.js';
import { buildDomain, buildAuthorizationMessage, buildTypedData } from '../signing/eip712.js';
import { formatUsdc } from '../utils/usdc.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
import { config } from '../config/index.js';

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
    // Log query before execution
    console.log('\n📝 Executing query:');
    console.log('SQL:', input.sql.trim());
    console.log('Publisher ID:', input.publisher_id);
    
    // Ensure wallet is connected
    const connected = await wallet.isConnected();
    if (!connected) {
      await wallet.connect();
    }

    const agentWallet = await wallet.getAddress();
    console.log('Agent Wallet:', agentWallet);

    // Make initial request to get payment requirements (with retry for connection issues)
    const initialResult = await retryWithBackoff(
      async () => {
        return await gateway.queryDatabase({
          publisherId: input.publisher_id,
          agentWallet,
          sql: input.sql,
        });
      },
      {
        maxAttempts: config.QUERY_RETRY_ATTEMPTS + 1, // +1 because first attempt is not a retry
        delayMs: config.QUERY_RETRY_DELAY_MS,
        shouldRetry: (error, attempt) => {
          // Only retry on retryable errors (timeouts, connection issues, 5xx errors)
          // Note: 402 responses are returned normally, not thrown, so they won't trigger retries
          return isRetryableError(error);
        },
        onRetry: (error, attempt) => {
          console.warn(`⚠️  Query request failed (attempt ${attempt}), retrying...`);
          if (error instanceof Error) {
            const errorAny = error as any;
            if (errorAny.errorBody?.details) {
              console.warn(`   Error: ${errorAny.errorBody.details}`);
            }
          }
        }
      }
    );

    // If not 402, something unexpected or no payment needed
    if (initialResult.status !== 402 || !initialResult.paymentRequired) {
      // This shouldn't happen for database queries, but handle it
      if (initialResult.data) {
        return {
          success: true,
          rows: initialResult.data.rows,
          rowCount: initialResult.data.rowCount,
          estimatedCost: initialResult.data.estimatedCost,
          actualCost: initialResult.data.actualCost,
          executionTime: initialResult.data.executionTime,
        };
      }
      return { success: false, error: 'Unexpected response from gateway' };
    }

    // Check if this is an insufficient credit error (prepaid credits publisher)
    if (isInsufficientCreditError(initialResult.paymentRequired)) {
      const creditError = initialResult.paymentRequired;
      return {
        success: false,
        error: `Insufficient credit balance. Minimum required: ${creditError.minimumRequired} USDC. Please deposit funds to continue.`,
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

    // Retry request with payment (with retry for connection issues)
    const paidResult = await retryWithBackoff(
      async () => {
        return await gateway.queryDatabase(
          {
            publisherId: input.publisher_id,
            agentWallet,
            sql: input.sql,
          },
          paymentPayload
        );
      },
      {
        maxAttempts: config.QUERY_RETRY_ATTEMPTS + 1, // +1 because first attempt is not a retry
        delayMs: config.QUERY_RETRY_DELAY_MS,
        shouldRetry: (error, attempt) => {
          // Don't retry on 402 (payment settlement issues shouldn't be retried automatically)
          if (error && typeof error === 'object' && 'status' in error && (error as any).status === 402) {
            return false;
          }
          return isRetryableError(error);
        },
        onRetry: (error, attempt) => {
          console.warn(`⚠️  Paid query request failed (attempt ${attempt}), retrying...`);
          if (error instanceof Error) {
            const errorAny = error as any;
            if (errorAny.errorBody?.details) {
              console.warn(`   Error: ${errorAny.errorBody.details}`);
            }
          }
        }
      }
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

    return {
      success: true,
      rows: paidResult.data.rows,
      rowCount: paidResult.data.rowCount,
      estimatedCost: paidResult.data.estimatedCost,
      actualCost: paidResult.data.actualCost,
      executionTime: paidResult.data.executionTime,
      txHash,
    };
  } catch (error) {
    if (error instanceof UserRejectedError) {
      return { success: false, error: 'User rejected the payment request' };
    }
    if (error instanceof Error) {
      // Build detailed error message
      let errorMessage = error.message;
      
      // If error has additional context, include it
      const errorAny = error as any;
      if (errorAny.statusCode || errorAny.errorBody || errorAny.requestDetails) {
        const details: string[] = [errorMessage];
        
        if (errorAny.statusCode) {
          details.push(`HTTP Status: ${errorAny.statusCode} ${errorAny.statusText || ''}`.trim());
        }
        
        if (errorAny.errorBody) {
          const errorBodyStr = typeof errorAny.errorBody === 'string' 
            ? errorAny.errorBody 
            : JSON.stringify(errorAny.errorBody, null, 2);
          details.push(`Error Details: ${errorBodyStr}`);
        }
        
        if (errorAny.requestDetails) {
          details.push(`Request Context: ${JSON.stringify(errorAny.requestDetails, null, 2)}`);
        }
        
        errorMessage = details.join('\n');
      }
      
      // Include stack trace if available (for debugging)
      if (error.stack && process.env.DEBUG) {
        errorMessage += `\nStack trace: ${error.stack}`;
      }
      
      return { success: false, error: errorMessage };
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
