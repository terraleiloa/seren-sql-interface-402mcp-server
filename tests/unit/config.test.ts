// ABOUTME: Tests for environment configuration validation
// ABOUTME: Validates config exports the expected shape

import { config } from '../../src/config/index.js';

describe('Config', () => {
  it('should export X402_GATEWAY_URL', () => {
    expect(config.X402_GATEWAY_URL).toBeDefined();
    expect(typeof config.X402_GATEWAY_URL).toBe('string');
    expect(config.X402_GATEWAY_URL).toMatch(/^https?:\/\//);
  });

  it('should export WALLET_TYPE with valid enum value', () => {
    expect(config.WALLET_TYPE).toBeDefined();
    expect(['browser', 'walletconnect', 'hardware']).toContain(config.WALLET_TYPE);
  });

  it('should export BASE_RPC_URL', () => {
    expect(config.BASE_RPC_URL).toBeDefined();
    expect(typeof config.BASE_RPC_URL).toBe('string');
    expect(config.BASE_RPC_URL).toMatch(/^https?:\/\//);
  });

  it('should export NODE_ENV with valid enum value', () => {
    expect(config.NODE_ENV).toBeDefined();
    expect(['development', 'production', 'test']).toContain(config.NODE_ENV);
  });

  it('should export LOG_LEVEL with valid enum value', () => {
    expect(config.LOG_LEVEL).toBeDefined();
    expect(['debug', 'info', 'warn', 'error']).toContain(config.LOG_LEVEL);
  });

  it('should optionally export WALLETCONNECT_PROJECT_ID', () => {
    // This can be undefined or a string
    if (config.WALLETCONNECT_PROJECT_ID !== undefined) {
      expect(typeof config.WALLETCONNECT_PROJECT_ID).toBe('string');
    }
  });
});
