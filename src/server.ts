// ABOUTME: Express server for web-based SQL Editor interface
// ABOUTME: Exposes x402 payment logic via HTTP API

import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { SerenService } from './services/serenService.js';
import { z } from 'zod';
import pg from 'pg';
import Database from 'better-sqlite3';

const app = express();

// Enable CORS for frontend
app.use(cors());
app.use(express.json({ limit: '10mb' }));  // Increase limit for embedding payloads

// Validate environment variables
const privateKey = process.env.WALLET_PRIVATE_KEY;
const gatewayUrl = config.X402_GATEWAY_URL;
const apiKey = process.env.SEREN_API_KEY;

if (!privateKey) {
  throw new Error('WALLET_PRIVATE_KEY environment variable is required');
}

// Warn if API key is missing (admin functions will fail)
if (!apiKey) {
  console.warn('⚠️  WARNING: SEREN_API_KEY is not set. Admin console functions will not work.');
}

// Initialize SerenService
const serenService = new SerenService(privateKey, gatewayUrl);

// Request validation schema
const executeSqlSchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  providerId: z.string().min(1, 'providerId is required'),
});

const executeAdminSqlSchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  publisherId: z.string().optional(),
});

const proxyApiSchema = z.object({
  publisherId: z.string().min(1, 'publisherId is required'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  path: z.string().min(1, 'path is required'),
  body: z.any().optional(),
  headers: z.record(z.string()).optional(),
});

const executeDirectSqlSchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  connectionString: z.string().min(1, 'Connection string is required'),
});

// SQLite connection storage (filepath -> database instance)
const sqliteConnections = new Map<string, Database.Database>();

// SQLite validation schemas
const sqliteConnectSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
});

const sqliteExecuteSchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  filePath: z.string().min(1, 'File path is required'),
});

/**
 * Helper function to safely close a PostgreSQL client connection
 * Ensures proper cleanup even if the client is in a partially connected state
 * Safe to call even if the client failed to connect or is already closed
 */
async function closePostgresClient(client: pg.Client | null): Promise<void> {
  if (!client) {
    return;
  }
  
  try {
    // client.end() is safe to call even if connection failed or is already closed
    // It will gracefully handle all states (not connected, connecting, connected, closing)
    await client.end();
  } catch (e) {
    // Log error but don't throw - cleanup should never fail the request
    console.error('Error closing pg client:', e);
  }
}

/**
 * POST /api/execute-sql
 * Execute a paid SQL query via x402 Gateway
 */
