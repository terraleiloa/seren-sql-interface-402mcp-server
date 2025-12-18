// ABOUTME: Tests for check_credit_balance MCP tool
// ABOUTME: Tests wallet connection, gateway communication, and error handling

import { jest } from '@jest/globals';
import { checkCreditBalance } from '../../src/tools/checkCreditBalance.js';
import type { WalletProvider } from '../../src/wallet/types.js';
import type { GatewayClient } from '../../src/gateway/client.js';

describe('checkCreditBalance', () => {
  let mockWallet: jest.Mocked<WalletProvider>;
  let mockGateway: jest.Mocked<GatewayClient>;

  const mockCreditBalance = {
    agentWallet: '0x1234567890123456789012345678901234567890',
    balance: '10.00',
    reserved: '2.00',
    available: '8.00',
  };

  beforeEach(() => {
    mockWallet = {
      getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signTypedData: jest.fn(),
      isConnected: jest.fn().mockResolvedValue(true),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WalletProvider>;

    mockGateway = {
      getCreditBalance: jest.fn().mockResolvedValue(mockCreditBalance),
      listPublishers: jest.fn(),
      getPublisher: jest.fn(),
      proxyRequest: jest.fn(),
      encodePaymentPayload: jest.fn(),
      decodePaymentResponse: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;
  });

  describe('successful balance check', () => {
    it('should return balance info for connected wallet', async () => {
      const result = await checkCreditBalance(mockWallet, mockGateway);

      expect(result.success).toBe(true);
      expect(result.wallet).toBe('0x1234567890123456789012345678901234567890');
      expect(result.balance).toBe('10.00');
      expect(result.reserved).toBe('2.00');
      expect(result.available).toBe('8.00');
      expect(mockWallet.getAddress).toHaveBeenCalled();
      expect(mockGateway.getCreditBalance).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890');
    });
  });

  describe('wallet errors', () => {
    it('should return error when wallet is not connected', async () => {
      mockWallet.getAddress.mockRejectedValue(new Error('Wallet is not connected'));

      const result = await checkCreditBalance(mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Wallet is not connected');
    });
  });

  describe('gateway errors', () => {
    it('should return error when gateway fails', async () => {
      mockGateway.getCreditBalance = jest.fn().mockRejectedValue(new Error('Credit balance not found'));

      const result = await checkCreditBalance(mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credit balance not found');
    });

    it('should handle network errors', async () => {
      mockGateway.getCreditBalance = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await checkCreditBalance(mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
