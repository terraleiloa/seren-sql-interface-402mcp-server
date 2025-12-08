import { useState, useEffect } from 'react';
import { Play, Loader2, AlertCircle, CheckCircle2, RefreshCw, Database } from 'lucide-react';
import axios from 'axios';

type Status = 'idle' | 'executing' | 'error' | 'success';

interface AdminQueryResult {
  rows?: unknown[];
  rowCount?: number;
  estimatedCost?: string;
  actualCost?: string;
  executionTime?: number;
}

interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface Publisher {
  id: string;
  name: string;
  resourceName?: string;
  resourceDescription?: string;
  publisherType?: 'database' | 'api' | 'both';
}

export default function AdminConsole() {
  const [query, setQuery] = useState('');
  const [publisherId, setPublisherId] = useState('');
  const [results, setResults] = useState<AdminQueryResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<TableColumn[] | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [loadingPublisher, setLoadingPublisher] = useState(false);

  const executeQuery = async () => {
    if (!query.trim()) {
      setError('Please provide a SQL query');
      setStatus('error');
      setOutput('Error: Please provide a SQL query');
      return;
    }

    setStatus('executing');
    setError(null);
    setResults(null);
    setTableSchema(null);
    setSelectedTable(null);
    setOutput('Executing admin command...\n');

    try {
      const response = await axios.post<{
        success: boolean;
        rows?: unknown[];
        rowCount?: number;
        estimatedCost?: string;
        actualCost?: string;
        executionTime?: number;
        error?: string;
      }>('http://localhost:3000/api/admin/execute', {
        sql: query,
        ...(publisherId.trim() && { publisherId: publisherId.trim() }),
      });

      if (response.data.success) {
        const result = {
          rows: response.data.rows,
          rowCount: response.data.rowCount || 0,
          estimatedCost: response.data.estimatedCost || '0',
          actualCost: response.data.actualCost || '0',
          executionTime: response.data.executionTime || 0,
        };
        setResults(result);
        setStatus('success');
        
        // Build output message
        let outputMsg = `✓ Query executed successfully.\n`;
        if (result.rowCount !== undefined) {
          outputMsg += `Rows affected: ${result.rowCount}\n`;
        }
        if (result.executionTime !== undefined) {
          outputMsg += `Execution time: ${result.executionTime}ms\n`;
        }
        if (result.rows && result.rows.length > 0) {
          outputMsg += `\nReturned ${result.rows.length} row(s).\n`;
        }
        setOutput(outputMsg);
      } else {
        const errorMsg = response.data.error || 'Query execution failed';
        setError(errorMsg);
        setStatus('error');
        setOutput(`✗ Error: ${errorMsg}\n`);
      }
    } catch (err) {
      let errorMsg = 'Unknown error occurred';
      if (axios.isAxiosError(err)) {
        errorMsg = err.response?.data?.error || err.message || errorMsg;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      setError(errorMsg);
      setStatus('error');
      setOutput(`✗ Error: ${errorMsg}\n`);
    }
  };

  // Fetch publisher info and tables on component mount
  useEffect(() => {
    fetchPublisherInfo();
    fetchTables();
  }, []);

  const fetchPublisherInfo = async () => {
    setLoadingPublisher(true);
    try {
      const response = await axios.get<{
        success: boolean;
        publisher?: Publisher;
        error?: string;
      }>('http://localhost:3000/api/admin/publisher');

      if (response.data.success && response.data.publisher) {
        setPublisher(response.data.publisher);
        // Auto-fill publisherId if available and not already set
        if (response.data.publisher.id && !publisherId.trim()) {
          setPublisherId(response.data.publisher.id);
        }
      } else {
        console.error('Failed to fetch publisher info:', response.data.error);
      }
    } catch (err) {
      console.error('Error fetching publisher info:', err);
    } finally {
      setLoadingPublisher(false);
    }
  };

  const fetchTables = async () => {
    setLoadingTables(true);
    try {
      const params = publisherId.trim() ? { publisherId: publisherId.trim() } : {};
      const response = await axios.get<{
        success: boolean;
        tables?: string[];
        error?: string;
      }>('http://localhost:3000/api/admin/tables', { params });

      if (response.data.success && response.data.tables) {
        setTables(response.data.tables);
      } else {
        console.error('Failed to fetch tables:', response.data.error);
      }
    } catch (err) {
      console.error('Error fetching tables:', err);
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchTableSchema = async (tableName: string) => {
    setLoadingSchema(true);
    setSelectedTable(tableName);
    setTableSchema(null);
    setOutput('');
    setResults(null);
    setError(null);
    setStatus('idle');

    try {
      const params = publisherId.trim() ? { publisherId: publisherId.trim() } : {};
      const response = await axios.get<{
        success: boolean;
        tableName?: string;
        columns?: TableColumn[];
        error?: string;
      }>(`http://localhost:3000/api/admin/tables/${tableName}`, { params });

      if (response.data.success && response.data.columns) {
        setTableSchema(response.data.columns);
        setStatus('success');
        
        // Format schema output
        let schemaOutput = `Table: ${tableName}\n`;
        schemaOutput += '='.repeat(50) + '\n\n';
        schemaOutput += 'Column Name          | Type          | Nullable | Default\n';
        schemaOutput += '-'.repeat(70) + '\n';
        
        response.data.columns.forEach((col) => {
          const name = col.column_name.padEnd(20);
          const type = col.data_type.padEnd(13);
          const nullable = col.is_nullable.padEnd(8);
          const defaultVal = col.column_default || 'NULL';
          schemaOutput += `${name} | ${type} | ${nullable} | ${defaultVal}\n`;
        });
        
        setOutput(schemaOutput);
      } else {
        const errorMsg = response.data.error || 'Failed to fetch table schema';
        setError(errorMsg);
        setStatus('error');
        setOutput(`✗ Error: ${errorMsg}\n`);
      }
    } catch (err) {
      let errorMsg = 'Unknown error occurred';
      if (axios.isAxiosError(err)) {
        errorMsg = err.response?.data?.error || err.message || errorMsg;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      setError(errorMsg);
      setStatus('error');
      setOutput(`✗ Error: ${errorMsg}\n`);
    } finally {
      setLoadingSchema(false);
    }
  };

  const queryTable = (tableName: string) => {
    setQuery(`SELECT * FROM ${tableName} LIMIT 100;`);
    setOutput('');
    setError(null);
    setResults(null);
    setStatus('idle');
    setTableSchema(null);
  };

  const insertTemplate = (template: string) => {
    setQuery(template);
    setOutput('');
    setError(null);
    setResults(null);
    setStatus('idle');
    setTableSchema(null);
    setSelectedTable(null);
  };

  const templates = [
    {
      label: 'Create Table',
      sql: `CREATE TABLE new_table (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
    },
    {
      label: 'Insert Row',
      sql: `INSERT INTO table_name (column1, column2, column3)
VALUES ('value1', 'value2', 'value3');`,
    },
    {
      label: 'Update Row',
      sql: `UPDATE table_name
SET column1 = 'new_value', column2 = 'updated_value'
WHERE id = 1;`,
    },
    {
      label: 'Drop Table',
      sql: `DROP TABLE IF EXISTS table_name;`,
    },
  ];

  const renderTable = () => {
    if (!results || !results.rows || results.rows.length === 0) {
      return null;
    }

    const firstRow = results.rows[0] as Record<string, unknown>;
    const columns = Object.keys(firstRow);

    return (
      <div style={{ marginTop: '20px', overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #dee2e6',
                    fontWeight: '600',
                    color: '#495057',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.rows.map((row, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid #dee2e6',
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    style={{
                      padding: '12px',
                      color: '#212529',
                    }}
                  >
                    {String((row as Record<string, unknown>)[col] ?? 'null')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSchemaTable = () => {
    if (!tableSchema || tableSchema.length === 0) {
      return null;
    }

    return (
      <div style={{ marginTop: '20px', overflowX: 'auto' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h4 style={{ margin: 0, color: '#d4d4d4', fontSize: '16px' }}>
            Schema: {selectedTable}
          </h4>
          <button
            onClick={() => queryTable(selectedTable!)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Query Table
          </button>
        </div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#252526',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #3c3c3c',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#2d2d30' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #3c3c3c', fontWeight: '600', color: '#d4d4d4' }}>
                Column Name
              </th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #3c3c3c', fontWeight: '600', color: '#d4d4d4' }}>
                Type
              </th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #3c3c3c', fontWeight: '600', color: '#d4d4d4' }}>
                Nullable
              </th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #3c3c3c', fontWeight: '600', color: '#d4d4d4' }}>
                Default
              </th>
            </tr>
          </thead>
          <tbody>
            {tableSchema.map((col, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid #3c3c3c',
                }}
              >
                <td style={{ padding: '12px', color: '#d4d4d4', fontFamily: 'monospace' }}>
                  {col.column_name}
                </td>
                <td style={{ padding: '12px', color: '#d4d4d4' }}>
                  {col.data_type}
                </td>
                <td style={{ padding: '12px', color: '#d4d4d4' }}>
                  {col.is_nullable}
                </td>
                <td style={{ padding: '12px', color: '#d4d4d4', fontFamily: 'monospace' }}>
                  {col.column_default || 'NULL'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Left Sidebar - Templates and Schema */}
      <div
        style={{
          width: '280px',
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          height: 'fit-content',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Quick Actions Section */}
        <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#495057', fontSize: '18px' }}>
          Quick Actions
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {templates.map((template, idx) => (
            <button
              key={idx}
              onClick={() => insertTemplate(template.sql)}
              style={{
                padding: '10px 16px',
                backgroundColor: 'white',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '14px',
                color: '#495057',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#e9ecef';
                e.currentTarget.style.borderColor = '#007bff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
                e.currentTarget.style.borderColor = '#ced4da';
              }}
            >
              {template.label}
            </button>
          ))}
        </div>

        {/* Database Schema Section */}
        <div style={{ borderTop: '1px solid #dee2e6', paddingTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#495057', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} />
              Database Schema
            </h3>
            <button
              onClick={fetchTables}
              disabled={loadingTables}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                cursor: loadingTables ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                color: '#495057',
              }}
              title="Refresh table list"
            >
              <RefreshCw size={16} style={{ animation: loadingTables ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          {loadingTables ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#6c757d' }}>
              Loading tables...
            </div>
          ) : tables.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#6c757d', fontSize: '14px' }}>
              No tables found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {tables.map((table) => (
                <button
                  key={table}
                  onClick={() => fetchTableSchema(table)}
                  disabled={loadingSchema}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: selectedTable === table ? '#007bff' : 'white',
                    color: selectedTable === table ? 'white' : '#495057',
                    border: `1px solid ${selectedTable === table ? '#007bff' : '#ced4da'}`,
                    borderRadius: '4px',
                    cursor: loadingSchema ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={(e) => {
                    if (selectedTable !== table && !loadingSchema) {
                      e.currentTarget.style.backgroundColor = '#e9ecef';
                      e.currentTarget.style.borderColor = '#007bff';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (selectedTable !== table) {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.borderColor = '#ced4da';
                    }
                  }}
                >
                  {table}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Area - Console */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            backgroundColor: '#1e1e1e',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {/* Publisher Info Banner */}
          {loadingPublisher ? (
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              backgroundColor: '#2d2d30', 
              borderRadius: '4px',
              color: '#d4d4d4',
              fontSize: '14px'
            }}>
              Loading publisher information...
            </div>
          ) : publisher ? (
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              backgroundColor: '#2d2d30', 
              borderRadius: '4px',
              border: '1px solid #3c3c3c'
            }}>
              <div style={{ color: '#d4d4d4', fontSize: '14px', marginBottom: '4px' }}>
                <strong>BOB's ID:</strong> {publisher.name}
              </div>
              {publisher.id && (
                <div style={{ color: '#9cdcfe', fontSize: '12px', fontFamily: 'monospace' }}>
                  ID: {publisher.id}
                </div>
              )}
            </div>
          ) : null}

          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="admin-publisher-id"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '500',
                color: '#d4d4d4',
              }}
            >
              Publisher ID (Optional)
            </label>
            <input
              id="admin-publisher-id"
              type="text"
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              placeholder="Enter publisher ID if required by your database"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #3c3c3c',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'monospace',
                backgroundColor: '#252526',
                color: '#d4d4d4',
                marginBottom: '16px',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="admin-query"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '500',
                color: '#d4d4d4',
              }}
            >
              SQL Console (Admin Mode)
            </label>
            <textarea
              id="admin-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter SQL command (CREATE, INSERT, UPDATE, DROP, etc.)"
              rows={12}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #3c3c3c',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'monospace',
                backgroundColor: '#252526',
                color: '#d4d4d4',
                resize: 'vertical',
              }}
            />
          </div>

          <button
            onClick={executeQuery}
            disabled={status === 'executing'}
            style={{
              backgroundColor: status === 'executing' ? '#6c757d' : '#dc3545',
              color: 'white',
              border: '2px solid',
              borderColor: status === 'executing' ? '#6c757d' : '#dc3545',
              padding: '12px 24px',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: status === 'executing' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {status === 'executing' ? (
              <>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                Executing Admin Command...
              </>
            ) : (
              <>
                <Play size={20} />
                Execute Admin Command
              </>
            )}
          </button>

          {/* Output Console */}
          <div style={{ marginTop: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '500',
                color: '#d4d4d4',
              }}
            >
              Output Console
            </label>
            <div
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '12px',
                border: '1px solid #3c3c3c',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'monospace',
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                whiteSpace: 'pre-wrap',
                overflowY: 'auto',
                maxHeight: '300px',
              }}
            >
              {output || 'Ready. Enter a SQL command and click Execute.'}
            </div>
          </div>

          {/* Status Messages */}
          {status === 'error' && error && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#f8d7da',
                border: '1px solid #dc3545',
                borderRadius: '4px',
                color: '#721c24',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {status === 'success' && results && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#d4edda',
                border: '1px solid #28a745',
                borderRadius: '4px',
                color: '#155724',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={20} />
              <span>Command executed successfully!</span>
            </div>
          )}

          {renderTable()}
          {renderSchemaTable()}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