app.post('/api/execute-sql', async (req, res) => {
  try {
    // Validate request body
    const validationResult = executeSqlSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { sql, providerId } = validationResult.data;

    // Execute query using shared service
    const result = await serenService.executeQuery({ sql, providerId });

    if (result.success) {
      return res.status(200).json({
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        estimatedCost: result.estimatedCost,
        actualCost: result.actualCost,
        executionTime: result.executionTime,
        txHash: result.txHash,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Query execution failed',
      });
    }
  } catch (error) {
    console.error('Error executing SQL query:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * POST /api/direct/execute
 * Execute SQL directly against a connection string
 * Bypasses x402 payment flow
 */
app.post('/api/direct/execute', async (req, res) => {
  let client: pg.Client | null = null;
  try {
    // Validate request body
    const validationResult = executeDirectSqlSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { sql, connectionString } = validationResult.data;

    // Create new client for this request
    // Note: In production, you might want connection pooling, but for this tool
    // a single client per request is safer to ensure no leaked state
    client = new pg.Client({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    await client.connect();
    const startTime = Date.now();
    const result = await client.query(sql);
    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      rows: result.rows,
      rowCount: result.rowCount,
      executionTime,
    });
  } catch (error) {
    console.error('Error executing direct SQL:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    await closePostgresClient(client);
  }
});

/**
 * POST /api/admin/execute
 * Execute an admin SQL query using API key authentication
 * Bypasses x402 payment flow - allows DDL and DML operations
 */
app.post('/api/admin/execute', async (req, res) => {
  try {
    // Check if API key is configured
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Admin API key not configured. SEREN_API_KEY environment variable is required.',
      });
    }

    // Validate request body
    const validationResult = executeAdminSqlSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { sql, publisherId } = validationResult.data;

    // Execute admin query using shared service
    const result = await serenService.executeAdminQuery(sql, apiKey, publisherId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        estimatedCost: result.estimatedCost,
        actualCost: result.actualCost,
        executionTime: result.executionTime,
      });
    } else {
      // Log the error for debugging
      console.error('Admin query execution failed:', result.error);
      // Determine appropriate status code based on error
      const statusCode = result.error?.includes('authentication') || result.error?.includes('401') || result.error?.includes('403') ? 401 : 500;
      return res.status(statusCode).json({
        success: false,
        error: result.error || 'Query execution failed',
      });
    }
  } catch (error) {
    console.error('Error executing admin SQL query:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error details:', errorMessage);
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /api/admin/publisher
 * Get publisher information for the API key
 */
app.get('/api/admin/publisher', async (req, res) => {
  try {
    // Check if API key is configured
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Admin API key not configured. SEREN_API_KEY environment variable is required.',
      });
    }

    // Get publisher info using shared service
    const result = await serenService.getPublisherInfo(apiKey);

    if (result.success) {
      return res.status(200).json({
        success: true,
        publisher: result.publisher,
      });
    } else {
      const statusCode = result.error?.includes('authentication') ? 401 : 500;
      return res.status(statusCode).json({
        success: false,
        error: result.error || 'Failed to get publisher info',
      });
    }
  } catch (error) {
    console.error('Error getting publisher info:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/admin/tables
 * List all tables in the public schema
 */
app.get('/api/admin/tables', async (req, res) => {
  try {
    // Check if API key is configured
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Admin API key not configured. SEREN_API_KEY environment variable is required.',
      });
    }

    // List tables using shared service
    const result = await serenService.listTables(apiKey);

    if (result.success) {
      return res.status(200).json({
        success: true,
        tables: result.rows?.map((row) => (row as { table_name: string }).table_name) || [],
      });
    } else {
      const statusCode = result.error?.includes('authentication') ? 401 : 500;
      return res.status(statusCode).json({
        success: false,
        error: result.error || 'Failed to list tables',
      });
    }
  } catch (error) {
    console.error('Error listing tables:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * PATCH /api/admin/publisher/connection
 * Update publisher connection string
 */
app.patch('/api/admin/publisher/connection', async (req, res) => {
  try {
    // Check if API key is configured
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Admin API key not configured. SEREN_API_KEY environment variable is required.',
      });
    }

    // Validate request body
    const updateSchema = z.object({
      connectionString: z.string().min(1, 'Connection string is required'),
    });

    const validationResult = updateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { connectionString } = validationResult.data;

    // Update connection string using shared service
    const result = await serenService.updatePublisherConnection(connectionString, apiKey);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message || 'Connection string updated successfully',
      });
    } else {
      const statusCode = result.error?.includes('authentication') || result.error?.includes('401') || result.error?.includes('403') ? 401 : 500;
      return res.status(statusCode).json({
        success: false,
        error: result.error || 'Failed to update connection string',
      });
    }
  } catch (error) {
    console.error('Error updating publisher connection:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/admin/tables/:name
 * Get schema details for a specific table
 */
app.get('/api/admin/tables/:name', async (req, res) => {
  try {
    // Check if API key is configured
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Admin API key not configured. SEREN_API_KEY environment variable is required.',
      });
    }

    const tableName = req.params.name;
    // Get optional publisherId from query parameter
    const publisherId = req.query.publisherId as string | undefined;

    // Get table schema using shared service
    const result = await serenService.getTableSchema(tableName, apiKey, publisherId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        tableName,
        columns: result.rows || [],
      });
    } else {
      const statusCode = result.error?.includes('authentication') ? 401 : 500;
      return res.status(statusCode).json({
        success: false,
        error: result.error || 'Failed to get table schema',
      });
    }
  } catch (error) {
    console.error('Error getting table schema:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * POST /api/proxy
 * Execute a paid API request via x402 Gateway (for API-type publishers)
 * Handles the full 402 payment flow: request -> 402 -> sign -> retry
 */
app.post('/api/proxy', async (req, res) => {
  try {
    // Validate request body
    const validationResult = proxyApiSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { publisherId, method, path, body, headers } = validationResult.data;

    // Execute API call using shared service
    const result = await serenService.executeApiCall({
      publisherId,
      method,
      path,
      body,
      headers,
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.data,
        cost: result.cost,
        txHash: result.txHash,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'API call failed',
      });
    }
  } catch (error) {
    console.error('Error executing API proxy request:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/providers
 * List available providers/publishers from the gateway catalog
 * Optional query params: category, type (database|api|both)
 */
app.get('/api/providers', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const type = req.query.type as 'database' | 'api' | 'both' | undefined;

    const options: { category?: string; type?: 'database' | 'api' | 'both' } = {};
    if (category) options.category = category;
    if (type) options.type = type;

    const result = await serenService.listPublishers(options);

    if (result.success) {
      return res.status(200).json({
        success: true,
        providers: result.publishers || [],
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to list providers',
      });
    }
  } catch (error) {
    console.error('Error listing providers:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

// ==================== Credit Management Endpoints ====================

/**
 * GET /api/wallet
 * Get wallet address for the configured private key
 */
app.get('/api/wallet', async (req, res) => {
  try {
    const wallet = await serenService.getWalletProvider();
    const address = await wallet.getAddress();

    return res.status(200).json({
      success: true,
      address,
    });
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/credits/balance
 * Check prepaid credit balance for the wallet
 */
app.get('/api/credits/balance', async (req, res) => {
  try {
    const wallet = await serenService.getWalletProvider();
    const walletAddress = await wallet.getAddress();
    const gatewayClient = serenService.getGatewayClient();
    const creditBalance = await gatewayClient.getCreditBalance(walletAddress);

    return res.status(200).json({
      success: true,
      wallet: creditBalance.agentWallet,
      balance: creditBalance.balance,
      reserved: creditBalance.reserved,
      available: creditBalance.available,
    });
  } catch (error) {
    console.error('Error checking credit balance:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

// Validation schema for deposit
const depositSchema = z.object({
  amount: z.string().min(1, 'amount is required'),
});

/**
 * POST /api/credits/deposit
 * Deposit USDC to prepaid credit balance
 */
app.post('/api/credits/deposit', async (req, res) => {
  try {
    // Validate request body
    const validationResult = depositSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { amount } = validationResult.data;

    // Execute deposit using shared service
    const result = await serenService.depositCredits(amount);

    if (result.success) {
      return res.status(200).json({
        success: true,
        deposited: result.deposited,
        balance: result.balance,
        txHash: result.txHash,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Deposit failed',
      });
    }
  } catch (error) {
    console.error('Error depositing credits:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * Helper function to get or create SQLite connection
 */
function getSqliteConnection(filePath: string): Database.Database {
  if (!sqliteConnections.has(filePath)) {
    const db = new Database(filePath, {
      readonly: false,
      fileMustExist: filePath !== ':memory:'
    });
    sqliteConnections.set(filePath, db);
  }
  return sqliteConnections.get(filePath)!;
}

/**
 * Close a specific SQLite connection
 */
function closeSqliteConnection(filePath: string): void {
  const db = sqliteConnections.get(filePath);
  if (db) {
    try {
      db.close();
      sqliteConnections.delete(filePath);
      console.log(`Closed SQLite connection: ${filePath}`);
    } catch (error) {
      console.error(`Error closing SQLite connection ${filePath}:`, error);
    }
  }
}

/**
 * Close all SQLite connections
 */
function closeAllSqliteConnections(): void {
  console.log(`Closing ${sqliteConnections.size} SQLite connection(s)...`);
  for (const [filePath, db] of sqliteConnections.entries()) {
    try {
      db.close();
      console.log(`Closed SQLite connection: ${filePath}`);
    } catch (error) {
      console.error(`Error closing SQLite connection ${filePath}:`, error);
    }
  }
  sqliteConnections.clear();
}

/**
 * POST /api/sqlite/connect
 * Test SQLite connection
 */
app.post('/api/sqlite/connect', async (req, res) => {
  try {
    const validationResult = sqliteConnectSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { filePath } = validationResult.data;
    const db = getSqliteConnection(filePath);

    // Test query to verify connection
    const result = db.prepare('SELECT 1 as test').get();

    return res.status(200).json({
      success: true,
      message: 'Connection successful',
      filePath,
    });
  } catch (error) {
    console.error('Error connecting to SQLite:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * POST /api/sqlite/execute
 * Execute SQL query against SQLite database
 */
app.post('/api/sqlite/execute', async (req, res) => {
  try {
    const validationResult = sqliteExecuteSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { sql, filePath } = validationResult.data;
    const db = getSqliteConnection(filePath);

    const startTime = Date.now();
    const stmt = db.prepare(sql);

    let rows: unknown[];
    let rowCount: number;

    // Determine if this is a SELECT query or a modification query
    const trimmedSql = sql.trim().toUpperCase();
    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      rows = stmt.all();
      rowCount = rows.length;
    } else {
      const result = stmt.run();
      rowCount = result.changes;
      rows = [];
    }

    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      rows,
      rowCount,
      executionTime,
    });
  } catch (error) {
    console.error('Error executing SQLite query:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/sqlite/tables
 * List all tables in SQLite database
 */
app.get('/api/sqlite/tables', async (req, res) => {
  try {
    const filePath = req.query.filePath as string;
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath query parameter is required',
      });
    }

    const db = getSqliteConnection(filePath);
    const tables = db.prepare(`
      SELECT name, type 
      FROM sqlite_master 
      WHERE type IN ('table', 'view') 
        AND name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `).all();

    return res.status(200).json({
      success: true,
      tables,
    });
  } catch (error) {
    console.error('Error listing SQLite tables:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/sqlite/schema/:table
 * Get table schema with columns, types, constraints
 */
app.get('/api/sqlite/schema/:table', async (req, res) => {
  try {
    const filePath = req.query.filePath as string;
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath query parameter is required',
      });
    }

    const tableName = req.params.table;
    const db = getSqliteConnection(filePath);

    // Get column information
    const columns = db.prepare(`PRAGMA table_info('${tableName}')`).all();

    // Get table DDL
    const ddlResult = db.prepare(`
      SELECT sql 
      FROM sqlite_master 
      WHERE type='table' AND name=?
    `).get(tableName) as { sql: string } | undefined;

    return res.status(200).json({
      success: true,
      tableName,
      columns,
      ddl: ddlResult?.sql || '',
    });
  } catch (error) {
    console.error('Error getting SQLite table schema:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/sqlite/indexes/:table
 * Get indexes for a table
 */
app.get('/api/sqlite/indexes/:table', async (req, res) => {
  try {
    const filePath = req.query.filePath as string;
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath query parameter is required',
      });
    }

    const tableName = req.params.table;
    const db = getSqliteConnection(filePath);

    const indexes = db.prepare(`PRAGMA index_list('${tableName}')`).all();

    return res.status(200).json({
      success: true,
      indexes,
    });
  } catch (error) {
    console.error('Error getting SQLite indexes:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/sqlite/foreign-keys/:table
 * Get foreign key relationships
 */
app.get('/api/sqlite/foreign-keys/:table', async (req, res) => {
  try {
    const filePath = req.query.filePath as string;
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath query parameter is required',
      });
    }

    const tableName = req.params.table;
    const db = getSqliteConnection(filePath);

    const foreignKeys = db.prepare(`PRAGMA foreign_key_list('${tableName}')`).all();

    return res.status(200).json({
      success: true,
      foreignKeys,
    });
  } catch (error) {
    console.error('Error getting SQLite foreign keys:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/postgres/tables
 * List all tables in the public schema
 */
app.get('/api/postgres/tables', async (req, res) => {
  let client: pg.Client | null = null;
  try {
    const connectionString = req.query.connectionString as string;
    if (!connectionString) {
      return res.status(400).json({
        success: false,
        error: 'connectionString query parameter is required',
      });
    }

    client = new pg.Client({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    await client.connect();

    const result = await client.query(`
      SELECT 
        table_name as name,
        table_type as type
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    return res.status(200).json({
      success: true,
      tables: result.rows,
    });
  } catch (error) {
    console.error('Error listing PostgreSQL tables:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    await closePostgresClient(client);
  }
});

/**
 * GET /api/postgres/schema/:table
 * Get table schema with columns, types, constraints
 */
app.get('/api/postgres/schema/:table', async (req, res) => {
  let client: pg.Client | null = null;
  try {
    const connectionString = req.query.connectionString as string;
    if (!connectionString) {
      return res.status(400).json({
        success: false,
        error: 'connectionString query parameter is required',
      });
    }

    const tableName = req.params.table;

    client = new pg.Client({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    await client.connect();

    // Get column information
    const columnsResult = await client.query(`
      SELECT 
        column_name as name,
        data_type as type,
        is_nullable,
        column_default as dflt_value,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    // Get primary key information
    const pkResult = await client.query(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary
    `, [tableName]);

    const pkColumns = new Set(pkResult.rows.map(r => r.column_name));

    // Format columns to match SQLite structure
    const columns = columnsResult.rows.map((col, idx) => ({
      cid: idx,
      name: col.name,
      type: col.type,
      notnull: col.is_nullable === 'NO' ? 1 : 0,
      dflt_value: col.dflt_value,
      pk: pkColumns.has(col.name) ? 1 : 0,
    }));

    // Get DDL (simplified - just construct basic CREATE TABLE)
    const ddl = `CREATE TABLE ${tableName} (\n  ${columns.map(c =>
      `${c.name} ${c.type}${c.notnull ? ' NOT NULL' : ''}${c.pk ? ' PRIMARY KEY' : ''}`
    ).join(',\n  ')}\n);`;

    return res.status(200).json({
      success: true,
      tableName,
      columns,
      ddl,
    });
  } catch (error) {
    console.error('Error getting PostgreSQL table schema:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    await closePostgresClient(client);
  }
});

/**
 * GET /api/postgres/indexes/:table
 * Get indexes for a table
 */
app.get('/api/postgres/indexes/:table', async (req, res) => {
  let client: pg.Client | null = null;
  try {
    const connectionString = req.query.connectionString as string;
    if (!connectionString) {
      return res.status(400).json({
        success: false,
        error: 'connectionString query parameter is required',
      });
    }

    const tableName = req.params.table;

    client = new pg.Client({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    await client.connect();

    const result = await client.query(`
      SELECT
        i.relname as name,
        ix.indisunique as unique,
        ix.indisprimary as primary,
        array_agg(a.attname ORDER BY a.attnum) as columns
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relname = $1
      GROUP BY i.relname, ix.indisunique, ix.indisprimary
      ORDER BY i.relname
    `, [tableName]);

    const indexes = result.rows.map(idx => ({
      name: idx.name,
      unique: idx.unique ? 'YES' : 'NO',
      origin: idx.primary ? 'primary key' : 'index',
    }));

    return res.status(200).json({
      success: true,
      indexes,
    });
  } catch (error) {
    console.error('Error getting PostgreSQL indexes:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    await closePostgresClient(client);
  }
});

/**
 * GET /api/postgres/foreign-keys/:table
 * Get foreign key relationships
 */
app.get('/api/postgres/foreign-keys/:table', async (req, res) => {
  let client: pg.Client | null = null;
  try {
    const connectionString = req.query.connectionString as string;
    if (!connectionString) {
      return res.status(400).json({
        success: false,
        error: 'connectionString query parameter is required',
      });
    }

    const tableName = req.params.table;

    client = new pg.Client({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    await client.connect();

    const result = await client.query(`
      SELECT
        kcu.column_name as "from",
        ccu.table_name as "table",
        ccu.column_name as "to",
        rc.update_rule as on_update,
        rc.delete_rule as on_delete
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = $1
        AND tc.table_schema = 'public'
    `, [tableName]);

    return res.status(200).json({
      success: true,
      foreignKeys: result.rows,
    });
  } catch (error) {
    console.error('Error getting PostgreSQL foreign keys:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    await closePostgresClient(client);
  }
});

/**
 * GET /api/postgres/table-data/:table
 * Get paginated table data
 */
app.get('/api/postgres/table-data/:table', async (req, res) => {
  let client: pg.Client | null = null;
  try {
    const connectionString = req.query.connectionString as string;
    if (!connectionString) {
      return res.status(400).json({
        success: false,
        error: 'connectionString query parameter is required',
      });
    }

    const tableName = req.params.table;
    const limit = parseInt(req.query.limit as string) || 1000;

    client = new pg.Client({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    await client.connect();

    const startTime = Date.now();
    const result = await client.query(`SELECT * FROM "${tableName}" LIMIT $1`, [limit]);
    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      rows: result.rows,
      rowCount: result.rows.length,
      executionTime,
    });
  } catch (error) {
    console.error('Error getting PostgreSQL table data:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    await closePostgresClient(client);
  }
});

/**
 * DELETE /api/sqlite/close
 * Close a specific SQLite connection
 */
app.delete('/api/sqlite/close', async (req, res) => {
  try {
    const validationResult = sqliteConnectSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const { filePath } = validationResult.data;
    closeSqliteConnection(filePath);

    return res.status(200).json({
      success: true,
      message: 'Connection closed',
      filePath,
    });
  } catch (error) {
    console.error('Error closing SQLite connection:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'seren-sql-api' });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Seren SQL API server running on http://localhost:${PORT}`);
});

// Graceful shutdown handlers
function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Close all SQLite connections
  closeAllSqliteConnections();
  
  // Close the HTTP server
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  closeAllSqliteConnections();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, but log it
});

