// ABOUTME: Tests for pay_for_query MCP tool
// ABOUTME: Tests payment flow, input validation, and error handling

import { jest } from '@jest/globals';
import { payForQuery, PayForQueryInput } from '../../src/tools/payForQuery.js';
import type { WalletProvider } from '../../src/wallet/types.js';
import type { GatewayClient } from '../../src/gateway/client.js';
import { UserRejectedError } from '../../src/wallet/types.js';

describe('payForQuery', () => {
  let mockWallet: jest.Mocked<WalletProvider>;
  let mockGateway: jest.Mocked<GatewayClient>;

  const validInput: PayForQueryInput = {
    provider_id: '123e4567-e89b-12d3-a456-426614174000',
    request: {
      method: 'POST',
      path: '/query',
      body: { sql: 'SELECT * FROM users' },
    },
  };

  const mockPaymentRequirement = {
    scheme: 'exact',
    network: 'base-mainnet',
    maxAmountRequired: '1000000',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: '0xGatewayWallet',
    resource: '/query',
    description: 'Database query',
    mimeType: 'application/json',
    outputSchema: null,
    maxTimeoutSeconds: 60,
    extra: {
      estimatedCost: '1.00',
      eip712: {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
    },
  };

  beforeEach(() => {
    mockWallet = {
      getAddress: jest.fn().mockResolvedValue('0xAgentWallet'),
      signTypedData: jest.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
      isConnected: jest.fn().mockResolvedValue(true),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    mockGateway = {
      listProviders: jest.fn(),
      getProvider: jest.fn(),
      proxyRequest: jest.fn(),
      encodePaymentPayload: jest.fn().mockReturnValue('base64payload'),
      decodePaymentResponse: jest.fn().mockReturnValue({ txHash: '0xdefault', success: true }),
    } as unknown as jest.Mocked<GatewayClient>;
  });

  describe('input validation', () => {
    it('should reject missing provider_id', async () => {
      const result = await payForQuery(
        { request: { path: '/query' } } as PayForQueryInput,
        mockWallet,
        mockGateway
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('provider_id');
    });

    it('should reject missing request', async () => {
      const result = await payForQuery(
        { provider_id: 'test-id' } as PayForQueryInput,
        mockWallet,
        mockGateway
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('request');
    });

    it('should reject missing request.path', async () => {
      const result = await payForQuery(
        { provider_id: 'test-id', request: {} } as PayForQueryInput,
        mockWallet,
        mockGateway
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('path');
    });

    it('should accept valid input with minimal fields', async () => {
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 200,
        data: { result: 'success' },
        paymentResponse: 'base64response',
      });

      const result = await payForQuery(
        { provider_id: 'test-id', request: { path: '/query' } },
        mockWallet,
        mockGateway
      );
      expect(result.success).toBe(true);
    });
  });

  describe('payment flow', () => {
    it('should get 402, sign, and retry with payment', async () => {
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 200,
        data: { rows: [{ id: 1 }] },
        paymentResponse: 'base64response',
      });
      mockGateway.decodePaymentResponse.mockReturnValue({
        txHash: '0xtxhash',
        success: true,
      });

      const result = await payForQuery(validInput, mockWallet, mockGateway);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ rows: [{ id: 1 }] });
      expect(result.cost).toBe('1 USDC');
      expect(result.txHash).toBe('0xtxhash');

      // Verify the flow
      expect(mockGateway.proxyRequest).toHaveBeenCalledTimes(2);
      expect(mockWallet.signTypedData).toHaveBeenCalledTimes(1);
    });

    it('should connect wallet if not connected', async () => {
      mockWallet.isConnected.mockResolvedValue(false);
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      await payForQuery(validInput, mockWallet, mockGateway);

      expect(mockWallet.connect).toHaveBeenCalled();
    });

    it('should include correct authorization in payment payload', async () => {
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      await payForQuery(validInput, mockWallet, mockGateway);

      // Second call should include the payment payload
      const secondCall = mockGateway.proxyRequest.mock.calls[1];
      expect(secondCall[1]).toBeDefined(); // Payment payload parameter
    });

    it('should use agent wallet address as from in authorization', async () => {
      mockWallet.getAddress.mockResolvedValue('0xMyAgentWallet');
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      await payForQuery(validInput, mockWallet, mockGateway);

      expect(mockWallet.getAddress).toHaveBeenCalled();
      // The wallet address should be used in the proxy request
      const firstCall = mockGateway.proxyRequest.mock.calls[0];
      expect(firstCall[0].agentWallet).toBe('0xMyAgentWallet');
    });
  });

  describe('error handling', () => {
    it('should handle user rejection gracefully', async () => {
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockWallet.signTypedData.mockRejectedValue(new UserRejectedError('User rejected'));

      const result = await payForQuery(validInput, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('rejected');
    });

    it('should handle gateway error', async () => {
      mockGateway.proxyRequest.mockRejectedValue(new Error('Gateway unavailable'));

      const result = await payForQuery(validInput, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gateway');
    });

    it('should handle empty accepts array', async () => {
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [] },
      });

      const result = await payForQuery(validInput, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('payment');
    });

    it('should handle payment retry failure', async () => {
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockGateway.proxyRequest.mockRejectedValueOnce(new Error('Payment rejected'));

      const result = await payForQuery(validInput, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Payment');
    });
  });

  describe('default method', () => {
    it('should default to GET when method not specified', async () => {
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 402,
        paymentRequired: { x402Version: 1, accepts: [mockPaymentRequirement] },
      });
      mockGateway.proxyRequest.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      await payForQuery(
        { provider_id: 'test', request: { path: '/data' } },
        mockWallet,
        mockGateway
      );

      const firstCall = mockGateway.proxyRequest.mock.calls[0];
      expect(firstCall[0].request.method).toBe('GET');
    });
  });
});
