// ABOUTME: Shared service for executing paid SQL queries via x402 Gateway
// ABOUTME: Handles the full payment flow: 402 response -> sign -> retry

import { GatewayClient } from '../gateway/client.js';
import { PrivateKeyWalletProvider } from '../wallet/privatekey.js';
import type { WalletProvider } from '../wallet/types.js';
import { buildDomain, buildAuthorizationMessage, buildTypedData } from '../signing/eip712.js';
import type { PaymentPayload, PaymentRequirement, QueryResult, Publisher, CreditBalance } from '../gateway/types.js';
import { UserRejectedError } from '../wallet/types.js';

export interface ExecuteQueryParams {
  sql: string;
  providerId: string;
}

export interface ExecuteApiCallParams {
  publisherId: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ExecuteApiCallResult {
  success: boolean;
  data?: unknown;
  cost?: string;
  txHash?: string;
  error?: string;
}

export interface ExecuteQueryResult {
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
 * Shared service for executing paid SQL queries via the x402 Gateway
 * Handles the complete payment flow including signing and retry logic
 */
export class SerenService {
  private gatewayClient: GatewayClient;
  private walletProvider: WalletProvider | null = null;
  private privateKey: string;
  private gatewayUrl: string;

  /**
   * Creates a new SerenService instance
   * @param privateKey - Wallet private key for signing payments
   * @param gatewayUrl - Base URL of the x402 Gateway
   */
  constructor(privateKey: string, gatewayUrl: string) {
    this.privateKey = privateKey;
    this.gatewayUrl = gatewayUrl;
    this.gatewayClient = new GatewayClient(gatewayUrl);
  }

  /**
   * Get or initialize the wallet provider (public for credit management)
   */
  async getWalletProvider(): Promise<WalletProvider> {
    if (this.walletProvider) {
      return this.walletProvider;
    }

    const provider = new PrivateKeyWalletProvider();
    await provider.connect(this.privateKey);
    this.walletProvider = provider;
    return provider;
  }

  /**
   * Get the gateway client (public for credit management)
   */
  getGatewayClient(): GatewayClient {
    return this.gatewayClient;
  }

