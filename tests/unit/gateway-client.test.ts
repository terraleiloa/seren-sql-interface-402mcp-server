// ABOUTME: Tests for the gateway HTTP client
// ABOUTME: Tests encoding/decoding utilities (HTTP methods tested in integration)

import { GatewayClient } from '../../src/gateway/client.js';
import type { PaymentPayload } from '../../src/gateway/types.js';
import { isInsufficientCreditError } from '../../src/gateway/types.js';

describe('GatewayClient', () => {
  let client: GatewayClient;

  beforeEach(() => {
    client = new GatewayClient('https://test.gateway.com');
  });

  describe('constructor', () => {
    it('should use provided baseUrl', () => {
      const customClient = new GatewayClient('https://custom.gateway.com');
      expect(customClient).toBeDefined();
    });

    it('should use default gateway URL when not provided', () => {
      const defaultClient = new GatewayClient();
      expect(defaultClient).toBeDefined();
    });
  });

  describe('encodePaymentPayload', () => {
    it('should encode payload as base64 JSON', () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-mainnet',
        payload: {
          signature: '0x' + '00'.repeat(65),
          authorization: {
            from: '0x1234567890123456789012345678901234567890',
            to: '0xABCDEF1234567890123456789012345678901234',
            value: '1000000',
            validAfter: '0',
            validBefore: '9999999999',
            nonce: '0x' + '00'.repeat(32),
          },
        },
      };

      const encoded = client.encodePaymentPayload(payload);

      // Should be valid base64
      expect(() => Buffer.from(encoded, 'base64')).not.toThrow();

      // Should decode back to original
      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      expect(decoded).toEqual(payload);
    });

    it('should handle special characters in payload', () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-mainnet',
        payload: {
          signature: '0xabcdef1234567890',
          authorization: {
            from: '0x1234567890123456789012345678901234567890',
            to: '0xABCDEF1234567890123456789012345678901234',
            value: '999999999999999999',
            validAfter: '0',
            validBefore: '9999999999',
            nonce: '0x' + 'ff'.repeat(32),
          },
        },
      };

      const encoded = client.encodePaymentPayload(payload);
      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      expect(decoded).toEqual(payload);
    });
  });

  describe('decodePaymentResponse', () => {
    it('should decode base64 response', () => {
      const original = {
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        success: true,
        gasUsed: '21000'
      };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const decoded = client.decodePaymentResponse(encoded);
      expect(decoded).toEqual(original);
    });

    it('should handle complex response objects', () => {
      const original = {
        status: 'settled',
        transaction: {
          hash: '0xabc',
          blockNumber: 12345678,
          from: '0x1234',
          to: '0xabcd',
          value: '1000000'
        },
        receipt: {
          gasUsed: '50000',
          effectiveGasPrice: '1000000000'
        }
      };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');

      const decoded = client.decodePaymentResponse(encoded);
      expect(decoded).toEqual(original);
    });

    it('should throw on invalid base64', () => {
      expect(() => client.decodePaymentResponse('not-valid-base64!!!')).toThrow();
    });

    it('should throw on invalid JSON', () => {
      const invalidJson = Buffer.from('not json').toString('base64');
      expect(() => client.decodePaymentResponse(invalidJson)).toThrow();
    });
  });

  describe('roundtrip encoding', () => {
    it('should encode and decode payment payload', () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-mainnet',
        payload: {
          signature: '0x' + 'ab'.repeat(65),
          authorization: {
            from: '0x1111111111111111111111111111111111111111',
            to: '0x2222222222222222222222222222222222222222',
            value: '500000',
            validAfter: '1700000000',
            validBefore: '1800000000',
            nonce: '0x' + '12'.repeat(32),
          },
        },
      };

      const encoded = client.encodePaymentPayload(payload);
      const decoded = client.decodePaymentResponse(encoded);
      expect(decoded).toEqual(payload);
    });
  });
});

describe('isInsufficientCreditError', () => {
  it('should return true for valid insufficient credit error', () => {
    const error = {
      error: 'Insufficient credit balance',
      minimumRequired: '1.00',
      depositEndpoint: '/api/credits/confirm-deposit',
    };
    expect(isInsufficientCreditError(error)).toBe(true);
  });

  it('should return true with different error message', () => {
    const error = {
      error: 'Not enough credits',
      minimumRequired: '5.50',
      depositEndpoint: '/api/credits/confirm-deposit',
    };
    expect(isInsufficientCreditError(error)).toBe(true);
  });

  it('should return false for standard x402 PaymentRequirementsResponse', () => {
    const paymentRequired = {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: 'base-mainnet',
          maxAmountRequired: '1000000',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          payTo: '0x1234567890123456789012345678901234567890',
          resource: '/api/data',
          description: 'Data access',
          mimeType: 'application/json',
          outputSchema: null,
          maxTimeoutSeconds: 60,
        },
      ],
    };
    expect(isInsufficientCreditError(paymentRequired)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isInsufficientCreditError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isInsufficientCreditError(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isInsufficientCreditError('string')).toBe(false);
    expect(isInsufficientCreditError(123)).toBe(false);
    expect(isInsufficientCreditError(true)).toBe(false);
  });

  it('should return false if missing error field', () => {
    const partial = {
      minimumRequired: '1.00',
      depositEndpoint: '/api/credits/confirm-deposit',
    };
    expect(isInsufficientCreditError(partial)).toBe(false);
  });

  it('should return false if missing minimumRequired field', () => {
    const partial = {
      error: 'Insufficient credit balance',
      depositEndpoint: '/api/credits/confirm-deposit',
    };
    expect(isInsufficientCreditError(partial)).toBe(false);
  });

  it('should return false if missing depositEndpoint field', () => {
    const partial = {
      error: 'Insufficient credit balance',
      minimumRequired: '1.00',
    };
    expect(isInsufficientCreditError(partial)).toBe(false);
  });
});
