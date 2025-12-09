import { useState } from 'react';
import { Play, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

type Status = 'idle' | 'fetching' | 'error' | 'success';

interface QueryResult {
    rows: unknown[];
    rowCount: number;
    executionTime: number;
}

export default function DirectConnection() {
    const [query, setQuery] = useState('SELECT * FROM agent_datasources LIMIT 5');
    const [connectionString, setConnectionString] = useState('');
    const [results, setResults] = useState<QueryResult | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);

    const executeQuery = async () => {
        if (!query.trim() || !connectionString.trim()) {
            setError('Please provide both SQL query and Connection String');
            setStatus('error');
            return;
        }

        setStatus('fetching');
        setError(null);
        setResults(null);

        try {
            const response = await axios.post<{
                success: boolean;
                rows?: unknown[];
                rowCount?: number;
                executionTime?: number;
                error?: string;
            }>('http://localhost:3000/api/direct/execute', {
                sql: query,
                connectionString,
            });

            if (response.data.success) {
                setResults({
                    rows: response.data.rows || [],
                    rowCount: response.data.rowCount || 0,
                    executionTime: response.data.executionTime || 0,
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
                    <p>Execution Time: {results.executionTime}ms</p>
                </div>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <div style={{ marginBottom: '20px' }}>
                    <label
                        htmlFor="connectionString"
                        style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#495057' }}
                    >
                        Connection String
                    </label>
                    <input
                        id="connectionString"
                        type="password"
                        value={connectionString}
                        onChange={(e) => setConnectionString(e.target.value)}
                        placeholder="postgresql://user:password@host:port/database"
                        style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontFamily: 'monospace',
                        }}
                    />
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
                    disabled={status === 'fetching'}
                    style={{
                        backgroundColor: status === 'fetching' ? '#6c757d' : '#28a745',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '4px',
                        fontSize: '16px',
                        fontWeight: '500',
                        cursor: status === 'fetching' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    {status === 'fetching' ? (
                        <>
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            Executing Query...
                        </>
                    ) : (
                        <>
                            <Play size={20} />
                            Run Query
                        </>
                    )}
                </button>

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
