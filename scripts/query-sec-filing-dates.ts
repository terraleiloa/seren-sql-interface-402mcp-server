#!/usr/bin/env node
// Script to query SEC Filings Intelligence database for count of filing dates

import { GatewayClient } from '../src/gateway/client.js';
import { queryDatabase } from '../src/tools/queryDatabase.js';
import { listPublishers } from '../src/tools/listPublishers.js';
import { PrivateKeyWalletProvider } from '../src/wallet/privatekey.js';
import { config } from '../src/config/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  try {
    // Initialize gateway client
    const gateway = new GatewayClient();
    
    // Step 1: Find the SEC Filings Intelligence publisher
    console.log('🔍 Searching for SEC Filings Intelligence publisher...');
    const publishersResult = await listPublishers(
      { category: 'finance', type: 'database' },
      gateway
    );

    if (!publishersResult.success || !publishersResult.publishers) {
      throw new Error('Failed to list publishers: ' + publishersResult.error);
    }

    // Find the SEC Filings Intelligence publisher
    const secPublisher = publishersResult.publishers.find(
      (p) => p.name?.toLowerCase().includes('sec') && 
             (p.name?.toLowerCase().includes('filing') || p.name?.toLowerCase().includes('edgar'))
    );

    if (!secPublisher) {
      console.log('Available finance database publishers:');
      publishersResult.publishers.forEach((p) => {
        console.log(`  - ${p.name} (${p.id})`);
      });
      throw new Error('SEC Filings Intelligence publisher not found');
    }

    console.log(`✅ Found publisher: ${secPublisher.name} (${secPublisher.id})`);

    // Step 2: Initialize wallet
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('WALLET_PRIVATE_KEY environment variable is required');
    }

    const wallet = new PrivateKeyWalletProvider();
    await wallet.connect(privateKey);
    console.log(`✅ Wallet connected: ${await wallet.getAddress()}`);

    // Step 3: Explore database schema to find the right table and column
    console.log('\n🔍 Exploring database schema...');
    const schemaQuery = `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name ILIKE '%date%' OR column_name ILIKE '%filing%')
      ORDER BY table_name, column_name
      LIMIT 20
    `;

    const schemaResult = await queryDatabase(
      {
        publisher_id: secPublisher.id,
        sql: schemaQuery,
      },
      wallet,
      gateway
    );

    if (!schemaResult.success) {
      console.error('❌ Failed to query schema:');
      console.error('Error details:');
      console.error(schemaResult.error);
      // Try a direct count query anyway
      console.log('\n📊 Attempting direct count query...');
    } else {
      console.log('📋 Available tables and columns:');
      if (schemaResult.rows && schemaResult.rows.length > 0) {
        schemaResult.rows.forEach((row: any) => {
          console.log(`  - ${row.table_name}.${row.column_name} (${row.data_type})`);
        });
      }
    }

    // Step 4: Query for count of filing dates
    // Based on SEC filings databases, the most common structure is a 'filings' table
    // with a 'filing_date' or 'date' column. We'll try the most likely query first.
    console.log('\n📊 Querying count of filing dates...');
    
    // Most likely query pattern for SEC filings
    const countSql = `
      SELECT COUNT(DISTINCT filing_date) as filing_date_count
      FROM filing
      WHERE filing_date IS NOT NULL
    `;

    const result = await queryDatabase(
      {
        publisher_id: secPublisher.id,
        sql: countSql,
      },
      wallet,
      gateway
    );

    if (result.success) {
      console.log('\n✅ Query successful!');
      console.log('📊 Results:');
      if (result.rows && result.rows.length > 0) {
        console.log(JSON.stringify(result.rows, null, 2));
        const firstRow = result.rows[0] as Record<string, unknown>;
        const count = firstRow?.filing_date_count || firstRow?.count;
        console.log(`\n📈 Total distinct filing dates: ${count}`);
      } else {
        console.log('No rows returned');
      }
      console.log(`\n💰 Estimated cost: ${result.estimatedCost || 'N/A'} USDC`);
      if (result.actualCost) {
        console.log(`💰 Actual cost: ${result.actualCost} USDC`);
      }
      console.log(`⏱️  Execution time: ${result.executionTime}ms`);
      if (result.txHash) {
        console.log(`🔗 Transaction hash: ${result.txHash}`);
      }
    } else {
      console.error('❌ Query failed:');
      console.error('Error details:');
      console.error(result.error);
      console.log('\n💡 Tip: The table/column names might be different.');
      console.log('   Try exploring the schema first or check the database documentation.');
    }
  } catch (error) {
    console.error('❌ Unexpected error occurred:');
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
      // Log any additional error properties
      const errorAny = error as any;
      if (errorAny.statusCode || errorAny.statusText || errorAny.errorBody) {
        console.error('\nAdditional error details:');
        if (errorAny.statusCode) {
          console.error(`  HTTP Status: ${errorAny.statusCode} ${errorAny.statusText || ''}`.trim());
        }
        if (errorAny.errorBody) {
          console.error(`  Error Body: ${JSON.stringify(errorAny.errorBody, null, 2)}`);
        }
      }
    } else {
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

main();

