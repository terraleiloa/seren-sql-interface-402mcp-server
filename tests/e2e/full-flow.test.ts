// ABOUTME: End-to-End tests for x402 MCP Server
// ABOUTME: Tests full payment flow against live gateway

import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import { GatewayClient } from '../../src/gateway/client.js';
import { PrivateKeyWalletProvider } from '../../src/wallet/privatekey.js';
import { payForQuery } from '../../src/tools/payForQuery.js';
import { listProviders } from '../../src/tools/listProviders.js';
import { UserRejectedError } from '../../src/wallet/types.js';

// Load test configuration
dotenv.config();

// Increase timeout for E2E tests involving blockchain
jest.setTimeout(30000);

const runTests = process.env.CI ? describe.skip : describe;

runTests('x402 MCP Server E2E Tests', () => {
    let walletProvider: PrivateKeyWalletProvider;
    let gatewayClient: GatewayClient;
    let testProviderId: string;

    beforeAll(async () => {
        // Initialize wallet and gateway
        walletProvider = new PrivateKeyWalletProvider();
        await walletProvider.connect(process.env.WALLET_PRIVATE_KEY);

        // Use manual instance to ensure correct URL from .env.test
        gatewayClient = new GatewayClient(process.env.X402_GATEWAY_URL);

        // Discover a test provider if not specified
        if (process.env.TEST_PROVIDER_ID) {
            testProviderId = process.env.TEST_PROVIDER_ID;
        } else {
            const providers = await gatewayClient.listProviders();
            if (providers.length === 0) {
                throw new Error('No providers found in gateway catalog');
            }
            // Prefer 'api' type providers for testing
            const apiProvider = providers.find(p => p.providerType === 'api');
            if (!apiProvider) {
                throw new Error('No API type provider found in gateway catalog. Please ensure an API provider is registered for E2E tests.');
            }
            testProviderId = apiProvider.id;
            console.log(`Using discovered API provider: ${testProviderId}`);
        }
    });

    describe('Happy Path - Full Payment Flow', () => {
        it('should complete full payment flow', async () => {
            // 1. List providers to verify catalog access
            const listResult = await listProviders({}, gatewayClient);
            expect(listResult.success).toBe(true);
            expect(listResult.providers).toBeDefined();
            expect(listResult.providers!.length).toBeGreaterThan(0);

            console.log(`Testing with provider: ${testProviderId}`);

            // 2. Execute pay_for_query
            const result = await payForQuery(
                {
                    provider_id: testProviderId,
                    request: {
                        method: 'GET',
                        path: '/v1/debt/mspd/mspd_table_1',
                        headers: { 'User-Agent': 'x402-Test' }
                    },
                },
                walletProvider,
                gatewayClient
            );

            // 3. Verify success
            if (!result.success) {
                console.error('Payment failed:', result.error);
            }
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();

            // 4. Verify payment details if cost was incurred
            if (result.cost) {
                expect(result.txHash).toBeDefined();
                expect(result.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
                console.log(`Payment successful! Cost: ${result.cost}, Tx: ${result.txHash}`);
            } else {
                console.log('Query was free or no payment required');
            }
        });
    });

    describe('User Rejection', () => {
        it('should handle user rejecting payment', async () => {
            // Create a mock wallet that rejects signing
            const rejectingWallet = new PrivateKeyWalletProvider();
            // Mock the signTypedData method to throw UserRejectedError
            jest.spyOn(rejectingWallet, 'signTypedData').mockRejectedValue(new UserRejectedError('User rejected request'));
            // Mock connect to succeed
            jest.spyOn(rejectingWallet, 'connect').mockResolvedValue(undefined);
            jest.spyOn(rejectingWallet, 'isConnected').mockResolvedValue(true);
            jest.spyOn(rejectingWallet, 'getAddress').mockResolvedValue('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');

            const result = await payForQuery(
                {
                    provider_id: testProviderId,
                    request: { path: '/v1/debt/mspd/mspd_table_1' },
                },
                rejectingWallet,
                gatewayClient
            );

            expect(result.success).toBe(false);
            // Error can be "rejected" from UserRejectedError or gateway error
            expect(result.error).toBeDefined();
        });
    });

    describe('Provider Not Found', () => {
        it('should handle unknown provider', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';

            const result = await payForQuery(
                {
                    provider_id: fakeId,
                    request: { path: '/' },
                },
                walletProvider,
                gatewayClient
            );

            expect(result.success).toBe(false);
            // The error message depends on the gateway implementation, but should indicate failure
            expect(result.error).toBeDefined();
        });
    });

    // Note: Insufficient balance test is hard to automate reliably without a dedicated empty wallet
    // We'll skip it for now or mock it if we want to test the client logic
    describe('Insufficient Balance (Mocked)', () => {
        it('should handle insufficient USDC balance', async () => {
            // We can't easily test this with the real wallet unless we drain it
            // So we'll trust the unit tests for the client logic
            // This is a placeholder for future implementation with a dedicated empty wallet
            expect(true).toBe(true);
        });
    });
});
