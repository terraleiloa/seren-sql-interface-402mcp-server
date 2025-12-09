// ABOUTME: Express server for web-based SQL Editor interface
// ABOUTME: Exposes x402 payment logic via HTTP API

import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { SerenService } from './services/serenService.js';
import { z } from 'zod';
import pg from 'pg';

const app = express();

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

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

const executeDirectSqlSchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  connectionString: z.string().min(1, 'Connection string is required'),
});

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
    if (client) {
      try {
        await client.end();
      } catch (e) {
        console.error('Error closing pg client:', e);
      }
    }
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'seren-sql-api' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Seren SQL API server running on http://localhost:${PORT}`);
});

