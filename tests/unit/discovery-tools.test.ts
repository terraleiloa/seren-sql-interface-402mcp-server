// ABOUTME: Tests for discovery MCP tools (listProviders, getProviderDetails)
// ABOUTME: Tests input validation, gateway communication, and response formatting

import { jest } from '@jest/globals';
import { listProviders, ListProvidersInput } from '../../src/tools/listProviders.js';
import { getProviderDetails, GetProviderDetailsInput } from '../../src/tools/getProviderDetails.js';
import type { GatewayClient } from '../../src/gateway/client.js';

describe('listProviders', () => {
  let mockGateway: jest.Mocked<GatewayClient>;

  const mockProviders = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test Provider 1',
      providerType: 'api' as const,
      pricePerCall: '0.01',
      categories: ['finance'],
    },
    {
      id: '223e4567-e89b-12d3-a456-426614174001',
      name: 'Test Provider 2',
      providerType: 'database' as const,
      pricePerCall: '0.05',
      categories: ['analytics'],
    },
  ];

  beforeEach(() => {
    mockGateway = {
      listProviders: jest.fn().mockResolvedValue(mockProviders),
      getProvider: jest.fn(),
      proxyRequest: jest.fn(),
      encodePaymentPayload: jest.fn(),
      decodePaymentResponse: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;
  });

  describe('without filters', () => {
    it('should return all providers', async () => {
      const result = await listProviders({}, mockGateway);

      expect(result.success).toBe(true);
      expect(result.providers).toHaveLength(2);
      expect(mockGateway.listProviders).toHaveBeenCalledWith({});
    });
  });

  describe('with category filter', () => {
    it('should pass category to gateway', async () => {
      await listProviders({ category: 'finance' }, mockGateway);

      expect(mockGateway.listProviders).toHaveBeenCalledWith({ category: 'finance' });
    });
  });

  describe('with type filter', () => {
    it('should pass type to gateway', async () => {
      await listProviders({ type: 'api' }, mockGateway);

      expect(mockGateway.listProviders).toHaveBeenCalledWith({ type: 'api' });
    });
  });

  describe('with both filters', () => {
    it('should pass both filters to gateway', async () => {
      await listProviders({ category: 'finance', type: 'database' }, mockGateway);

      expect(mockGateway.listProviders).toHaveBeenCalledWith({
        category: 'finance',
        type: 'database',
      });
    });
  });

  describe('error handling', () => {
    it('should handle gateway error', async () => {
      mockGateway.listProviders.mockRejectedValue(new Error('Gateway unavailable'));

      const result = await listProviders({}, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gateway');
    });

    it('should return empty array when no providers found', async () => {
      mockGateway.listProviders.mockResolvedValue([]);

      const result = await listProviders({}, mockGateway);

      expect(result.success).toBe(true);
      expect(result.providers).toHaveLength(0);
    });
  });
});

describe('getProviderDetails', () => {
  let mockGateway: jest.Mocked<GatewayClient>;

  const mockProvider = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Provider',
    resourceName: 'test-resource',
    resourceDescription: 'A test resource for testing',
    providerType: 'api' as const,
    pricePerCall: '0.01',
    categories: ['finance', 'testing'],
    upstreamApiUrl: 'https://api.example.com',
  };

  beforeEach(() => {
    mockGateway = {
      listProviders: jest.fn(),
      getProvider: jest.fn().mockResolvedValue(mockProvider),
      proxyRequest: jest.fn(),
      encodePaymentPayload: jest.fn(),
      decodePaymentResponse: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;
  });

  describe('input validation', () => {
    it('should reject missing provider_id', async () => {
      const result = await getProviderDetails({} as GetProviderDetailsInput, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('provider_id');
    });

    it('should reject empty provider_id', async () => {
      const result = await getProviderDetails({ provider_id: '' }, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('provider_id');
    });
  });

  describe('successful retrieval', () => {
    it('should return provider details', async () => {
      const result = await getProviderDetails(
        { provider_id: '123e4567-e89b-12d3-a456-426614174000' },
        mockGateway
      );

      expect(result.success).toBe(true);
      expect(result.provider).toBeDefined();
      expect(result.provider?.name).toBe('Test Provider');
      expect(result.provider?.pricePerCall).toBe('0.01');
    });

    it('should call gateway with correct provider_id', async () => {
      await getProviderDetails(
        { provider_id: '123e4567-e89b-12d3-a456-426614174000' },
        mockGateway
      );

      expect(mockGateway.getProvider).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000'
      );
    });
  });

  describe('error handling', () => {
    it('should handle provider not found', async () => {
      mockGateway.getProvider.mockRejectedValue(new Error('Provider not found: unknown-id'));

      const result = await getProviderDetails({ provider_id: 'unknown-id' }, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle gateway error', async () => {
      mockGateway.getProvider.mockRejectedValue(new Error('Gateway unavailable'));

      const result = await getProviderDetails(
        { provider_id: '123e4567-e89b-12d3-a456-426614174000' },
        mockGateway
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gateway');
    });
  });
});
