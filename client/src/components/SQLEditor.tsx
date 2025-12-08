import { useState, useEffect } from 'react';
import { Play, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

type Status = 'idle' | 'signing' | 'fetching' | 'error' | 'success';

interface QueryResult {
  rows: unknown[];
  rowCount: number;
  estimatedCost: string;
  actualCost: string;
  executionTime: number;
  txHash?: string;
}

interface Provider {
  id: string;
  name: string;
  resourceName?: string;
  resourceDescription?: string;
  publisherType: 'database' | 'api' | 'both';
  pricePerCall?: string;
  categories?: string[];
}

export default function SQLEditor() {
  const [query, setQuery] = useState('SELECT * FROM vaults LIMIT 5');
  const [providerId, setProviderId] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [results, setResults] = useState<QueryResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // Fetch providers on component mount
  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const response = await axios.get<{
        success: boolean;
        providers?: Provider[];
        error?: string;
      }>('http://localhost:3000/api/providers');

      if (response.data.success && response.data.providers) {
        setProviders(response.data.providers);
        // Auto-select first provider if available and none is selected
        if (response.data.providers.length > 0 && !providerId) {
          setProviderId(response.data.providers[0].id);
        }
      } else {
        console.error('Failed to fetch providers:', response.data.error);
        setError('Failed to load providers. Please refresh the page.');
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
      setError('Failed to load providers. Please refresh the page.');
    } finally {
      setLoadingProviders(false);
    }
  };

  const executeQuery = async () => {
    if (!query.trim() || !providerId.trim()) {
      setError('Please provide both SQL query and Provider ID');
      setStatus('error');
      return;
    }

    setStatus('signing');
    setError(null);
    setResults(null);

    try {
      const response = await axios.post<{
        success: boolean;
        rows?: unknown[];
        rowCount?: number;
        estimatedCost?: string;
        actualCost?: string;
        executionTime?: number;
        txHash?: string;
        error?: string;
      }>('http://localhost:3000/api/execute-sql', {
        sql: query,
        providerId: providerId,
      });

      if (response.data.success) {
        setResults({
          rows: response.data.rows || [],
          rowCount: response.data.rowCount || 0,
          estimatedCost: response.data.estimatedCost || '0',
          actualCost: response.data.actualCost || '0',
          executionTime: response.data.executionTime || 0,
          txHash: response.data.txHash,
        });
        setStatus('success');
      } else {
        setError(response.data.error || 'Query execution failed');
        setStatus('error');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const errorMessage = err.response?.data?.error || err.message || 'Unknown error occurred';
        setError(errorMessage);
      } else {
        setError('Unknown error occurred');
      }
      setStatus('error');
    }
  };

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
        <div style={{ marginTop: '10px', color: '#6c757d', fontSize: '14px' }}>
          <p>Rows: {results.rowCount}</p>
          <p>Estimated Cost: {results.estimatedCost} USDC</p>
          <p>Actual Cost: {results.actualCost} USDC</p>
          <p>Execution Time: {results.executionTime}ms</p>
          {results.txHash && (
            <p>
              Transaction:{' '}
              <a
                href={`https://basescan.org/tx/${results.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#007bff', textDecoration: 'none' }}
              >
                {results.txHash.slice(0, 10)}...
              </a>
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor="providerId"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#495057' }}
          >
            Provider
          </label>
          {loadingProviders ? (
            <div style={{ 
              width: '100%', 
              padding: '10px', 
              border: '1px solid #ced4da', 
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#6c757d'
            }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Loading providers...</span>
            </div>
          ) : (
            <select
              id="providerId"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="">Select a provider...</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} {provider.resourceName ? `(${provider.resourceName})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            htmlFor="query"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#495057' }}
          >
            SQL Query
          </label>
          <textarea
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter SQL query"
            rows={8}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />
        </div>

        <button
          onClick={executeQuery}
          disabled={status === 'signing' || status === 'fetching'}
          style={{
            backgroundColor: status === 'signing' || status === 'fetching' ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: status === 'signing' || status === 'fetching' ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {(status === 'signing' || status === 'fetching') ? (
            <>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              {status === 'signing' ? 'Payment Required. Signing transaction...' : 'Executing Query...'}
            </>
          ) : (
            <>
              <Play size={20} />
              Run Query
            </>
          )}
        </button>

        {status === 'signing' && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              color: '#856404',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={20} />
            <span>Payment Required. Signing transaction...</span>
          </div>
        )}

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
            <span>Query executed successfully!</span>
          </div>
        )}

        {renderTable()}
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