  /**
   * Deposit USDC to prepaid credit balance via x402 payment flow
   * @param amount - Amount to deposit (e.g., "10.00" for 10 USDC)
   * @returns Deposit result with balance and transaction hash
   */
  async depositCredits(amount: string): Promise<{
    success: boolean;
    deposited?: string;
    balance?: CreditBalance;
    txHash?: string;
    error?: string;
  }> {
    // Validate amount
    if (!amount || !amount.trim()) {
      return { success: false, error: 'amount is required' };
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      return { success: false, error: 'amount must be a valid number' };
    }
    if (numAmount <= 0) {
      return { success: false, error: 'amount must be greater than zero' };
    }

    try {
      // Get wallet provider
      const wallet = await this.getWalletProvider();
      
      // Ensure wallet is connected
      const connected = await wallet.isConnected();
      if (!connected) {
        await wallet.connect();
      }

      const agentWallet = await wallet.getAddress();

      // Make initial request to get payment requirements
      const initialResult = await this.gatewayClient.depositCredits(amount);

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
      const paymentPayload = await this.buildPaymentPayload(
        paymentRequirement,
        agentWallet,
        wallet
      );

      // Retry request with payment
      const paidResult = await this.gatewayClient.depositCredits(amount, paymentPayload);

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

  /**
   * Execute a paid SQL query against a database publisher
   * Handles the full 402 payment flow: request -> 402 -> sign -> retry
   * @param params - Query parameters (SQL and provider ID)
   * @returns Query results with payment information
   */
  async executeQuery(params: ExecuteQueryParams): Promise<ExecuteQueryResult> {
    // Validate input
    if (!params.providerId) {
      return { success: false, error: 'providerId is required' };
    }
    if (!params.sql) {
      return { success: false, error: 'sql is required' };
    }

    // Basic SQL validation - must start with SELECT
    const trimmedSql = params.sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT')) {
      return { success: false, error: 'Only SELECT queries are allowed' };
    }

    try {
      // Get wallet provider
      const wallet = await this.getWalletProvider();
      
      // Ensure wallet is connected
      const connected = await wallet.isConnected();
      if (!connected) {
        await wallet.connect();
      }

      const agentWallet = await wallet.getAddress();

      // Make initial request to get payment requirements
      const initialResult = await this.gatewayClient.queryDatabase({
        publisherId: params.providerId,
        agentWallet,
        sql: params.sql,
      });

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

      // Extract payment requirement
      const paymentRequirement = initialResult.paymentRequired.accepts[0];
      if (!paymentRequirement) {
        return { success: false, error: 'No payment method available' };
      }

      // Build and sign the payment authorization
      const paymentPayload = await this.buildPaymentPayload(
        paymentRequirement,
        agentWallet,
        wallet
      );

      // Retry request with payment
      const paidResult = await this.gatewayClient.queryDatabase(
        {
          publisherId: params.providerId,
          agentWallet,
          sql: params.sql,
        },
        paymentPayload
      );

      if (!paidResult.data) {
        return { success: false, error: 'No data returned from gateway' };
      }

      // Extract transaction hash from settlement or payment response
      let txHash: string | undefined;
      if (paidResult.data.settlement?.transaction) {
        txHash = paidResult.data.settlement.transaction;
      } else if (paidResult.paymentResponse) {
        const paymentResponse = this.gatewayClient.decodePaymentResponse(paidResult.paymentResponse) as {
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
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown error occurred' };
    }
  }

  /**
   * Execute an admin SQL query using API key authentication
   * Bypasses x402 payment flow and uses SEREN_API_KEY for authentication
   * Allows DDL (CREATE/DROP) and DML (INSERT/UPDATE) operations
   * @param sql - SQL query to execute (any type allowed for admin)
   * @param apiKey - SerenDB API key for authentication
   * @param publisherId - Optional publisher ID (may be required by some endpoints)
   * @returns Query results
   */
  async executeAdminQuery(sql: string, apiKey: string, publisherId?: string): Promise<ExecuteQueryResult> {
    // Validate input
    if (!sql || !sql.trim()) {
      return { success: false, error: 'SQL query is required' };
    }
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API key is required for admin operations' };
    }

    try {
      // Make direct request with API key authentication
      // Use the same query endpoint but with API key header
      const url = `${this.gatewayUrl}/api/query`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      };

      // Build request body - include publisherId if provided
      const requestBody: { sql: string; publisherId?: string } = {
        sql: sql.trim(),
      };
      if (publisherId && publisherId.trim()) {
        requestBody.publisherId = publisherId.trim();
      }

      const body = JSON.stringify(requestBody);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        const errorText = await response.text();
        let errorBody: { error?: string };
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          errorBody = { error: errorText || 'Authentication failed' };
        }
        return { 
          success: false, 
          error: `Admin authentication failed: ${errorBody.error || 'Please check your SEREN_API_KEY.'}` 
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorBody: { error?: string; message?: string };
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          errorBody = { error: errorText || `HTTP ${response.status}` };
        }
        const errorMessage = errorBody.error || errorBody.message || `Query failed with status ${response.status}`;
        return { 
          success: false, 
          error: errorMessage
        };
      }

      const data = await response.json() as QueryResult;

      return {
        success: true,
        rows: data.rows,
        rowCount: data.rowCount,
        estimatedCost: data.estimatedCost,
        actualCost: data.actualCost,
        executionTime: data.executionTime,
      };
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: `Network error: ${error.message}` };
      }
      return { success: false, error: 'Unknown error occurred' };
    }
  }

  /**
   * Get publisher information associated with the API key
   * @param apiKey - SerenDB API key for authentication
   * @returns Publisher information
   */
  async getPublisherInfo(apiKey: string): Promise<{ success: boolean; publisher?: Publisher; error?: string }> {
    try {
      if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'API key is required' };
      }

      // Try to fetch publisher info using the API key
      // This endpoint might vary - trying common patterns
      const url = `${this.gatewayUrl}/api/publishers/me`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      };

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'Admin authentication failed. Please check your SEREN_API_KEY.',
        };
      }

      if (!response.ok) {
        // If /api/publishers/me doesn't work, try /api/publishers
        const altUrl = `${this.gatewayUrl}/api/publishers`;
        const altResponse = await fetch(altUrl, {
          method: 'GET',
          headers,
        });

        if (altResponse.ok) {
          const data = await altResponse.json() as Record<string, unknown>;
          // Handle both array and object responses
          const publishers = Array.isArray(data) ? data : ((data.publishers || data.providers || []) as Publisher[]);
          if (publishers.length > 0) {
            return {
              success: true,
              publisher: publishers[0] as Publisher,
            };
          }
        }

        const errorText = await response.text();
        let errorBody: { error?: string; message?: string };
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          errorBody = { error: errorText || `HTTP ${response.status}` };
        }
        return {
          success: false,
          error: errorBody.error || errorBody.message || `Failed to fetch publisher info: ${response.status}`,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      // Handle both direct publisher object and wrapped responses
      const publisher = (data.publisher || data) as Publisher;
      
      return {
        success: true,
        publisher: publisher as Publisher,
      };
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: `Network error: ${error.message}` };
      }
      return { success: false, error: 'Unknown error occurred' };
    }
  }

  /**
   * List all tables in the public schema
   * @param apiKey - SerenDB API key for authentication
   * @param publisherId - Optional publisher ID (may be required by some endpoints)
   * @returns Array of table names
   */
  async listTables(apiKey: string, publisherId?: string): Promise<ExecuteQueryResult> {
    const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`;
    return this.executeAdminQuery(sql, apiKey, publisherId);
  }

  /**
   * Update publisher connection string
   * @param connectionString - New PostgreSQL connection string
   * @param apiKey - SerenDB API key for authentication
   * @returns Success status and message
   */
  async updatePublisherConnection(connectionString: string, apiKey: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      if (!connectionString || !connectionString.trim()) {
        return { success: false, error: 'Connection string is required' };
      }
      if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'API key is required' };
      }

      return await this.gatewayClient.updatePublisherConnection(connectionString, apiKey);
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown error occurred' };
    }
  }

  /**
   * Get schema details for a specific table
   * @param tableName - Name of the table to inspect
   * @param apiKey - SerenDB API key for authentication
   * @param publisherId - Optional publisher ID (may be required by some endpoints)
   * @returns Table schema information (columns, types, constraints)
   */
  async getTableSchema(tableName: string, apiKey: string, publisherId?: string): Promise<ExecuteQueryResult> {
    // Sanitize table name to prevent SQL injection
    // Only allow alphanumeric characters and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return { 
        success: false, 
        error: 'Invalid table name. Only alphanumeric characters and underscores are allowed.' 
      };
    }

    const sql = `SELECT column_name, data_type, is_nullable, column_default 
                 FROM information_schema.columns 
                 WHERE table_name = '${tableName}' AND table_schema = 'public'
                 ORDER BY ordinal_position;`;
    return this.executeAdminQuery(sql, apiKey, publisherId);
  }

  /**
   * List available publishers from the gateway catalog
   * @param options - Optional filters (category, type)
   * @returns Array of publishers
   */
  async listPublishers(options?: {
    category?: string;
    type?: 'database' | 'api' | 'both';
  }): Promise<{ success: boolean; publishers?: Publisher[]; error?: string }> {
    try {
      const publishers = await this.gatewayClient.listPublishers(options);
      return {
        success: true,
        publishers,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Execute a paid API call via the x402 Gateway
   * Handles the complete payment flow including signing and retry logic
   * @param params - API call parameters (publisher, method, path, body)
   * @returns API response with payment information
   */
  async executeApiCall(params: ExecuteApiCallParams): Promise<ExecuteApiCallResult> {
    // Validate input
    if (!params.publisherId) {
      return { success: false, error: 'publisherId is required' };
    }
    if (!params.path) {
      return { success: false, error: 'path is required' };
    }

    try {
      // Get wallet provider
      const wallet = await this.getWalletProvider();
      
      // Ensure wallet is connected
      const connected = await wallet.isConnected();
      if (!connected) {
        await wallet.connect();
      }

      const agentWallet = await wallet.getAddress();

      // Make initial request to get payment requirements
      const initialResult = await this.gatewayClient.proxyRequest({
        publisherId: params.publisherId,
        agentWallet,
        request: {
          method: params.method ?? 'GET',
          path: params.path,
          body: params.body,
          headers: params.headers,
        },
      });

      // If not 402, no payment needed or something unexpected
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
      const paymentPayload = await this.buildPaymentPayload(
        paymentRequirement,
        agentWallet,
        wallet
      );

      // Retry request with payment
      const paidResult = await this.gatewayClient.proxyRequest(
        {
          publisherId: params.publisherId,
          agentWallet,
          request: {
            method: params.method ?? 'GET',
            path: params.path,
            body: params.body,
            headers: params.headers,
          },
        },
        paymentPayload
      );

      // Check if settlement failed
      if (paidResult.status === 402) {
        const errorMsg = (paidResult.paymentRequired as { error?: string })?.error ?? 'Payment settlement failed';
        return { success: false, error: errorMsg };
      }

      // Extract transaction hash
      let txHash: string | undefined;
      if (paidResult.paymentResponse) {
        const paymentResponse = this.gatewayClient.decodePaymentResponse(paidResult.paymentResponse) as {
          transaction?: string;
          txHash?: string;
        };
        txHash = paymentResponse.transaction || paymentResponse.txHash;
      }

      return {
        success: true,
        data: paidResult.data,
        cost: this.formatUsdc(paymentRequirement.maxAmountRequired),
        txHash,
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

  /**
   * Format USDC amount for display
   */
  private formatUsdc(amount: string): string {
    const value = BigInt(amount);
    const decimals = 6n;
    const whole = value / (10n ** decimals);
    const fraction = value % (10n ** decimals);
    return `${whole}.${fraction.toString().padStart(6, '0')} USDC`;
  }

  /**
   * Build payment payload from payment requirement
   */
  private async buildPaymentPayload(
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
}

